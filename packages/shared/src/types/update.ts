export type UpdateStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'preparing'
  | 'installing'
  | 'error';

export interface UpdateState {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  percent?: number;
  checkedAt?: number;
  message?: string;
}

// Fixed capabilities: the renderer cannot select a feed, executable or installation options.
export const UPDATE_CHANNELS = Object.freeze({
  getState: 'update:getState',
  check: 'update:check',
  download: 'update:download',
  install: 'update:install',
  resolveSave: 'update:resolveSave',
  stateChanged: 'update:stateChanged',
  beforeInstall: 'update:beforeInstall',
} as const);
