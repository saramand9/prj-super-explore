import { create } from 'zustand';
import type { FulltextMatch } from '@explore/shared';
import { ipc } from '../../framework/bridge/ipc-client';

interface SearchState {
  query: string;
  searchDir: string | null;
  filePattern: string;
  results: FulltextMatch[];
  searching: boolean;
  selectedIdx: number;

  setQuery: (q: string) => void;
  setSearchDir: (dir: string | null) => void;
  setFilePattern: (p: string) => void;
  search: () => Promise<void>;
  clearResults: () => void;
  moveSelection: (dir: number) => void;
  openFile: (match: FulltextMatch) => Promise<void>;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  searchDir: null,
  filePattern: '',
  results: [],
  searching: false,
  selectedIdx: 0,

  setQuery: (q) => set({ query: q }),
  setSearchDir: (dir) => set({ searchDir: dir }),
  setFilePattern: (p) => set({ filePattern: p }),

  search: async () => {
    const { query, searchDir, filePattern } = get();
    if (!query.trim() || !searchDir) return;

    set({ searching: true, results: [], selectedIdx: 0 });
    try {
      const results = await ipc.invoke('search:fulltext', {
        dir: searchDir,
        query,
        filePattern: filePattern || undefined,
        maxResults: 500,
      });
      set({ results, searching: false });
    } catch {
      set({ searching: false });
    }
  },

  clearResults: () => set({ results: [], selectedIdx: 0, query: '' }),

  moveSelection: (dir) => {
    const { results, selectedIdx } = get();
    const newIdx = selectedIdx + dir;
    if (newIdx >= 0 && newIdx < results.length) {
      set({ selectedIdx: newIdx });
    }
  },

  openFile: async (match) => {
    await ipc.invoke('file:open', { path: match.filePath });
  },
}));
