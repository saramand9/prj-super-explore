import { app } from 'electron';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { AppSettings, Bookmark } from '@explore/shared';
import type { Service, ServiceContainer } from '../service-container';

const CONFIG_FILENAME = 'config.json';
const BOOKMARKS_FILENAME = 'bookmarks.json';
const PINNED_TABS_FILENAME = 'pinned-tabs.json';

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

  init(): void {
    this.configDir = join(app.getPath('userData'), 'config');
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
    this.settings = this.loadJSON('config.json', DEFAULT_SETTINGS);
    this.bookmarks = this.loadJSON('bookmarks.json', []);
    this.pinnedTabs = this.loadJSON(PINNED_TABS_FILENAME, { left: [], right: [] });

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

  private loadJSON<T>(filename: string, fallback: T): T {
    const filepath = join(this.configDir, filename);
    try {
      return JSON.parse(readFileSync(filepath, 'utf-8')) as T;
    } catch {
      return fallback;
    }
  }

  private saveJSON(filename: string, data: unknown): void {
    const filepath = join(this.configDir, filename);
    writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
