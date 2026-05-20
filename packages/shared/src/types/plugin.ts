// ── Plugin Manifest ──────────────────────────────

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  main: string;
  mainProcess?: string;
  engines: { explore: string };
  contributes: PluginContributions;
}

export interface PluginContributions {
  panels?: PanelContribution[];
  commands?: CommandContribution[];
  keybindings?: KeybindingContribution[];
  menus?: MenuContribution[];
  fileHandlers?: FileHandlerContribution[];
  searchProviders?: SearchProviderContribution[];
  bookmarkProviders?: BookmarkProviderContribution[];
  configuration?: ConfigSchema;
}

// ── Contributions ────────────────────────────────

export interface PanelContribution {
  id: string;
  title: string;
  icon?: string;
  component?: string; // component name in plugin's renderer
  defaultSize?: { minWidth?: number; minHeight?: number };
}

export interface CommandContribution {
  id: string;
  title: string;
  category?: string;
  /** 如果指定，该命令会出现在文件右键菜单 */
  contextMenu?: {
    appliesTo: 'file' | 'directory' | 'any';
    multiSelect?: boolean;
  };
}

export interface KeybindingContribution {
  command: string;
  key: string; // e.g. "Ctrl+Shift+F"
  when?: string; // e.g. "activePanel == 'file-explorer'"
}

export interface MenuContribution {
  id: string;
  location: 'context-menu' | 'panel-header' | 'title-bar';
  items: MenuItem[];
}

export interface MenuItem {
  command?: string;
  label?: string;
  separator?: boolean;
  children?: MenuItem[];
}

export interface FileHandlerContribution {
  extensions: string[];
  name: string;
  /** 处理函数在插件中的 export 名 */
  handler: string;
}

export interface SearchProviderContribution {
  id: string;
  name: string;
  /** 主进程搜索处理器 export 名 */
  handler: string;
}

export interface BookmarkProviderContribution {
  id: string;
  name: string;
}

export type ConfigSchema = Record<string, ConfigItem>;

export interface ConfigItem {
  type: 'string' | 'boolean' | 'number';
  default: unknown;
  description: string;
  enum?: string[];
}

// ── Runtime ──────────────────────────────────────

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  path: string;
  enabled: boolean;
  activated: boolean;
}

/** 插件暴露给框架的 activate/deactivate */
export interface PluginModule {
  manifest: PluginManifest;
  activate(ctx: PluginContext): Promise<void> | void;
  deactivate?(): Promise<void> | void;
  components?: Record<string, React.ComponentType<any>>;
  commandHandlers?: Record<string, (...args: any[]) => any>;
}

/** 框架暴露给插件的 API */
export interface PluginContext {
  fs: FsApi;
  search: SearchApi;
  commands: CommandsApi;
  notifications: NotificationsApi;
  panels: PanelsApi;
  events: EventsApi;
}

export interface FsApi {
  readDir(path: string, opts?: { sort?: import('./file').SortConfig; showHidden?: boolean }): Promise<import('./file').FileEntry[]>;
  stat(path: string): Promise<import('./file').FileStat | null>;
  copy(sources: string[], destDir: string, opts?: { conflictStrategy?: import('./file').FileConflictStrategy }): Promise<import('./file').FileOpResult>;
  move(sources: string[], destDir: string, opts?: { conflictStrategy?: import('./file').FileConflictStrategy }): Promise<import('./file').FileOpResult>;
  delete(paths: string[], permanent?: boolean): Promise<import('./file').FileOpResult>;
  mkdir(parentPath: string, name: string): Promise<{ success: boolean; path?: string; error?: string }>;
  open(path: string): Promise<void>;
}

export interface SearchApi {
  fulltext(dir: string, query: string, opts?: { filePattern?: string; maxResults?: number }): Promise<import('./ipc').FulltextMatch[]>;
}

export interface CommandsApi {
  register(id: string, handler: (...args: any[]) => any): void;
  execute<T = unknown>(id: string, ...args: any[]): Promise<T>;
  list(): Array<{ id: string; title: string; category?: string }>;
}

export interface NotificationsApi {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PanelsApi {
  openPanel(pluginId: string, panelId: string): void;
}

export interface EventsApi {
  on(event: string, cb: (...args: any[]) => void): () => void;
}
