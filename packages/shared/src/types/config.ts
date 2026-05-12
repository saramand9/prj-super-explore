/** 书签 */
export interface Bookmark {
  id: string;
  name: string;
  path: string;
  icon?: string;
  sortOrder: number;
}

/** 工作区 */
export interface Space {
  id: string;
  name: string;
  left: {
    tabs: { path: string; label: string; initialPath: string; pinned: boolean }[];
    activeTabId: string | null;
    /** 活跃标签的 path，用于恢复时匹配（id 在恢复时会重新生成） */
    activeTabPath?: string | null;
    path: string | null;
  };
  right: {
    tabs: { path: string; label: string; initialPath: string; pinned: boolean }[];
    activeTabId: string | null;
    /** 活跃标签的 path，用于恢复时匹配（id 在恢复时会重新生成） */
    activeTabPath?: string | null;
    path: string | null;
  };
}

/** 面板配置 */
export interface PanelConfig {
  id: string;
  pluginId: string;
  panelId: string;
}

/** 布局配置 */
export interface LayoutConfig {
  direction: 'horizontal' | 'vertical';
  panels: {
    id: string;
    defaultPlugin: string;
    defaultPanel?: string;
    minWidth?: number;
    minHeight?: number;
  }[];
  footer?: {
    id: string;
    defaultPlugin: string;
    collapsed: boolean;
    height: number; // 0-1 proportion
  };
}

/** 应用设置 */
export interface AppSettings {
  // 索引路径
  indexPaths: string[];
  // 排除模式
  excludePatterns: string[];
  // 显示隐藏文件
  showHiddenFiles: boolean;
  // 启动器热键
  launcherHotkey: string;
  // 全文搜索最大结果
  fulltextMaxResults: number;
  // 主题
  theme: 'light' | 'dark' | 'system';
}
