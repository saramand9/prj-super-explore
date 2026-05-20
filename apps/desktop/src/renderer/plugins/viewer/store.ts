import { create } from 'zustand';
import { ipc } from '../../framework/bridge/ipc-client';

type ViewerSide = 'left' | 'right';

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
  searchHighlight: SearchHighlight | null;
}

interface ViewerState {
  left: ViewerPanelState;
  right: ViewerPanelState;
  loadFile: (side: ViewerSide, path: string) => Promise<void>;
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

export const useViewerStore = create<ViewerState>((set, get) => ({
  left: defaultPanel(),
  right: defaultPanel(),

  loadFile: async (side, path) => {
    const prev = get()[side].filePath;
    if (prev && prev !== path) {
      ipc.invoke('file:unwatchFile', { path: prev }).catch(() => {});
    }

    set((s) => ({
      [side]: {
        ...s[side],
        filePath: path,
        loading: true,
        error: null,
        content: '',
        searchHighlight: keepHighlightForPath(s[side].searchHighlight, path),
      },
    }));

    try {
      const result = await ipc.invoke('file:read', { path });
      set((s) => ({
        [side]: {
          ...s[side],
          content: result.content,
          loading: false,
        },
      }));
      ipc.invoke('file:watchFile', { path }).catch(() => {});
    } catch (err: any) {
      set((s) => ({
        [side]: {
          ...s[side],
          error: err.message,
          loading: false,
        },
      }));
    }
  },

  setSearchHighlight: (side, searchHighlight) =>
    set((s) => ({ [side]: { ...s[side], searchHighlight } })),

  clear: (side) => {
    const prev = get()[side].filePath;
    if (prev) ipc.invoke('file:unwatchFile', { path: prev }).catch(() => {});
    set((s) => ({ [side]: { ...s[side], ...defaultPanel() } }));
  },

  reload: async (side) => {
    const path = get()[side].filePath;
    if (!path) return;
    set((s) => ({ [side]: { ...s[side], loading: true, error: null } }));
    try {
      const result = await ipc.invoke('file:read', { path });
      set((s) => ({
        [side]: {
          ...s[side],
          content: result.content,
          loading: false,
        },
      }));
    } catch (err: any) {
      set((s) => ({
        [side]: {
          ...s[side],
          error: err.message,
          loading: false,
        },
      }));
    }
  },

  silentReload: async (side) => {
    const path = get()[side].filePath;
    if (!path) return;
    try {
      const result = await ipc.invoke('file:read', { path });
      set((s) => ({ [side]: { ...s[side], content: result.content } }));
    } catch {
      // 静默失败，不打扰用户
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
