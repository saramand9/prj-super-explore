import { create } from 'zustand';
import type { FulltextMatch } from '@explore/shared';
import { getIpcErrorMessage, ipc } from '../../framework/bridge/ipc-client';

interface SearchState {
  query: string;
  searchDir: string | null;
  filePattern: string;
  results: FulltextMatch[];
  searching: boolean;
  error: string | null;
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
  error: null,
  selectedIdx: 0,

  setQuery: (q) => set({ query: q }),
  setSearchDir: (dir) => set({ searchDir: dir }),
  setFilePattern: (p) => set({ filePattern: p }),

  search: async () => {
    const { query, searchDir, filePattern } = get();
    if (!query.trim() || !searchDir) return;

    set({ searching: true, results: [], error: null, selectedIdx: 0 });
    try {
      const results = await ipc.invoke('search:fulltext', {
        dir: searchDir,
        query,
        filePattern: filePattern || undefined,
        maxResults: 500,
      });
      set({ results, searching: false, error: null });
    } catch (err) {
      set({ searching: false, error: getIpcErrorMessage(err, '全文搜索失败') });
    }
  },

  clearResults: () => set({ results: [], error: null, selectedIdx: 0, query: '' }),

  moveSelection: (dir) => {
    const { results, selectedIdx } = get();
    const newIdx = selectedIdx + dir;
    if (newIdx >= 0 && newIdx < results.length) {
      set({ selectedIdx: newIdx });
    }
  },

  openFile: async (match) => {
    try {
      await ipc.invoke('file:open', { path: match.filePath });
      set({ error: null });
    } catch (err) {
      set({ error: getIpcErrorMessage(err, '打开搜索结果失败') });
    }
  },
}));
