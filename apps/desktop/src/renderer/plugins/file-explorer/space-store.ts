import { create } from 'zustand';
import type { Space } from '@explore/shared';
import { ipc } from '../../framework/bridge/ipc-client';
import { useFileStore, type Tab } from './store';
import { useLayoutStore } from '../../framework/store/layout-store';

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
    path: panel.path,
  };
}

function buildTabs(snap: Space['left']): { tabs: Tab[]; activeTabId: string | null } {
  const tabs: Tab[] = [];
  let activeTabId: string | null = null;
  let seq = 0;

  for (const t of snap.tabs) {
    const id = `tab-${Date.now()}-${++seq}`;
    const tab = { id, path: t.path, label: t.label, pinned: t.pinned, initialPath: t.initialPath || t.path };
    tabs.push(tab);
    // 用路径匹配活跃标签（snap.activeTabPath 是快照时活跃标签的 path）
    if (snap.activeTabPath && t.path === snap.activeTabPath) {
      activeTabId = id;
    }
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

  useFileStore.setState((s) => ({
    [side]: {
      ...s[side],
      tabs,
      activeTabId,
      loading: true,
      filterText: '',
      selected: new Set(),
      backStack: [],
      forwardStack: [],
    },
  }));

  // 恢复路径（异步加载目录内容）
  if (snap.path) {
    useLayoutStore.getState().setPanelPath(side, snap.path);
    await useFileStore.getState().navigateTo(side, snap.path, false);
  }
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** 订阅 file store 变化，防抖自动存盘 */
export function initAutoSave(): void {
  useFileStore.subscribe(() => {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      useSpaceStore.getState().saveCurrentSpace();
    }, 500);
  });
}

export const useSpaceStore = create<{
  spaces: Space[];
  activeSpaceId: string;
  switchSpace: (id: string) => Promise<void>;
  addSpace: (name: string) => void;
  removeSpace: (id: string) => void;
  renameSpace: (id: string, name: string) => void;
  /** 将当前标签状态保存到活跃 Space */
  saveCurrentSpace: () => void;
  loadSpaces: () => Promise<void>;
  persistSpaces: () => Promise<void>;
}>((set, get) => ({
  spaces: [],
  activeSpaceId: '',

  saveCurrentSpace: () => {
    const { spaces, activeSpaceId } = get();
    set({
      spaces: spaces.map((s) =>
        s.id === activeSpaceId
          ? { ...s, left: snapshotState('left'), right: snapshotState('right') }
          : s,
      ),
    });
    get().persistSpaces();
  },

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

    // 恢复目标 Space（await 确保目录加载完成）
    const target = updated.find((s) => s.id === id);
    if (target) {
      await restoreState('left', target.left);
      await restoreState('right', target.right);
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
