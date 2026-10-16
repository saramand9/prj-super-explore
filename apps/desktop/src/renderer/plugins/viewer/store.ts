import { create } from 'zustand';
import type { FileReadResult } from '@explore/shared';
import { getIpcErrorMessage, ipc } from '../../framework/bridge/ipc-client';

type ViewerSide = 'left' | 'right';

const readRequests: Record<ViewerSide, number> = { left: 0, right: 0 };
const fileSessions: Record<ViewerSide, number> = { left: 0, right: 0 };

export interface SearchHighlight {
  filePath: string;
  lineNumber: number;
  columnStart?: number;
  columnEnd?: number;
  text: string;
}

interface ViewerPanelState {
  filePath: string | null;
  content: string;
  loading: boolean;
  error: string | null;
  watchError: string | null;
  readInfo: {
    size: number;
    bytesRead: number;
    partial: boolean;
    limit?: number;
    canContinue: boolean;
    full: boolean;
  } | null;
  searchHighlight: SearchHighlight | null;
}

interface ViewerState {
  left: ViewerPanelState;
  right: ViewerPanelState;
  loadFile: (side: ViewerSide, path: string) => Promise<void>;
  loadFullFile: (side: ViewerSide) => Promise<void>;
  setSearchHighlight: (side: ViewerSide, highlight: SearchHighlight | null) => void;
  clear: (side: ViewerSide) => void;
  reload: (side: ViewerSide) => Promise<void>;
  silentReload: (side: ViewerSide) => Promise<void>;
}

function defaultPanel(): ViewerPanelState {
  return {
    filePath: null,
    content: '',
    loading: false,
    error: null,
    watchError: null,
    readInfo: null,
    searchHighlight: null,
  };
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').toLowerCase();
}

function keepHighlightForPath(
  highlight: SearchHighlight | null,
  path: string,
): SearchHighlight | null {
  return highlight && normalizePath(highlight.filePath) === normalizePath(path)
    ? highlight
    : null;
}

function toReadInfo(result: FileReadResult, full: boolean): ViewerPanelState['readInfo'] {
  return {
    size: result.size,
    bytesRead: result.bytesRead,
    partial: !!result.partial,
    limit: result.limit,
    canContinue: !!result.canContinue,
    full,
  };
}

function isCurrentRead(side: ViewerSide, path: string, request: number): boolean {
  return readRequests[side] === request && useViewerStore.getState()[side].filePath === path;
}

function isCurrentSession(side: ViewerSide, path: string, session: number): boolean {
  return fileSessions[side] === session && useViewerStore.getState()[side].filePath === path;
}

function releaseUnusedWatcher(path: string): void {
  const state = useViewerStore.getState();
  // The main process shares one watcher for an exact path across both panels.
  if (state.left.filePath !== path && state.right.filePath !== path) {
    void ipc.invoke('file:unwatchFile', { path }).catch(() => {});
  }
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  left: defaultPanel(),
  right: defaultPanel(),

  loadFile: async (side, path) => {
    const request = ++readRequests[side];
    const session = ++fileSessions[side];
    const prev = get()[side].filePath;

    set((s) => ({
      [side]: {
        ...s[side],
        filePath: path,
        loading: true,
        error: null,
        watchError: null,
        readInfo: null,
        content: '',
        searchHighlight: keepHighlightForPath(s[side].searchHighlight, path),
      },
    }));
    if (prev && prev !== path) releaseUnusedWatcher(prev);

    try {
      const result = await ipc.invoke('file:read', { path });
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          content: result.content,
          readInfo: toReadInfo(result, !result.partial),
          loading: false,
        },
      }));
      void ipc.invoke('file:watchFile', { path }).then(
        () => {
          if (!isCurrentSession(side, path, session)) releaseUnusedWatcher(path);
        },
        (err) => {
          if (!isCurrentSession(side, path, session)) return;
          set((s) => ({
            [side]: {
              ...s[side],
              watchError: getIpcErrorMessage(err, '文件监听失败，内容不会自动刷新'),
            },
          }));
        },
      );
    } catch (err: any) {
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          error: getIpcErrorMessage(err, '文件读取失败'),
          loading: false,
        },
      }));
    }
  },

  loadFullFile: async (side) => {
    const path = get()[side].filePath;
    if (!path) return;
    const request = ++readRequests[side];
    set((s) => ({ [side]: { ...s[side], loading: true, error: null } }));
    try {
      const result = await ipc.invoke('file:read', { path, loadFull: true });
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          content: result.content,
          readInfo: toReadInfo(result, true),
          loading: false,
        },
      }));
    } catch (err) {
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          error: getIpcErrorMessage(err, '完整文件加载失败'),
          loading: false,
        },
      }));
    }
  },

  setSearchHighlight: (side, searchHighlight) =>
    set((s) => ({ [side]: { ...s[side], searchHighlight } })),

  clear: (side) => {
    ++readRequests[side];
    ++fileSessions[side];
    const prev = get()[side].filePath;
    set((s) => ({ [side]: { ...s[side], ...defaultPanel() } }));
    if (prev) releaseUnusedWatcher(prev);
  },

  reload: async (side) => {
    const path = get()[side].filePath;
    if (!path) return;
    const request = ++readRequests[side];
    set((s) => ({ [side]: { ...s[side], loading: true, error: null } }));
    try {
      const loadFull = get()[side].readInfo?.full ?? false;
      const result = await ipc.invoke('file:read', { path, loadFull });
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          content: result.content,
          readInfo: toReadInfo(result, loadFull || !result.partial),
          loading: false,
        },
      }));
    } catch (err: any) {
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          error: getIpcErrorMessage(err, '文件重新加载失败'),
          loading: false,
        },
      }));
    }
  },

  silentReload: async (side) => {
    const path = get()[side].filePath;
    if (!path || get()[side].loading) return;
    const request = ++readRequests[side];
    try {
      const loadFull = get()[side].readInfo?.full ?? false;
      const result = await ipc.invoke('file:read', { path, loadFull });
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          content: result.content,
          readInfo: toReadInfo(result, loadFull || !result.partial),
          error: null,
        },
      }));
    } catch (err) {
      if (!isCurrentRead(side, path, request)) return;
      set((s) => ({
        [side]: {
          ...s[side],
          error: getIpcErrorMessage(err, '文件自动刷新失败'),
        },
      }));
    }
  },
}));

// ── Tail: listen for file content changes ──

ipc.on('file:contentChanged', (payload) => {
  const state = useViewerStore.getState();
  for (const side of ['left', 'right'] as const) {
    const panel = state[side];
    if (
      panel.filePath &&
      normalizePath(panel.filePath) === normalizePath(payload.filePath) &&
      !panel.loading
    ) {
      state.silentReload(side);
    }
  }
});

ipc.on('file:watchError', (payload) => {
  useViewerStore.setState((s) => {
    const next: Partial<ViewerState> = {};
    for (const side of ['left', 'right'] as const) {
      const panel = s[side];
      if (panel.filePath && normalizePath(panel.filePath) === normalizePath(payload.filePath)) {
        next[side] = {
          ...panel,
          watchError: payload.error.message,
        };
      }
    }
    return next;
  });
});
