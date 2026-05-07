import { create } from 'zustand';
import type { IndexResult } from '@explore/shared';
import { ipc } from '../../framework/bridge/ipc-client';

interface LauncherState {
  query: string;
  results: IndexResult[];
  loading: boolean;
  selectedIndex: number;

  setQuery: (q: string) => void;
  search: (q: string) => Promise<void>;
  moveSelection: (dir: number) => void;
  openSelected: () => Promise<void>;
  reset: () => void;
}

export const useLauncherStore = create<LauncherState>((set, get) => ({
  query: '',
  results: [],
  loading: false,
  selectedIndex: 0,

  setQuery: (q: string) => set({ query: q }),

  search: async (q: string) => {
    if (!q.trim()) {
      set({ results: [], loading: false, selectedIndex: 0 });
      return;
    }
    set({ loading: true, query: q });
    try {
      const results = await ipc.invoke('index:query', {
        pattern: q,
        maxResults: 30,
      });
      set({ results, loading: false, selectedIndex: 0 });
    } catch {
      set({ loading: false });
    }
  },

  moveSelection: (dir: number) => {
    const { results, selectedIndex } = get();
    const newIdx = selectedIndex + dir;
    if (newIdx >= 0 && newIdx < results.length) {
      set({ selectedIndex: newIdx });
    }
  },

  openSelected: async () => {
    const { results, selectedIndex } = get();
    const item = results[selectedIndex];
    if (item) {
      await ipc.invoke('file:open', { path: item.path });
      await ipc.invoke('window:toggleLauncher', undefined);
    }
  },

  reset: () => set({ query: '', results: [], loading: false, selectedIndex: 0 }),
}));
