import { create } from 'zustand';
import type { Bookmark } from '@explore/shared';
import { ipc } from '../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../framework/store/layout-store';

interface BookmarkState {
  bookmarks: Bookmark[];
  loading: boolean;

  load: () => Promise<void>;
  add: (path: string, name?: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  navigate: (path: string) => void;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],
  loading: false,

  load: async () => {
    set({ loading: true });
    try {
      const bookmarks = await ipc.invoke('bookmark:list', undefined);
      set({ bookmarks, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  add: async (path, name) => {
    const bookmark: Bookmark = {
      id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: name ?? path.split(/[/\\]/).pop() ?? path,
      path,
      sortOrder: get().bookmarks.length,
    };
    await ipc.invoke('bookmark:add', bookmark);
    await get().load();
  },

  remove: async (id) => {
    await ipc.invoke('bookmark:remove', { id });
    await get().load();
  },

  navigate: (path) => {
    const store = useLayoutStore.getState();
    const activePanel = store.layout.id;
    if (activePanel === 'left' || activePanel === 'right') {
      store.setPanelPath(activePanel, path);
    }
  },
}));
