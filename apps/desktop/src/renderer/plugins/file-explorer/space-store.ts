import { create } from 'zustand';
import type { Space } from '@explore/shared';
import { getIpcErrorMessage, ipc } from '../../framework/bridge/ipc-client';
import { useFileStore, type Tab } from './store';
import { useLayoutStore } from '../../framework/store/layout-store';
import { getMostRecentSpace } from './utils/space-display';

function nextId(): string {
  return `space-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function snapshotState(side: 'left' | 'right'): Space['left'] {
  const panel = useFileStore.getState()[side];
  // 保存活跃标签的 path（而不是 id，因为恢复时 id 会重新生成）
  const activeTab = panel.tabs.find((t) => t.id === panel.activeTabId);
  return {
    tabs: panel.tabs.map((t) => ({
      path: t.path,
      label: t.label,
      initialPath: t.initialPath,
      pinned: t.pinned,
    })),
    activeTabId: panel.activeTabId,
    activeTabPath: activeTab?.path ?? panel.path,
    activeTabIndex: panel.tabs.findIndex((t) => t.id === panel.activeTabId),
    path: panel.path,
  };
}

let restoredTabSequence = 0;

function buildTabs(snap: Space['left']): { tabs: Tab[]; activeTabId: string | null } {
  const tabs: Tab[] = [];
  let activeTabId: string | null = null;

  for (const t of snap.tabs) {
    const id = `restored-tab-${Date.now()}-${++restoredTabSequence}`;
    const tab = { id, path: t.path, label: t.label, pinned: t.pinned, initialPath: t.initialPath || t.path };
    tabs.push(tab);
    // 用路径匹配活跃标签（snap.activeTabPath 是快照时活跃标签的 path）
    if (snap.activeTabPath && t.path === snap.activeTabPath) {
      activeTabId = id;
    }
  }

  if (
    Number.isInteger(snap.activeTabIndex) &&
    snap.activeTabIndex! >= 0 &&
    snap.activeTabIndex! < tabs.length
  ) {
    activeTabId = tabs[snap.activeTabIndex!].id;
  }

  // fallback: 如果没匹配到活跃标签但有标签，激活最后一个
  if (!activeTabId && tabs.length > 0) {
    activeTabId = tabs[tabs.length - 1].id;
  }

  return { tabs, activeTabId };
}

export async function restoreState(side: 'left' | 'right', snap: Space['left']): Promise<void> {
  // 构建新标签列表 + 活跃标签 ID（单次 setState 避免逐个 closeTab/addTab 的中间渲染）
  const { tabs, activeTabId } = buildTabs(snap);
  const path = snap.path ?? tabs.find((tab) => tab.id === activeTabId)?.path ?? null;
  useFileStore.getState().resetPanel(side);
  useLayoutStore.getState().setPanelPath(side, path);
  useLayoutStore.getState().setPanelPlugin(side, 'file-explorer', 'browser');

  useFileStore.setState((s) => ({
    [side]: {
      ...s[side],
      tabs,
      activeTabId,
      path,
      loading: false,
      filterText: '',
      selected: new Set(),
      backStack: [],
      forwardStack: [],
    },
  }));

  // 恢复路径（异步加载目录内容）
  if (path) {
    await useFileStore.getState().navigateTo(side, path, false);
  }
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let transitionVersion = 0;
let saveVersion = 0;
let saveQueue: Promise<boolean> = Promise.resolve(true);

function cancelAutoSave(): void {
  if (autoSaveTimer) clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
}

/** 订阅 file store 变化，防抖自动存盘 */
export function initAutoSave(): () => void {
  const unsubscribe = useFileStore.subscribe((state, previous) => {
    const spaces = useSpaceStore.getState();
    if (!spaces.loaded || spaces.restoring) return;
    const changed = (['left', 'right'] as const).some(
      (side) =>
        state[side].tabs !== previous[side].tabs ||
        state[side].activeTabId !== previous[side].activeTabId ||
        state[side].path !== previous[side].path,
    );
    if (!changed) return;
    cancelAutoSave();
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      void useSpaceStore.getState().saveCurrentSpace();
    }, 500);
  });
  return () => {
    unsubscribe();
    cancelAutoSave();
  };
}

export const useSpaceStore = create<{
  spaces: Space[];
  activeSpaceId: string;
  loaded: boolean;
  hasSavedSpaces: boolean;
  restoring: boolean;
  loadError: string | null;
  saveError: string | null;
  switchSpace: (id: string) => Promise<void>;
  addSpace: (name: string) => void;
  removeSpace: (id: string) => Promise<void>;
  renameSpace: (id: string, name: string) => void;
  toggleSpacePinned: (id: string) => void;
  /** 将当前标签状态保存到活跃 Space */
  saveCurrentSpace: () => Promise<boolean>;
  loadSpaces: () => Promise<void>;
  persistSpaces: () => Promise<boolean>;
}>((set, get) => ({
  spaces: [],
  activeSpaceId: '',
  loaded: false,
  hasSavedSpaces: false,
  restoring: false,
  loadError: null,
  saveError: null,

  saveCurrentSpace: () => {
    cancelAutoSave();
    const { spaces, activeSpaceId, loaded, restoring } = get();
    if (!loaded) return Promise.resolve(false);
    // During a transition the saved destination snapshot is complete; the panels may still be loading.
    if (!restoring) {
      set({
        spaces: spaces.map((s) =>
          s.id === activeSpaceId ? { ...s, left: snapshotState('left'), right: snapshotState('right') } : s,
        ),
      });
    }
    return get().persistSpaces();
  },

  switchSpace: async (id) => {
    const { spaces, activeSpaceId, restoring, loaded } = get();
    if (!loaded || id === activeSpaceId || !spaces.some((space) => space.id === id)) return;
    cancelAutoSave();
    const version = ++transitionVersion;

    // 保存当前 Space 状态
    const updated = spaces.map((s) => {
      if (s.id === id) return { ...s, lastOpenedAt: Date.now() };
      if (s.id === activeSpaceId && !restoring) {
        return {
          ...s,
          left: snapshotState('left'),
          right: snapshotState('right'),
        };
      }
      return s;
    });

    const target = updated.find((s) => s.id === id)!;
    set({ spaces: updated, activeSpaceId: id, restoring: true });
    // Start both restorations before awaiting either one, so an older switch cannot later replace one side.
    await Promise.all([restoreState('left', target.left), restoreState('right', target.right)]);
    if (version !== transitionVersion) return;
    set({ restoring: false });
    await get().saveCurrentSpace();
  },

  addSpace: (name) => {
    if (!get().loaded) return;
    const space: Space = {
      id: nextId(),
      name,
      left: snapshotState('left'),
      right: snapshotState('right'),
    };
    set((s) => ({ spaces: [...s.spaces, space] }));
    get().persistSpaces();
  },

  removeSpace: async (id) => {
    const { spaces, activeSpaceId } = get();
    if (!get().loaded || spaces.length <= 1 || !spaces.some((space) => space.id === id)) return;

    const remaining = spaces.filter((space) => space.id !== id);
    if (activeSpaceId !== id) {
      set({ spaces: remaining });
      await get().persistSpaces();
      return;
    }

    const fallback = getMostRecentSpace(remaining) ?? remaining[0];
    set({ spaces: remaining });
    await get().switchSpace(fallback.id);
  },

  renameSpace: (id, name) => {
    set((s) => ({
      spaces: s.spaces.map((x) => (x.id === id ? { ...x, name } : x)),
    }));
    get().persistSpaces();
  },

  toggleSpacePinned: (id) => {
    set((s) => ({
      spaces: s.spaces.map((space) => (space.id === id ? { ...space, pinned: !space.pinned } : space)),
    }));
    get().persistSpaces();
  },

  loadSpaces: async () => {
    try {
      const spaces = await ipc.invoke('space:list', undefined);
      set({ loaded: true, hasSavedSpaces: spaces.length > 0, loadError: null });
      if (spaces.length === 0) {
        // 首次使用：创建默认 Space
        const defaultSpace: Space = {
          id: nextId(),
          name: 'Default',
          left: {
            tabs: [],
            activeTabId: null,
            path: null,
          },
          right: {
            tabs: [],
            activeTabId: null,
            path: null,
          },
        };
        set({ spaces: [defaultSpace], activeSpaceId: defaultSpace.id });
      } else {
        const activeSpace = getMostRecentSpace(spaces) ?? spaces[0];
        set({ spaces, activeSpaceId: activeSpace.id });
      }
    } catch (err) {
      // Keep the existing state intact and block autosave until a successful reload.
      set({ loaded: false, loadError: getIpcErrorMessage(err, '工作空间加载失败') });
    }
  },

  persistSpaces: () => {
    const { spaces, loaded } = get();
    if (!loaded) return Promise.resolve(false);
    const version = ++saveVersion;
    saveQueue = saveQueue.then(async () => {
      try {
        await ipc.invoke('space:save', { spaces });
        if (version === saveVersion) set({ saveError: null });
        return true;
      } catch (err) {
        set({ saveError: getIpcErrorMessage(err, '工作空间保存失败') });
        return false;
      }
    });
    return saveQueue;
  },
}));

let initialization: Promise<void> | null = null;

/** Restore saved panels before allowing autosave, including React StrictMode's repeated mount. */
export function initializeWorkspaces(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    useSpaceStore.setState({ restoring: true });
    try {
      await useSpaceStore.getState().loadSpaces();
      const state = useSpaceStore.getState();
      if (!state.loaded) return;
      const active = state.spaces.find((space) => space.id === state.activeSpaceId);
      if (state.hasSavedSpaces && active) {
        await Promise.all([restoreState('left', active.left), restoreState('right', active.right)]);
      } else {
        await useFileStore.getState().loadPinnedTabs();
        const left = snapshotState('left');
        const right = snapshotState('right');
        const home = left.tabs.length ? null : await ipc.invoke('app:getHomeDir', undefined);
        if (home) {
          left.tabs = [
            {
              path: home,
              initialPath: home,
              label: home.split(/[/\\]/).filter(Boolean).pop() || home,
              pinned: false,
            },
          ];
          left.path = home;
        }
        await Promise.all([restoreState('left', left), restoreState('right', right)]);
      }
    } catch (err) {
      useSpaceStore.setState({ loaded: false, loadError: getIpcErrorMessage(err, '工作空间恢复失败') });
    } finally {
      useSpaceStore.setState({ restoring: false });
    }
  })().finally(() => {
    initialization = null;
  });
  return initialization;
}
