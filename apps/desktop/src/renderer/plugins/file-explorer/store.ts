import { create } from 'zustand';
import type { FileEntry, SortConfig } from '@explore/shared';
import { ipc } from '../../framework/bridge/ipc-client';

export interface Tab {
  id: string;
  path: string;
  label: string;
  pinned: boolean;
  initialPath: string;
}

interface PanelFileState {
  path: string | null;
  entries: FileEntry[];
  loading: boolean;
  filterText: string;
  selected: Set<string>;
  sort: SortConfig;
  showHidden: boolean;
  backStack: string[];
  forwardStack: string[];
  tabs: Tab[];
  activeTabId: string | null;
}

interface FileExplorerState {
  left: PanelFileState;
  right: PanelFileState;

  navigateTo: (side: 'left' | 'right', path: string, addToHistory?: boolean) => Promise<void>;
  goBack: (side: 'left' | 'right') => Promise<void>;
  goForward: (side: 'left' | 'right') => Promise<void>;
  refresh: (side: 'left' | 'right') => Promise<void>;
  setFilter: (side: 'left' | 'right', text: string) => void;
  toggleSelect: (side: 'left' | 'right', path: string) => void;
  selectRange: (side: 'left' | 'right', from: string, to: string) => void;
  clearSelection: (side: 'left' | 'right') => void;
  selectAll: (side: 'left' | 'right') => void;
  setSort: (side: 'left' | 'right', key: SortConfig['key']) => void;
  toggleHidden: (side: 'left' | 'right') => void;
  pinTab: (side: 'left' | 'right', tabId: string) => void;
  unpinTab: (side: 'left' | 'right', tabId: string) => void;
  closeTab: (side: 'left' | 'right', tabId: string) => void;
  loadPinnedTabs: () => Promise<void>;
  persistPinnedTabs: (side: 'left' | 'right') => void;
  addTab: (side: 'left' | 'right', path: string) => void;
  forkTab: (side: 'left' | 'right', tabId: string) => void;
  activateTab: (side: 'left' | 'right', tabId: string) => void;
  renameTab: (side: 'left' | 'right', tabId: string, label: string) => void;
}

let tabSeq = 0;
function nextTabId(): string {
  return `tab-${Date.now()}-${++tabSeq}`;
}

function tabLabel(p: string): string {
  const name = p.split(/[/\\]/).pop();
  if (name) return name;
  const back = p.split(/[/\\]/);
  return back[back.length - 2] || p;
}

function defaultPanel(): PanelFileState {
  return {
    path: null,
    entries: [],
    loading: false,
    filterText: '',
    selected: new Set(),
    sort: { key: 'name', direction: 'asc' },
    showHidden: false,
    backStack: [],
    forwardStack: [],
    tabs: [],
    activeTabId: null,
  };
}

async function loadDir(
  path: string,
  sort: SortConfig,
  showHidden: boolean,
): Promise<FileEntry[]> {
  return ipc.invoke('file:readDir', { path, sort, showHidden });
}

