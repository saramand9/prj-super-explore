/**
 * IPC 协议定义
 *
 * 请求-响应模式：渲染进程 invoke → 主进程 handle
 * 事件推送模式：主进程 → 渲染进程 on
 */

import type { FileConflictStrategy, FileEntry, FileOpResult, FileStat, SortConfig } from './file';
import type { Bookmark } from './config';
import type { Space } from './config';
import type { PluginInfo, PluginManifest } from './plugin';
import type { UpdateState } from './update';

export type IpcErrorCode =
  | 'FILE_NOT_FOUND'
  | 'PERMISSION_DENIED'
  | 'PATH_TOO_LONG'
  | 'FILE_TOO_LARGE'
  | 'INVALID_ENCODING'
  | 'IS_DIRECTORY'
  | 'WATCH_FAILED'
  | 'PROCESS_FAILED'
  | 'IPC_BRIDGE_MISSING'
  | 'INVALID_REQUEST'
  | 'UNKNOWN';

export interface IpcErrorInfo {
  code: IpcErrorCode;
  message: string;
  channel?: string;
  nativeCode?: string;
  path?: string;
  details?: string;
}

export interface FileReadResult {
  content: string;
  size: number;
  bytesRead: number;
  partial?: boolean;
  limit?: number;
  canContinue?: boolean;
}

// ── 请求-响应 channels ──────────────────────────

export interface IpcChannels {
  'update:getState': { req: void; res: UpdateState };
  'update:check': { req: void; res: UpdateState };
  'update:download': { req: void; res: UpdateState };
  'update:install': { req: void; res: UpdateState };
  'update:resolveSave': { req: { requestId: number; allow: boolean }; res: void };
  // File operations
  'file:readDir': {
    req: { path: string; sort?: SortConfig; showHidden?: boolean };
    res: FileEntry[];
  };
  'file:stat': {
    req: { path: string };
    res: FileStat | null;
  };
  'file:copy': {
    req: {
      sources: string[];
      destDir: string;
      conflictStrategy?: FileConflictStrategy;
      operationId?: string;
    };
    res: FileOpResult;
  };
  'file:move': {
    req: {
      sources: string[];
      destDir: string;
      conflictStrategy?: FileConflictStrategy;
      operationId?: string;
    };
    res: FileOpResult;
  };
  'file:delete': {
    req: { paths: string[]; permanent?: boolean; operationId?: string };
    res: FileOpResult;
  };
  'file:cancelOperation': {
    req: { operationId: string };
    res: { cancelled: boolean };
  };
  'file:mkdir': {
    req: { parentPath: string; name: string };
    res: { success: boolean; path?: string; error?: string };
  };
  'file:create': {
    req: { parentPath: string; name: string };
    res: { success: boolean; path?: string; error?: string };
  };
  'file:rename': {
    req: { path: string; newName: string };
    res: { success: boolean; newPath?: string; error?: string };
  };
  'file:exists': {
    req: { path: string };
    res: boolean;
  };
  'file:open': {
    req: { path: string };
    res: void;
  };
  'file:read': {
    req: { path: string; maxSize?: number; loadFull?: boolean };
    res: FileReadResult;
  };
  'file:openInExplorer': {
    req: { path: string };
    res: void;
  };
  'file:showItemInFolder': {
    req: { path: string };
    res: void;
  };

  // File watching
  'file:watch': {
    req: { path: string };
    res: string; // watcherId
  };
  'file:unwatch': {
    req: { watcherId: string };
    res: void;
  };

  // 单文件变更监听（tail -f）
  'file:watchFile': {
    req: { path: string };
    res: void;
  };
  'file:unwatchFile': {
    req: { path: string };
    res: void;
  };

  // Recursive directory walk for search index
  'file:walkTree': {
    req: { path: string; maxDepth?: number; excludePatterns?: string[] };
    res: FileEntry[];
  };
  'file:scan': {
    req: { path: string; scanId: string; maxDepth?: number; excludePatterns?: string[] };
    res: ScanSummary;
  };
  'file:cancelScan': {
    req: { scanId: string };
    res: void;
  };

  // 批量目录大小计算（递归，带缓存）
  'file:dirSizes': {
    req: { paths: string[] };
    res: Record<string, DirSizeResult>;
  };

  // Search
  'search:fulltext': {
    req: {
      dir: string;
      query: string;
      searchId?: string;
      filePattern?: string;
      excludePatterns?: string[];
      maxResults?: number;
      maxFileSize?: string;
    };
    res: FulltextMatch[];
  };
  'search:cancel': {
    req: { searchId: string };
    res: void;
  };
  'search:run': {
    req: IpcChannels['search:fulltext']['req'] & { searchId: string };
    res: SearchResult;
  };

  // Index (filename index for quick launcher)
  'index:query': {
    req: { pattern: string; maxResults?: number; includePaths?: string[] };
    res: IndexResult[];
  };
  'index:rebuild': {
    req: { paths: string[] };
    res: { itemCount: number };
  };
  'index:status': {
    req: void;
    res: { ready: boolean; itemCount: number; indexing: boolean };
  };

