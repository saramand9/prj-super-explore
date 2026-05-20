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
import type { AppSettings, Bookmark, Space } from '@explore/shared';
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
    return [
      app.getPath('desktop'),
      app.getPath('documents'),
      app.getPath('downloads'),
    ].filter((p) => existsSync(p));
  } catch {
    return [];
  }
}

function timestampForFilename(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function isSpaceArray(value: unknown): value is Space[] {
  if (!Array.isArray(value)) return false;
  return value.every((space) => {
    const item = space as Partial<Space>;
    return (
      typeof item.id === 'string' &&
      typeof item.name === 'string' &&
      !!item.left &&
      !!item.right &&
      Array.isArray(item.left.tabs) &&
      Array.isArray(item.right.tabs)
    );
  });
}

const DEFAULT_SETTINGS: AppSettings = {
  indexPaths: [], // 运行时通过 init() 填充
  excludePatterns: ['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information'],
  showHiddenFiles: false,
  launcherHotkey: 'Alt+Space',
  fulltextMaxResults: 500,
  theme: 'dark',
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
    this.settings = this.loadJSON('config.json', DEFAULT_SETTINGS);
    this.bookmarks = this.loadJSON('bookmarks.json', []);
    this.pinnedTabs = this.loadJSON(PINNED_TABS_FILENAME, { left: [], right: [] });
    this.spaces = this.loadSpaces();

    // 首次运行：填充默认索引路径
    if (this.settings.indexPaths.length === 0) {
      this.settings.indexPaths = defaultIndexPaths();
    }
  }

  getSettings(): AppSettings {
    return this.settings;
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    Object.assign(this.settings, patch);
    this.saveJSON(CONFIG_FILENAME, this.settings);
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
    this.spaces = spaces;
    this.saveJSON(SPACES_FILENAME, this.spaces, { backup: true });
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
      const backup = this.loadLatestBackup(SPACES_FILENAME);
      if (backup) return backup;
      return [];
    }

    try {
      const parsed = JSON.parse(readFileSync(filepath, 'utf-8')) as unknown;
      if (!isSpaceArray(parsed)) {
        throw new Error('spaces.json does not contain a valid space array');
      }
      return parsed;
    } catch (err) {
      this.spacesLoadFailed = true;
      this.backupFile(SPACES_FILENAME, 'invalid');
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
    writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    renameSync(tempPath, filepath);
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
