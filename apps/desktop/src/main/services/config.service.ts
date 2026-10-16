import { app } from 'electron';
import { join } from 'path';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import type { AppSettings, AppearanceSettings, Bookmark, Space } from '@explore/shared';
import type { Service, ServiceContainer } from '../service-container';

const CONFIG_FILENAME = 'config.json';
const BOOKMARKS_FILENAME = 'bookmarks.json';
const PINNED_TABS_FILENAME = 'pinned-tabs.json';
const SPACES_FILENAME = 'spaces.json';
const BACKUP_DIRNAME = 'backups';
const MAX_SPACE_BACKUPS = 20;

interface PinnedTabsData {
  left: { path: string; label: string }[];
  right: { path: string; label: string }[];
}

function defaultIndexPaths(): string[] {
  try {
    return [app.getPath('desktop'), app.getPath('documents'), app.getPath('downloads')].filter((p) =>
      existsSync(p),
    );
  } catch {
    return [];
  }
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isSpaceArray(value: unknown): value is Space[] {
  if (!Array.isArray(value)) return false;
  const ids = new Set<string>();
  return value.every((space) => {
    if (!space || typeof space !== 'object') return false;
    const item = space as Space;
    const valid =
      typeof item.id === 'string' &&
      item.id.length > 0 &&
      !ids.has(item.id) &&
      typeof item.name === 'string' &&
      (item.pinned === undefined || typeof item.pinned === 'boolean') &&
      (item.lastOpenedAt === undefined ||
        (typeof item.lastOpenedAt === 'number' && Number.isFinite(item.lastOpenedAt))) &&
      isPanelSnapshot(item.left) &&
      isPanelSnapshot(item.right);
    if (valid) ids.add(item.id);
    return valid;
  });
}

function isPanelSnapshot(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const panel = value as Space['left'];
  return (
    (panel.path === null || typeof panel.path === 'string') &&
    (panel.activeTabId == null || typeof panel.activeTabId === 'string') &&
    (panel.activeTabPath == null || typeof panel.activeTabPath === 'string') &&
    (panel.activeTabIndex === undefined ||
      (Number.isInteger(panel.activeTabIndex) && panel.activeTabIndex >= -1)) &&
    Array.isArray(panel.tabs) &&
    panel.tabs.every(
      (tab) =>
        tab &&
        typeof tab === 'object' &&
        typeof tab.path === 'string' &&
        typeof tab.label === 'string' &&
        (tab.initialPath === undefined || typeof tab.initialPath === 'string') &&
        (tab.pinned === undefined || typeof tab.pinned === 'boolean'),
    )
  );
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

const DEFAULT_SETTINGS: AppSettings = {
  indexPaths: [], // 运行时通过 init() 填充
  excludePatterns: ['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information'],
  showHiddenFiles: false,
  launcherHotkey: 'Alt+Space',
  fulltextMaxResults: 500,
  theme: 'grafana',
  fontScale: 130,
  layoutMode: 'dual',
};

export class ConfigService implements Service {
  private configDir!: string;
  private settings!: AppSettings;
  private bookmarks!: Bookmark[];
  private pinnedTabs!: PinnedTabsData;
  private spaces!: Space[];
  private spacesLoadFailed = false;
  private spacesFileExisted = false;

  init(): void {
    this.configDir = join(app.getPath('userData'), 'config');
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    console.log(`[config] dir: ${this.configDir}`);
    const saved = this.loadJSON<Partial<AppSettings> | null>(CONFIG_FILENAME, {}) ?? {};
    this.settings = {
      ...DEFAULT_SETTINGS,
      indexPaths: stringArray(saved.indexPaths) ? [...saved.indexPaths] : defaultIndexPaths(),
      excludePatterns: stringArray(saved.excludePatterns)
        ? [...saved.excludePatterns]
        : [...DEFAULT_SETTINGS.excludePatterns],
      showHiddenFiles:
        typeof saved.showHiddenFiles === 'boolean' ? saved.showHiddenFiles : DEFAULT_SETTINGS.showHiddenFiles,
      launcherHotkey:
        typeof saved.launcherHotkey === 'string' && saved.launcherHotkey
          ? saved.launcherHotkey
          : DEFAULT_SETTINGS.launcherHotkey,
      fulltextMaxResults:
        Number.isInteger(saved.fulltextMaxResults) && saved.fulltextMaxResults! > 0
          ? saved.fulltextMaxResults!
          : DEFAULT_SETTINGS.fulltextMaxResults,
      theme: typeof saved.theme === 'string' && saved.theme ? saved.theme : DEFAULT_SETTINGS.theme,
      fontScale:
        typeof saved.fontScale === 'number' && saved.fontScale >= 80 && saved.fontScale <= 250
          ? saved.fontScale
          : DEFAULT_SETTINGS.fontScale,
      layoutMode: saved.layoutMode === 'single' ? 'single' : 'dual',
    };
    this.bookmarks = this.loadJSON('bookmarks.json', []);
    this.pinnedTabs = this.loadJSON(PINNED_TABS_FILENAME, { left: [], right: [] });
    this.spaces = this.loadSpaces();
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    const next = { ...this.settings, ...patch };
    this.saveJSON(CONFIG_FILENAME, next);
    this.settings = next;
  }

  getAppearance(): AppearanceSettings {
    const { theme, fontScale, layoutMode } = this.settings;
    return { theme, fontScale, layoutMode };
  }

  async saveAppearance(value: AppearanceSettings): Promise<void> {
    if (
      !value ||
      typeof value.theme !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,40}$/.test(value.theme) ||
      !Number.isFinite(value.fontScale) ||
      value.fontScale < 80 ||
      value.fontScale > 250 ||
      (value.layoutMode !== 'single' && value.layoutMode !== 'dual')
    ) {
      throw new Error('外观设置无效');
    }
    await this.updateSettings({
      theme: value.theme,
      fontScale: value.fontScale,
      layoutMode: value.layoutMode,
    });
  }

  getBookmarks(): Bookmark[] {
    return [...this.bookmarks].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  addBookmark(b: Bookmark): void {
    this.bookmarks.push(b);
    this.saveJSON(BOOKMARKS_FILENAME, this.bookmarks);
  }

  removeBookmark(id: string): void {
    this.bookmarks = this.bookmarks.filter((b) => b.id !== id);
    this.saveJSON(BOOKMARKS_FILENAME, this.bookmarks);
  }

  updateBookmark(id: string, updates: Partial<Bookmark>): void {
    const idx = this.bookmarks.findIndex((b) => b.id === id);
    if (idx !== -1) {
      Object.assign(this.bookmarks[idx], updates);
      this.saveJSON(BOOKMARKS_FILENAME, this.bookmarks);
    }
  }

  getPinnedTabs(): PinnedTabsData {
    return this.pinnedTabs;
  }

  savePinnedTabs(side: 'left' | 'right', tabs: { path: string; label: string }[]): void {
    this.pinnedTabs[side] = tabs;
    this.saveJSON(PINNED_TABS_FILENAME, this.pinnedTabs);
  }

  getSpaces(): Space[] {
    if (this.spacesLoadFailed) this.spaces = this.loadSpaces();
    if (this.spacesLoadFailed) throw new Error('工作空间配置损坏或无法读取，请恢复配置后重试');
    return this.spaces;
  }

  saveSpaces(spaces: Space[]): void {
    if (!isSpaceArray(spaces)) {
      throw new Error('Invalid spaces payload');
    }
    if (this.spacesLoadFailed) {
      throw new Error('Refusing to overwrite spaces because the existing file could not be loaded');
    }
    if (this.isSuspiciousSpaceReset(spaces)) {
      this.backupFile(SPACES_FILENAME, 'blocked-reset');
      throw new Error('Refusing to replace existing spaces with a new default space');
    }
    this.saveJSON(SPACES_FILENAME, spaces, { backup: true });
    this.spaces = spaces;
    this.spacesFileExisted = true;
  }

  private loadJSON<T>(filename: string, fallback: T): T {
    const filepath = join(this.configDir, filename);
    try {
      return JSON.parse(readFileSync(filepath, 'utf-8')) as T;
    } catch {
      return fallback;
    }
  }

  private loadSpaces(): Space[] {
    const filepath = join(this.configDir, SPACES_FILENAME);
    this.spacesFileExisted = existsSync(filepath);

    if (!this.spacesFileExisted) {
      this.spacesLoadFailed = false;
      const backup = this.loadLatestBackup(SPACES_FILENAME);
      if (backup) return backup;
      return [];
    }

    try {
      const parsed = JSON.parse(readFileSync(filepath, 'utf-8')) as unknown;
      if (!isSpaceArray(parsed)) {
        throw new Error('spaces.json does not contain a valid space array');
      }
      this.spacesLoadFailed = false;
      return parsed;
    } catch (err) {
      this.spacesLoadFailed = true;
      try {
        this.backupFile(SPACES_FILENAME, 'invalid');
      } catch {
        /* Preserve the load error if the disk is unavailable. */
      }
      const backup = this.loadLatestBackup(SPACES_FILENAME);
      if (backup) {
        this.spacesLoadFailed = false;
        return backup;
      }
      console.error('[config] failed to load spaces.json', err);
      return [];
    }
  }

  private saveJSON(filename: string, data: unknown, options: { backup?: boolean } = {}): void {
    const filepath = join(this.configDir, filename);
    if (options.backup) {
      this.backupFile(filename);
    }
    const tempPath = `${filepath}.${process.pid}.${Date.now()}.tmp`;
    try {
      writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      renameSync(tempPath, filepath);
    } finally {
      if (existsSync(tempPath)) {
        try {
          unlinkSync(tempPath);
        } catch {
          /* Best-effort cleanup of our own temporary file. */
        }
      }
    }
  }

  private backupFile(filename: string, reason = 'autosave'): void {
    const source = join(this.configDir, filename);
    if (!existsSync(source)) return;

    const backupDir = join(this.configDir, BACKUP_DIRNAME);
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }

    const backupName = `${filename}.${timestampForFilename()}.${reason}.bak`;
    copyFileSync(source, join(backupDir, backupName));
    this.pruneBackups(filename);
  }

  private loadLatestBackup(filename: string): Space[] | null {
    const backupDir = join(this.configDir, BACKUP_DIRNAME);
    if (!existsSync(backupDir)) return null;

    const candidates = readdirSync(backupDir)
      .filter((name) => name.startsWith(`${filename}.`) && name.endsWith('.bak'))
      .sort()
      .reverse();

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(readFileSync(join(backupDir, candidate), 'utf-8')) as unknown;
        if (isSpaceArray(parsed)) return parsed;
      } catch {
        // Try the next backup.
      }
    }
    return null;
  }

  private pruneBackups(filename: string): void {
    const backupDir = join(this.configDir, BACKUP_DIRNAME);
    if (!existsSync(backupDir)) return;

    const backups = readdirSync(backupDir)
      .filter((name) => name.startsWith(`${filename}.`) && name.endsWith('.bak'))
      .sort()
      .reverse();

    for (const stale of backups.slice(MAX_SPACE_BACKUPS)) {
      try {
        unlinkSync(join(backupDir, stale));
      } catch {
        // Best-effort cleanup only.
      }
    }
  }

  private isSuspiciousSpaceReset(nextSpaces: Space[]): boolean {
    if (!this.spacesFileExisted || this.spaces.length <= 1 || nextSpaces.length !== 1) return false;
    const only = nextSpaces[0];
    const existedBefore = this.spaces.some((space) => space.id === only.id);
    return !existedBefore && only.name === 'Default';
  }
}