export const useFileStore = create<FileExplorerState>((set, get) => ({
  left: defaultPanel(),
  right: defaultPanel(),

  navigateTo: async (side, path, addToHistory = true) => {
    const panel = get()[side];

    set((s) => ({
      [side]: {
        ...s[side],
        loading: true,
        path,
        filterText: '',
        selected: new Set(),
        // 同步当前活跃标签的路径（只改 path，不改 label）
        tabs: s[side].tabs.map((t) =>
          t.id === s[side].activeTabId ? { ...t, path } : t,
        ),
        backStack: addToHistory && panel.path
          ? (s[side].tabs.some((t) => t.pinned)
              ? s[side].backStack
              : [...s[side].backStack, panel.path])
          : s[side].backStack,
        forwardStack: addToHistory ? [] : panel.forwardStack,
      },
    }));

    try {
      const entries = await loadDir(path, panel.sort, panel.showHidden);
      set((s) => ({ [side]: { ...s[side], entries, loading: false } }));
    } catch {
      set((s) => ({ [side]: { ...s[side], loading: false, entries: [] } }));
    }
  },

  goBack: async (side) => {
    const panel = get()[side];
    if (panel.backStack.length === 0) return;
    const prev = [...panel.backStack];
    const target = prev.pop()!;
    set((s) => ({
      [side]: {
        ...s[side],
        forwardStack: [...s[side].forwardStack, s[side].path!],
        backStack: prev,
      },
    }));
    await get().navigateTo(side, target, false);
  },

  goForward: async (side) => {
    const panel = get()[side];
    if (panel.forwardStack.length === 0) return;
    const fwd = [...panel.forwardStack];
    const target = fwd.pop()!;
    set((s) => ({
      [side]: {
        ...s[side],
        backStack: [...s[side].backStack, s[side].path!],
        forwardStack: fwd,
      },
    }));
    await get().navigateTo(side, target, false);
  },

  refresh: async (side) => {
    const panel = get()[side];
    if (!panel.path) return;
    set((s) => ({ [side]: { ...s[side], loading: true } }));
    try {
      const entries = await loadDir(panel.path, panel.sort, panel.showHidden);
      set((s) => ({ [side]: { ...s[side], entries, loading: false } }));
    } catch {
      set((s) => ({ [side]: { ...s[side], loading: false } }));
    }
  },

  setFilter: (side, text) =>
    set((s) => ({ [side]: { ...s[side], filterText: text } })),

  toggleSelect: (side, path) =>
    set((s) => {
      const selected = new Set(s[side].selected);
      if (selected.has(path)) selected.delete(path);
      else selected.add(path);
      return { [side]: { ...s[side], selected } };
    }),

  selectRange: (side, from, to) =>
    set((s) => {
      const panel = s[side];
      const fromIdx = panel.entries.findIndex((e) => e.path === from);
      const toIdx = panel.entries.findIndex((e) => e.path === to);
      if (fromIdx === -1 || toIdx === -1) return {};
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      const selected = new Set(panel.selected);
      for (let i = start; i <= end; i++) selected.add(panel.entries[i].path);
      return { [side]: { ...panel, selected } };
    }),

  clearSelection: (side) =>
    set((s) => ({ [side]: { ...s[side], selected: new Set() } })),

  selectAll: (side) =>
    set((s) => ({
      [side]: { ...s[side], selected: new Set(s[side].entries.map((e) => e.path)) },
    })),

  setSort: (side, key) => {
    const panel = get()[side];
    const direction =
      panel.sort.key === key && panel.sort.direction === 'asc' ? 'desc' : 'asc';
    set((s) => ({ [side]: { ...s[side], sort: { key, direction } } }));
    get().refresh(side);
  },

  toggleHidden: (side) => {
    set((s) => ({ [side]: { ...s[side], showHidden: !s[side].showHidden } }));
    get().refresh(side);
  },

  pinTab: (side, tabId) =>
    set((s) => {
      const currentPath = s[side].path;
      const label = currentPath ? tabLabel(currentPath) : s[side].tabs.find((t) => t.id === tabId)?.label ?? '';
      return {
        [side]: {
          ...s[side],
          tabs: s[side].tabs.map((t) =>
            t.id === tabId ? { ...t, pinned: true, path: currentPath ?? t.path, label, initialPath: currentPath ?? t.initialPath } : t,
          ),
          backStack: currentPath ? [currentPath] : s[side].backStack,
          forwardStack: [],
        },
      };
    }),

  unpinTab: (side, tabId) =>
    set((s) => ({
      [side]: {
        ...s[side],
        tabs: s[side].tabs.map((t) => (t.id === tabId ? { ...t, pinned: false } : t)),
      },
    })),

  closeTab: (side, tabId) =>
    set((s) => {
      const remaining = s[side].tabs.filter((t) => t.id !== tabId);
      const activeTabId =
        s[side].activeTabId === tabId
          ? remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null
          : s[side].activeTabId;
      return {
        [side]: {
          ...s[side],
          tabs: remaining,
          activeTabId,
        },
      };
    }),

  addTab: (side, path) =>
    set((s) => {
      const exists = s[side].tabs.find((t) => t.path === path);
      if (exists) {
        return {
          [side]: {
            ...s[side],
            activeTabId: exists.id,
          },
        };
      }
      const newTab: Tab = { id: nextTabId(), path, label: tabLabel(path), pinned: false, initialPath: path };
      return {
        [side]: {
          ...s[side],
          tabs: [...s[side].tabs, newTab],
          activeTabId: newTab.id,
          backStack: [],
          forwardStack: [],
        },
      };
    }),

  forkTab: (side, tabId) =>
    set((s) => {
      const tab = s[side].tabs.find((t) => t.id === tabId);
      if (!tab) return {};
      const newTab: Tab = { id: nextTabId(), path: tab.path, label: tab.label, pinned: false, initialPath: tab.initialPath };
      return {
        [side]: {
          ...s[side],
          tabs: [...s[side].tabs, newTab],
          activeTabId: newTab.id,
          backStack: [],
          forwardStack: [],
        },
      };
    }),

  activateTab: (side, tabId) =>
    set((s) => {
      const oldActiveId = s[side].activeTabId;
      const currentPath = s[side].path;
      return {
        [side]: {
          ...s[side],
          activeTabId: tabId,
          // 把当前路径保存到旧活跃标签
          tabs: s[side].tabs.map((t) =>
            t.id === oldActiveId && currentPath ? { ...t, path: currentPath } : t,
          ),
        },
      };
    }),

  renameTab: (side, tabId, label) =>
    set((s) => ({
      [side]: {
        ...s[side],
        tabs: s[side].tabs.map((t) => (t.id === tabId ? { ...t, label } : t)),
      },
    })),

  loadPinnedTabs: async () => {
    try {
      const data = await ipc.invoke('tabs:load', undefined);
      const pinnedLeft = data.left.map((t, i) => ({ id: `pinned-left-${i}`, path: t.path, label: t.label, pinned: true as const, initialPath: t.initialPath }));
      const pinnedRight = data.right.map((t, i) => ({ id: `pinned-right-${i}`, path: t.path, label: t.label, pinned: true as const, initialPath: t.initialPath }));
      set((s) => ({
        left: {
          ...s.left,
          tabs: [...pinnedLeft, ...s.left.tabs.filter((t) => !t.pinned)],
          backStack: pinnedLeft.length > 0 ? [pinnedLeft[pinnedLeft.length - 1].path] : s.left.backStack,
        },
        right: {
          ...s.right,
          tabs: [...pinnedRight, ...s.right.tabs.filter((t) => !t.pinned)],
          backStack: pinnedRight.length > 0 ? [pinnedRight[pinnedRight.length - 1].path] : s.right.backStack,
        },
      }));
    } catch {
      // ignore
    }
  },

  persistPinnedTabs: (side) => {
    const panel = get()[side];
    const pinnedTabs = panel.tabs
      .filter((t) => t.pinned)
      .map((t) => ({ path: t.path, label: t.label, initialPath: t.initialPath }));
    ipc.invoke('tabs:save', { side, tabs: pinnedTabs }).catch(() => {});
  },
}));

/** 获取指定面板筛选后的文件列表 */
export function useFilteredEntries(side: 'left' | 'right') {
  const panel = useFileStore((s) => s[side]);
  if (!panel.filterText) return panel.entries;
  const lower = panel.filterText.toLowerCase();
  return panel.entries.filter((e) => e.name.toLowerCase().includes(lower));
}