  // Bookmarks
  'bookmark:list': {
    req: void;
    res: Bookmark[];
  };
  'bookmark:add': {
    req: Bookmark;
    res: void;
  };
  'bookmark:remove': {
    req: { id: string };
    res: void;
  };
  'bookmark:update': {
    req: { id: string; updates: Partial<Bookmark> };
    res: void;
  };

  // Pinned tabs persistence
  'tabs:load': {
    req: void;
    res: {
      left: { path: string; label: string; initialPath: string }[];
      right: { path: string; label: string; initialPath: string }[];
    };
  };
  'tabs:save': {
    req: { side: 'left' | 'right'; tabs: { path: string; label: string; initialPath: string }[] };
    res: void;
  };

  // Spaces
  'space:list': {
    req: void;
    res: Space[];
  };
  'space:save': {
    req: { spaces: Space[] };
    res: void;
  };

  // Plugins
  'plugin:scanExternal': {
    req: void;
    res: { pluginId: string; pluginPath: string }[];
  };
  'plugin:readFile': {
    req: { pluginId: string; file: string };
    res: string;
  };
  'plugin:install': {
    req: { sourcePath: string };
    res: { success: boolean; pluginId?: string; error?: string };
  };

  // Window
  'window:readyForClose': {
    req: void;
    res: void;
  };
  'window:resolveClose': {
    req: { allow: boolean; requestId: number };
    res: void;
  };
  'window:closePending': {
    req: { requestId: number };
    res: void;
  };
  'window:toggleLauncher': {
    req: void;
    res: void;
  };

  // Dialogs
  'dialog:openFolder': {
    req: { defaultPath?: string };
    res: string | null;
  };
  'dialog:confirm': {
    req: { title?: string; message: string };
    res: boolean;
  };
  'dialog:alert': {
    req: { title?: string; message: string; type?: 'info' | 'warning' | 'error' };
    res: void;
  };
  'dialog:choice': {
    req: {
      title?: string;
      message: string;
      buttons: { id: string; label: string }[];
      defaultId?: string;
      cancelId?: string;
      type?: 'none' | 'info' | 'error' | 'question' | 'warning';
    };
    res: string | null;
  };
  'dialog:prompt': {
    req: { title?: string; message: string; defaultValue?: string };
    res: string | null;
  };

  // App
  'settings:getAppearance': {
    req: void;
    res: import('./config').AppearanceSettings;
  };
  'settings:saveAppearance': {
    req: import('./config').AppearanceSettings;
    res: void;
  };
  'app:getVersion': {
    req: void;
    res: string;
  };
  'app:reportError': {
    req: { source: string; message: string; stack?: string };
    res: void;
  };
  'app:copyDiagnostics': {
    req: { source?: string; message?: string; stack?: string };
    res: void;
  };
  'app:openLogs': {
    req: void;
    res: void;
  };
  'app:getPlatform': {
    req: void;
    res: NodeJS.Platform;
  };
  'app:getHomeDir': {
    req: void;
    res: string;
  };
}

// ── 事件推送 channels (main → renderer) ─────────

export interface IpcEvents {
  'update:stateChanged': UpdateState;
  'update:beforeInstall': { requestId: number };
  'window:beforeClose': { requestId: number };
  'window:closeCancelled': { requestId: number };
  'file:scanProgress': ScanSummary & { scanId: string; entries: FileEntry[] };
  'search:progress': { searchId: string; matches: FulltextMatch[]; total: number };
  'fs:changed': {
    watcherId: string;
    events: Array<{ type: 'add' | 'remove' | 'change'; path: string }>;
  };
  'fs:watchError': {
    watcherId: string;
    path: string;
    error: IpcErrorInfo;
  };
  'index:progress': {
    done: number;
    total: number;
  };
  'index:ready': {
    itemCount: number;
  };
  'launcher:show': void;
  'launcher:hide': void;
  'navigation:command': {
    action: 'back' | 'forward';
    source: 'app-command';
  };
  'file:dirSizeUpdate': {
    path: string;
    size: number;
    partial?: boolean;
  };
  'file:contentChanged': {
    filePath: string;
  };
  'file:watchError': {
    filePath: string;
    error: IpcErrorInfo;
  };
}

// ── 内联子类型 ──────────────────────────────────

export interface DirSizeResult {
  size: number;
  partial?: boolean;
  fileCount?: number;
}

export interface FulltextMatch {
  filePath: string;
  fileName: string;
  lineNumber: number;
  lineContent: string;
  columnStart: number;
  columnEnd: number;
  matchText: string;
}

export interface IndexResult {
  path: string;
  name: string;
  isDirectory: boolean;
  extension: string;
}

export interface ScanSummary {
  scanned: number;
  directories: number;
  skipped: number;
  cancelled: boolean;
  truncated: boolean;
  warnings: string[];
}

export interface SearchResult {
  matches: FulltextMatch[];
  cancelled: boolean;
  truncated: boolean;
  warnings: string[];
}
