import { create } from 'zustand';
import { useMemo } from 'react';
import type { FileEntry, SortConfig, DirSizeResult } from '@explore/shared';
import { pinyin } from 'pinyin-pro';
import { getIpcErrorMessage, ipc } from '../../framework/bridge/ipc-client';
import { getFileTypeSearchText } from './utils/file-entry-type';

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
  error: string | null;
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
  dirSizeMap: Record<string, DirSizeResult>;

  navigateTo: (side: 'left' | 'right', path: string, addToHistory?: boolean) => Promise<void>;
  goBack: (side: 'left' | 'right') => Promise<void>;
  goForward: (side: 'left' | 'right') => Promise<void>;
  refresh: (side: 'left' | 'right') => Promise<void>;
  setFilter: (side: 'left' | 'right', text: string) => void;
  toggleSelect: (side: 'left' | 'right', path: string) => void;
  selectRange: (side: 'left' | 'right', from: string, to: string, orderedPaths?: string[]) => void;
  clearSelection: (side: 'left' | 'right') => void;
  selectSingle: (side: 'left' | 'right', path: string) => void;
  selectAll: (side: 'left' | 'right') => void;
  setDirSizes: (sizes: Record<string, DirSizeResult>) => void;
  setSort: (side: 'left' | 'right', key: SortConfig['key']) => void;
  toggleHidden: (side: 'left' | 'right') => void;
  pinTab: (side: 'left' | 'right', tabId: string) => void;
  unpinTab: (side: 'left' | 'right', tabId: string) => void;
  repinTab: (side: 'left' | 'right', tabId: string) => void;
  closeTab: (side: 'left' | 'right', tabId: string) => void;
  loadPinnedTabs: () => Promise<void>;
  persistPinnedTabs: (side: 'left' | 'right') => void;
  addTab: (side: 'left' | 'right', path: string) => void;
  forkTab: (side: 'left' | 'right', tabId: string) => void;
  activateTab: (side: 'left' | 'right', tabId: string) => void;
  renameTab: (side: 'left' | 'right', tabId: string, label: string) => void;
  getGroups: (side: 'left' | 'right') => { name: string; tabIds: string[] }[];
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
    error: null,
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
  dirSizeMap: {},

  navigateTo: async (side, path, addToHistory = true) => {
    const panel = get()[side];

    set((s) => ({
      [side]: {
        ...s[side],
        loading: true,
        error: null,
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
      set((s) => ({ [side]: { ...s[side], entries, loading: false, error: null } }));
    } catch (err) {
      set((s) => ({
        [side]: {
          ...s[side],
          loading: false,
          entries: [],
          error: getIpcErrorMessage(err, '目录加载失败'),
        },
      }));
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
    set((s) => ({ [side]: { ...s[side], loading: true, error: null } }));
    try {
      const entries = await loadDir(panel.path, panel.sort, panel.showHidden);
      set((s) => ({ [side]: { ...s[side], entries, loading: false, error: null } }));
    } catch (err) {
      set((s) => ({
        [side]: {
          ...s[side],
          loading: false,
          error: getIpcErrorMessage(err, '目录刷新失败'),
        },
      }));
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

  selectRange: (side, from, to, orderedPaths) =>
    set((s) => {
      const panel = s[side];
      const paths = orderedPaths ?? panel.entries.map((e) => e.path);
      const fromIdx = paths.indexOf(from);
      const toIdx = paths.indexOf(to);
      if (fromIdx === -1 || toIdx === -1) return {};
      const start = Math.min(fromIdx, toIdx);
      const end = Math.max(fromIdx, toIdx);
      const selected = new Set<string>();
      for (let i = start; i <= end; i++) selected.add(paths[i]);
      return { [side]: { ...panel, selected } };
    }),

  clearSelection: (side) =>
    set((s) => ({ [side]: { ...s[side], selected: new Set() } })),

  selectSingle: (side, path) =>
    set((s) => ({ [side]: { ...s[side], selected: new Set([path]) } })),

  selectAll: (side) =>
    set((s) => ({
      [side]: { ...s[side], selected: new Set(s[side].entries.map((e) => e.path)) },
    })),

  setDirSizes: (sizes) =>
    set((s) => ({ dirSizeMap: { ...s.dirSizeMap, ...sizes } })),

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

  repinTab: (side, tabId) =>
    set((s) => {
      const currentPath = s[side].path;
      if (!currentPath) return {};
      const label = tabLabel(currentPath);
      return {
        [side]: {
          ...s[side],
          tabs: s[side].tabs.map((t) =>
            t.id === tabId ? { ...t, path: currentPath, label, initialPath: currentPath } : t,
          ),
        },
      };
    }),

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
            // 补充旧存盘数据中缺失的 initialPath
            tabs: s[side].tabs.map((t) =>
              t.id === exists.id && !t.initialPath ? { ...t, initialPath: t.path } : t,
            ),
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

  // TODO: 标签分组功能后续实现，目前返回空数组
  getGroups: () => [],

  loadPinnedTabs: async () => {
    try {
      const data = await ipc.invoke('tabs:load', undefined);
      const pinnedLeft = data.left.map((t, i) => ({ id: `pinned-left-${i}`, path: t.path, label: t.label, pinned: true as const, initialPath: t.initialPath }));
      const pinnedRight = data.right.map((t, i) => ({ id: `pinned-right-${i}`, path: t.path, label: t.label, pinned: true as const, initialPath: t.initialPath }));
      set((s) => ({
        left: {
          ...s.left,
          tabs: [...pinnedLeft, ...s.left.tabs.filter((t) => !t.pinned)],
          activeTabId: pinnedLeft.length > 0 ? pinnedLeft[pinnedLeft.length - 1].id : s.left.activeTabId,
          backStack: pinnedLeft.length > 0 ? [pinnedLeft[pinnedLeft.length - 1].path] : s.left.backStack,
        },
        right: {
          ...s.right,
          tabs: [...pinnedRight, ...s.right.tabs.filter((t) => !t.pinned)],
          activeTabId: pinnedRight.length > 0 ? pinnedRight[pinnedRight.length - 1].id : s.right.activeTabId,
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

/** 拼音混合匹配：输入可跨越词边界，每个词可匹配前缀或跳过 */
/** 混合拼音匹配，返回匹配的 word 下标数组，null 表示不匹配 */
function matchPinyinMixedIndices(input: string, words: string[]): number[] | null {
  const memo = new Map<string, number[] | null>();
  function dfs(i: number, w: number): number[] | null {
    if (i >= input.length) return [];
    if (w >= words.length) return null;
    const key = `${i},${w}`;
    if (memo.has(key)) return memo.get(key)!;
    const maxMatch = Math.min(words[w].length, input.length - i);
    // 只有还未匹配任何输入时才能跳过字(i===0允许n=0)，
    // 一旦开始匹配，必须连续匹配后续字，不能跳字
    const minN = i === 0 ? 0 : 1;
    for (let n = maxMatch; n >= minN; n--) {
      if (words[w].slice(0, n) === input.slice(i, i + n)) {
        const rest = dfs(i + n, w + 1);
        if (rest !== null) {
          const result = n > 0 ? [w, ...rest] : rest;
          memo.set(key, result);
          return result;
        }
      }
    }
    memo.set(key, null);
    return null;
  }
  return dfs(0, 0);
}

function matchPinyinMixed(input: string, words: string[]): boolean {
  return matchPinyinMixedIndices(input, words) !== null;
}

/** 获取指定面板筛选后的文件列表 */
export function useFilteredEntries(side: 'left' | 'right') {
  const entries = useFileStore((s) => s[side].entries);
  const filterText = useFileStore((s) => s[side].filterText);
  return useMemo(() => {
    if (!filterText) return entries;
    const lower = filterText.toLowerCase();
    return entries.filter((e) => {
      if (e.name.toLowerCase().includes(lower)) return true;
      if (getFileTypeSearchText(e).includes(lower)) return true;
      // 只有包含中文才做拼音匹配，避免纯英文文本被 pinyin-pro 逐字符拆分后误匹配
      if (!/[一-鿿]/.test(e.name)) return false;
      const full = pinyin(e.name, { toneType: 'none' }).replace(/\s+/g, '').toLowerCase();
      if (full.includes(lower)) return true;
      const initials = pinyin(e.name, { pattern: 'first', toneType: 'none' }).replace(/\s+/g, '').toLowerCase();
      if (initials.includes(lower)) return true;
      const words = pinyin(e.name, { toneType: 'none', type: 'array' }).map((w: string) => w.toLowerCase());
      return matchPinyinMixed(lower, words);
    });
  }, [entries, filterText]);
}

export interface TabGroup {
  name: string;
  path: string;
  tabIds: string[];
}

/** 拼音匹配高亮：返回每个字符是否匹配的分段 */
export function highlightMatches(
  name: string,
  filter: string,
): { text: string; match: boolean }[] {
  if (!filter) return [{ text: name, match: false }];

  const lowerName = name.toLowerCase();
  const lowerFilter = filter.toLowerCase();

  // 1. 直接子串匹配
  const directIdx = lowerName.indexOf(lowerFilter);
  if (directIdx >= 0) {
    const result: { text: string; match: boolean }[] = [];
    if (directIdx > 0) result.push({ text: name.slice(0, directIdx), match: false });
    result.push({ text: name.slice(directIdx, directIdx + filter.length), match: true });
    if (directIdx + filter.length < name.length)
      result.push({ text: name.slice(directIdx + filter.length), match: false });
    return result;
  }

  // 2. 拼音全拼匹配：找出 filter 在连续拼音串中的位置，反推中文字符
  const pyArray = pinyin(name, { toneType: 'none', type: 'array' }).map((w: string) =>
    w.toLowerCase(),
  );
  const fullPy = pyArray.join('');
  const pyIdx = fullPy.indexOf(lowerFilter);
  if (pyIdx >= 0) {
    const pyEnd = pyIdx + lowerFilter.length;
    let pos = 0;
    const result: { text: string; match: boolean }[] = [];
    for (let i = 0; i < pyArray.length; i++) {
      const char = name[i];
      const start = pos;
      const end = start + pyArray[i].length;
      const overlaps = start < pyEnd && end > pyIdx;
      if (overlaps && result.length > 0 && result[result.length - 1].match) {
        result[result.length - 1].text += char;
      } else if (overlaps) {
        result.push({ text: char, match: true });
      } else if (result.length > 0 && !result[result.length - 1].match) {
        result[result.length - 1].text += char;
      } else {
        result.push({ text: char, match: false });
      }
      pos = end;
    }
    return result;
  }

  // 3. 首字母匹配
  const initials = pyArray.map((p) => p[0]).join('');
  const initIdx = initials.indexOf(lowerFilter);
  if (initIdx >= 0) {
    const initEnd = initIdx + lowerFilter.length;
    const result: { text: string; match: boolean }[] = [];
    for (let i = 0; i < pyArray.length; i++) {
      const char = name[i];
      if (i >= initIdx && i < initEnd) {
        if (result.length > 0 && result[result.length - 1].match) {
          result[result.length - 1].text += char;
        } else {
          result.push({ text: char, match: true });
        }
      } else if (result.length > 0 && !result[result.length - 1].match) {
        result[result.length - 1].text += char;
      } else {
        result.push({ text: char, match: false });
      }
    }
    return result;
  }

  // 4. 混合拼音匹配 — 用匹配到的字下标精确定位高亮
  const matchedIndices = matchPinyinMixedIndices(lowerFilter, pyArray);
  if (matchedIndices) {
    const matchedSet = new Set(matchedIndices);
    const result: { text: string; match: boolean }[] = [];
    for (let i = 0; i < pyArray.length; i++) {
      const char = name[i];
      if (matchedSet.has(i)) {
        if (result.length > 0 && result[result.length - 1].match) {
          result[result.length - 1].text += char;
        } else {
          result.push({ text: char, match: true });
        }
      } else if (result.length > 0 && !result[result.length - 1].match) {
        result[result.length - 1].text += char;
      } else {
        result.push({ text: char, match: false });
      }
    }
    return result;
  }

  return [{ text: name, match: false }];
}

/** 按父目录给标签分组（≥2 个非固定标签同目录时成组） */
export function computeGroups(tabs: Tab[]): TabGroup[] {
  const nonPinned = tabs.filter((t) => !t.pinned);
  const groups = new Map<string, Tab[]>();
  for (const tab of nonPinned) {
    const parts = tab.path.split(/[/\\]/);
    parts.pop();
    const parentDir = parts.join('/') || tab.path;
    if (!groups.has(parentDir)) groups.set(parentDir, []);
    groups.get(parentDir)!.push(tab);
  }
  const result: TabGroup[] = [];
  for (const [p, members] of groups) {
    if (members.length >= 2) {
      const name = p.split(/[/\\]/).pop() || p;
      result.push({ name, path: p, tabIds: members.map((t) => t.id) });
    }
  }
  result.sort((a, b) => a.name.localeCompare(b.name));
  return result;
}
