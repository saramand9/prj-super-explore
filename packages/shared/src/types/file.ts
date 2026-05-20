/** 文件条目（目录列表返回） */
export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  modifiedAt: number; // ms timestamp
}

/** 文件详细状态 */
export interface FileStat {
  path: string;
  size: number;
  isDirectory: boolean;
  isSymlink: boolean;
  createdAt: number;
  modifiedAt: number;
  accessedAt: number;
  permissions?: string; // e.g. "rwxr-xr-x"
}

/** 排序方式 */
export type SortKey = 'name' | 'size' | 'modifiedAt' | 'extension';

export interface SortConfig {
  key: SortKey;
  direction: 'asc' | 'desc';
}

export type FileConflictStrategy = 'rename' | 'skip' | 'overwrite' | 'error';

export interface FileOpFailure {
  path: string;
  dest?: string;
  reason: string;
  code?: string;
}

export interface FileOpCompleted {
  path: string;
  dest?: string;
  action: 'copied' | 'moved' | 'trashed' | 'deleted';
}

export interface FileOpRename {
  source: string;
  dest: string;
}

/** 文件操作结果 */
export interface FileOpResult {
  success: boolean;
  error?: string;
  skipped?: string[];
  completed?: FileOpCompleted[];
  failures?: FileOpFailure[];
  renamed?: FileOpRename[];
}
