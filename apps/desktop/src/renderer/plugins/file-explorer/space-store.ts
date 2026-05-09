import { create } from 'zustand';
import type { Space } from '@explore/shared';
import { ipc } from '../../framework/bridge/ipc-client';
import { useFileStore } from './store';
import { useLayoutStore } from '../../framework/store/layout-store';

function nextId(): string {
  return `space-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function snapshotState(side: 'left' | 'right'): Space['left'] {
  const panel = useFileStore.getState()[side];
  return {
    tabs: panel.tabs.map((t) => ({
      path: t.path,
      label: t.label,
      initialPath: t.initialPath,
      pinned: t.pinned,
    })),
    activeTabId: panel.activeTabId,
    path: panel.path,
  };
}

function restoreState(side: 'left' | 'right', snap: Space['left']): void {
  const store = useFileStore.getState();
  const panel = store[side];

  // 清空所有现有标签
  const allTabs = [...panel.tabs];
  for (const tab of allTabs.reverse()) {
    store.closeTab(side, tab.id);
  }

  // 恢复标签：先用 addTab 创建，再修正 label
  for (const t of snap.tabs) {
    store.addTab(side, t.path);
    const defaultLabel = t.path.split(/[/\\]/).pop() || t.path;
    if (t.label !== defaultLabel) {
      const tab = store[side].tabs.find((x) => x.path === t.path);
      if (tab) store.renameTab(side, tab.id, t.label);
    }
  }

  // 恢复 active tab
  if (snap.activeTabId) {
    const tab = store[side].tabs.find((t) => t.path === snap.activeTabId);
    if (tab) store.activateTab(side, tab.id);
    else if (store[side].tabs.length > 0) {
      store.activateTab(side, store[side].tabs[0].id);
    }
  }

  // 恢复路径
  if (snap.path) {
    useLayoutStore.getState().setPanelPath(side, snap.path);
    store.navigateTo(side, snap.path, false);
  }
}

export const useSpaceStore = create<{
  spaces: Space[];
  activeSpaceId: string;
  switchSpace: (id: string) => Promise<void>;
  addSpace: (name: string) => void;
  removeSpace: (id: string) => void;
  renameSpace: (id: string, name: string) => void;
  loadSpaces: () => Promise<void>;
  persistSpaces: () => Promise<void>;
}>((set, get) => ({
  spaces: [],
  activeSpaceId: '',

  switchSpace: async (id) => {
    const { spaces, activeSpaceId } = get();
    if (id === activeSpaceId) return;

    // 保存当前 Space 状态
    const updated = spaces.map((s) => {
      if (s.id === activeSpaceId) {
        return {
          ...s,
          left: snapshotState('left'),
          right: snapshotState('right'),
        };
      }
      return s;
    });

    // 恢复目标 Space
    const target = updated.find((s) => s.id === id);
    if (target) {
      restoreState('left', target.left);
      restoreState('right', target.right);
    }

    set({ spaces: updated, activeSpaceId: id });
    get().persistSpaces();
  },

  addSpace: (name) => {
    const space: Space = {
      id: nextId(),
      name,
      left: snapshotState('left'),
      right: snapshotState('right'),
    };
    set((s) => ({ spaces: [...s.spaces, space] }));
    get().persistSpaces();
  },

  removeSpace: (id) => {
    set((s) => ({
      spaces: s.spaces.filter((x) => x.id !== id),
      activeSpaceId: s.activeSpaceId === id ? s.spaces[0]?.id ?? '' : s.activeSpaceId,
    }));
    get().persistSpaces();
  },

  renameSpace: (id, name) => {
    set((s) => ({
      spaces: s.spaces.map((x) => (x.id === id ? { ...x, name } : x)),
    }));
    get().persistSpaces();
  },

  loadSpaces: async () => {
    try {
      const spaces = await ipc.invoke('space:list', undefined);
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
        set({ spaces, activeSpaceId: spaces[0].id });
      }
    } catch {
      // Fallback
      const defaultSpace: Space = {
        id: nextId(),
        name: 'Default',
        left: { tabs: [], activeTabId: null, path: null },
        right: { tabs: [], activeTabId: null, path: null },
      };
      set({ spaces: [defaultSpace], activeSpaceId: defaultSpace.id });
    }
  },

  persistSpaces: async () => {
    const { spaces } = get();
    await ipc.invoke('space:save', { spaces }).catch(() => {});
  },
}));
