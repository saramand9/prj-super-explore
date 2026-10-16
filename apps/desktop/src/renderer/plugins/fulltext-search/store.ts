import { create } from 'zustand';
import type { FulltextMatch } from '@explore/shared';
import { getIpcErrorMessage, ipc } from '../../framework/bridge/ipc-client';
import { previewSearchResult, type SearchSide } from './utils/preview-search-result';

interface SearchState {
  query: string;
  searchDir: string | null;
  filePattern: string;
  results: FulltextMatch[];
  searching: boolean;
  error: string | null;
  previewError: string | null;
  warnings: string[];
  cancelled: boolean;
  selectedIdx: number;

  setQuery: (q: string) => void;
  setSearchDir: (dir: string | null) => void;
  setFilePattern: (p: string) => void;
  search: () => Promise<void>;
  cancelSearch: () => void;
  clearResults: () => void;
  moveSelection: (dir: number) => void;
  openFile: (match: FulltextMatch, side: SearchSide) => Promise<void>;
}

export const FULLTEXT_RESULT_LIMIT = 500;
const SEARCH_ID = 'fulltext-panel';
let searchVersion = 0;
let activeSearchId = '';

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  searchDir: null,
  filePattern: '',
  results: [],
  searching: false,
  error: null,
  previewError: null,
  warnings: [],
  cancelled: false,
  selectedIdx: 0,

  setQuery: (q) => {
    if (q === get().query) return;
    get().cancelSearch();
    set({ query: q, results: [], error: null, previewError: null, warnings: [], cancelled: false });
  },
  setSearchDir: (dir) => {
    if (dir === get().searchDir) return;
    get().cancelSearch();
    set({ searchDir: dir, results: [], error: null, previewError: null, warnings: [], cancelled: false });
  },
  setFilePattern: (p) => {
    if (p === get().filePattern) return;
    get().cancelSearch();
    set({ filePattern: p, results: [], error: null, previewError: null, warnings: [], cancelled: false });
  },

  cancelSearch: () => {
    ++searchVersion;
    const wasSearching = get().searching;
    if (wasSearching) void ipc.invoke('search:cancel', { searchId: activeSearchId }).catch(() => {});
    set({ searching: false, cancelled: wasSearching });
  },

  search: async () => {
    const { query, searchDir, filePattern } = get();
    if (!query.trim() || !searchDir) return;
    get().cancelSearch();
    const version = ++searchVersion;
    const searchId = `${SEARCH_ID}:${version}`;
    activeSearchId = searchId;

    set({ searching: true, results: [], error: null, previewError: null, warnings: [], cancelled: false, selectedIdx: 0 });
    const off = ipc.on('search:progress', (progress) => {
      if (version !== searchVersion || progress.searchId !== searchId) return;
      set((state) => ({ results: [...state.results, ...progress.matches] }));
    });
    try {
      const result = await ipc.invoke('search:run', {
        dir: searchDir,
        query,
        searchId,
        filePattern: filePattern || undefined,
        maxResults: FULLTEXT_RESULT_LIMIT,
      });
      if (version !== searchVersion) return;
      set({ results: result.matches, warnings: result.warnings, cancelled: result.cancelled, searching: false, error: null });
    } catch (err) {
      if (version !== searchVersion) return;
      set({ searching: false, error: getIpcErrorMessage(err, '全文搜索失败') });
    } finally {
      off();
    }
  },

  clearResults: () => {
    get().cancelSearch();
    set({ results: [], error: null, previewError: null, warnings: [], cancelled: false, selectedIdx: 0, query: '' });
  },

  moveSelection: (dir) => {
    const { results, selectedIdx } = get();
    const newIdx = selectedIdx + dir;
    if (newIdx >= 0 && newIdx < results.length) {
      set({ selectedIdx: newIdx });
    }
  },

  openFile: async (match, side) => {
    set({ previewError: null });
    try {
      await previewSearchResult(side, match.filePath, {
        lineNumber: match.lineNumber,
        columnStart: match.columnStart,
        columnEnd: match.columnEnd,
        text: match.matchText || get().query,
      });
    } catch (err) {
      set({ previewError: getIpcErrorMessage(err, '打开搜索结果失败') });
    }
  },
}));
