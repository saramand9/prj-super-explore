import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { FileEntry, FulltextMatch } from '@explore/shared';
import { FileSearchIndex } from './file-search-index';
import { getIpcErrorMessage, ipc } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { pluginManager } from '../../../framework/plugin-system';
import { useFileStore } from '../store';
import { useViewerStore } from '../../viewer/store';

type SearchMode = 'files' | 'content';

function hasWildcard(query: string): boolean {
  return query.includes('*') || query.includes('?');
}

function buildPattern(query: string): RegExp {
  const escaped = query.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const glob = escaped.replace(/\*/g, '.*?').replace(/\?/g, '.');
  return new RegExp(glob, 'gi');
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  if (hasWildcard(query)) {
    const regex = buildPattern(query);
    const matches = [...text.matchAll(regex)];
    for (const match of matches) {
      if (match.index === undefined) continue;
      if (match.index > cursor) {
        parts.push(<span key={cursor}>{text.slice(cursor, match.index)}</span>);
      }
      if (match[0].length > 0) {
        parts.push(
          <span key={match.index} className="text-green font-bold">
            {match[0]}
          </span>,
        );
        cursor = match.index + match[0].length;
      }
    }
  } else {
    const lower = text.toLowerCase();
    const q = query.toLowerCase();
    while (cursor < text.length) {
      const idx = lower.indexOf(q, cursor);
      if (idx === -1) break;
      if (idx > cursor) {
        parts.push(<span key={cursor}>{text.slice(cursor, idx)}</span>);
      }
      parts.push(
        <span key={idx} className="text-green font-bold">
          {text.slice(idx, idx + q.length)}
        </span>,
      );
      cursor = idx + q.length;
    }
  }

  if (cursor < text.length) {
    parts.push(<span key={cursor}>{text.slice(cursor)}</span>);
  }
  return <>{parts}</>;
}

function parentDir(filePath: string): string {
  const idx = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (idx === 2 && filePath[1] === ':') return filePath.slice(0, 3);
  if (idx <= 0) return filePath;
  return filePath.slice(0, idx);
}

function fileExt(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() ?? filePath;
  const idx = name.lastIndexOf('.');
  return idx >= 0 ? name.slice(idx).toLowerCase() : '';
}

interface FileSearchProps {
  side: 'left' | 'right';
  open: boolean;
  onClose: () => void;
}

export function FileSearch({ side, open, onClose }: FileSearchProps) {
  const [mode, setMode] = useState<SearchMode>('files');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [building, setBuilding] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<FileSearchIndex | null>(null);
  const indexPathRef = useRef<string | null>(null);

  // ── Content mode state ──
  const [contentResults, setContentResults] = useState<FulltextMatch[]>([]);
  const [contentSearching, setContentSearching] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentSearchIdRef = useRef(`file-search:${side}:${Date.now()}`);
  const contentSearchSeqRef = useRef(0);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  // 打开搜索时重置
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setContentResults([]);
    setContentError(null);
    setFileError(null);
    setSelectedIdx(0);
    setMode('files');
    setTimeout(() => inputRef.current?.focus(), 50);

    // Files 模式: 构建 Trie 索引
    const currentPath = useLayoutStore.getState().layout[side].path;
    if (!currentPath || currentPath === indexPathRef.current) return;

    setBuilding(true);
    const index = new FileSearchIndex();
    indexRef.current = index;
    indexPathRef.current = currentPath;

    ipc
      .invoke('file:walkTree', { path: currentPath })
      .then((entries) => {
        index.build(entries);
        indexPathRef.current = currentPath;
      })
      .catch((err) => {
        setFileError(getIpcErrorMessage(err, '文件搜索索引建立失败'));
      })
      .finally(() => setBuilding(false));
  }, [open, side]);

  // ── Files 模式搜索 ──
  const doFileSearch = useCallback(
    (q: string) => {
      if (!indexRef.current?.isReady || !q.trim()) {
        setResults([]);
        return;
      }
      const matches = indexRef.current.search(q, 50);
      setResults(matches);
    },
    [],
  );

  // ── Content 模式搜索 (ripgrep) ──
  const doContentSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) {
        contentSearchSeqRef.current += 1;
        ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
        setContentResults([]);
        setContentError(null);
        setContentSearching(false);
        return;
      }
      const dir = useLayoutStore.getState().layout[side].path;
      if (!dir) {
        setContentResults([]);
        setContentError('未选择搜索目录');
        setContentSearching(false);
        return;
      }

      const seq = ++contentSearchSeqRef.current;
      setContentSearching(true);
      setContentError(null);
      try {
        const matches = await ipc.invoke('search:fulltext', {
          dir,
          query: q,
          searchId: contentSearchIdRef.current,
          maxResults: 200,
        });
        if (seq !== contentSearchSeqRef.current) return;
        setContentResults(matches);
      } catch (err: any) {
        if (seq !== contentSearchSeqRef.current) return;
        setContentResults([]);
        setContentError(err?.message ?? '内容搜索失败');
      } finally {
        if (seq === contentSearchSeqRef.current) setContentSearching(false);
      }
    },
    [side],
  );

  // ── 输入处理（含防抖） ──
  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIdx(0);

      if (mode === 'files') {
        if (!indexRef.current?.isReady) return;
        doFileSearch(value);
      } else {
        setContentError(null);
        // 300ms 防抖
        if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
        contentTimerRef.current = setTimeout(() => {
          doContentSearch(value);
        }, 300);
      }
    },
    [mode, doFileSearch, doContentSearch],
  );

  // 切换模式时清空结果
  const handleModeSwitch = useCallback((newMode: SearchMode) => {
    setMode(newMode);
    setSelectedIdx(0);
    if (newMode === 'files') {
      contentSearchSeqRef.current += 1;
      ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
      setContentResults([]);
      setContentError(null);
      setContentSearching(false);
      if (query && indexRef.current?.isReady) doFileSearch(query);
    } else {
      setResults([]);
      if (query) {
        if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
        contentTimerRef.current = setTimeout(() => {
          doContentSearch(query);
        }, 300);
      }
    }
    // 切模式后重新聚焦
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [query, doFileSearch, doContentSearch]);

  // 清理 timer
  useEffect(() => {
    return () => {
      contentSearchSeqRef.current += 1;
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
      ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
    };
  }, []);

  // ── 内容搜索结果分组 ──
  const contentGroups = useMemo(() => {
    const groups: { filePath: string; fileName: string; matches: FulltextMatch[] }[] = [];
    const seen = new Map<string, number>();
    for (const m of contentResults) {
      const idx = seen.get(m.filePath);
      if (idx !== undefined) {
        groups[idx].matches.push(m);
      } else {
        seen.set(m.filePath, groups.length);
        groups.push({ filePath: m.filePath, fileName: m.fileName, matches: [m] });
      }
    }
    return groups;
  }, [contentResults]);

  // 内容结果扁平化（用于键盘导航）
  const flatContentResults = useMemo(
    () => contentResults,
    [contentResults],
  );

  // ── 键盘导航 ──
  const totalItems = mode === 'files' ? results.length : flatContentResults.length;

  const revealAndOpenFile = useCallback(
    async (
      filePath: string,
      highlight?: { lineNumber: number; columnStart?: number; columnEnd?: number; text: string },
    ) => {
      const sourceSide = side;
      const targetSide = sourceSide === 'left' ? 'right' : 'left';
      const dir = parentDir(filePath);

      useLayoutStore.getState().setPanelPlugin(sourceSide, 'file-explorer', 'browser');
      await useFileStore.getState().navigateTo(sourceSide, dir);
      useLayoutStore.getState().setPanelPath(sourceSide, dir);
      useLayoutStore.getState().setActivePanel(sourceSide);
      useFileStore.getState().selectSingle(sourceSide, filePath);

      const handler = pluginManager.getFileHandlerForExtension(fileExt(filePath));
      if (handler) {
        useViewerStore.getState().setSearchHighlight(
          targetSide,
          highlight
            ? {
                filePath,
                lineNumber: highlight.lineNumber,
                columnStart: highlight.columnStart,
                columnEnd: highlight.columnEnd,
                text: highlight.text,
              }
            : null,
        );
        useLayoutStore.getState().setPanelPath(targetSide, filePath);
        useLayoutStore.getState().setPanelPlugin(targetSide, handler.pluginId, handler.panelId);
      } else {
        useViewerStore.getState().setSearchHighlight(targetSide, null);
        ipc.invoke('file:open', { path: filePath });
      }
    },
    [side],
  );

  const openDirectoryResult = useCallback(
    (dirPath: string) => {
      onClose();
      window.setTimeout(() => {
        useLayoutStore.getState().setPanelPlugin(side, 'file-explorer', 'browser');
        void useFileStore.getState().navigateTo(side, dirPath);
        useLayoutStore.getState().setPanelPath(side, dirPath);
      }, 0);
    },
    [side, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, totalItems - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (mode === 'files') {
          const entry = results[selectedIdx];
          if (entry) {
            if (entry.isDirectory) {
              openDirectoryResult(entry.path);
            } else {
              revealAndOpenFile(entry.path);
              onClose();
            }
          }
        } else {
          const match = flatContentResults[selectedIdx];
          if (match) {
            revealAndOpenFile(match.filePath, {
              lineNumber: match.lineNumber,
              columnStart: match.columnStart,
              columnEnd: match.columnEnd,
              text: match.matchText || query,
            });
            onClose();
          }
        }
      } else if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        handleModeSwitch(mode === 'files' ? 'content' : 'files');
      }
    },
    [results, flatContentResults, selectedIdx, mode, totalItems, query, revealAndOpenFile, openDirectoryResult, handleModeSwitch, onClose],
  );

  // 选中项自动滚入视野
  useEffect(() => {
    if (mode !== 'content') return;
    const el = resultsContainerRef.current;
    if (!el) return;
    const selected = el.querySelector(`[data-content-idx="${selectedIdx}"]`);
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIdx, mode]);

  if (!open) return null;

  const searchDir = useLayoutStore.getState().layout[side].path || '';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={onClose}
      >
      <div
        className="bg-surface-light border border-border rounded-lg shadow-2xl w-[880px] max-w-[92vw] max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 模式切换 tabs ── */}
        <div className="flex border-b border-border/40 px-3 pt-2 gap-1">
          <button
            className={`px-3 py-1 text-xs rounded-t transition-colors ${
              mode === 'files'
                ? 'bg-accent/20 text-accent font-medium'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => handleModeSwitch('files')}
          >
            📁 文件
          </button>
          <button
            className={`px-3 py-1 text-xs rounded-t transition-colors ${
              mode === 'content'
                ? 'bg-accent/20 text-accent font-medium'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => handleModeSwitch('content')}
          >
            🔎 内容
          </button>
        </div>

        {/* ── 输入框 ── */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-text-muted text-sm">
            {mode === 'files' ? '🔍' : '🔎'}
          </span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
            placeholder={
              mode === 'files'
                ? building
                  ? '正在建立索引...'
                  : '搜索文件和文件夹...'
                : `在 ${searchDir ? searchDir.split(/[/\\]/).pop() : '...'} 中搜索文件内容`
            }
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="text-text-muted hover:text-accent text-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* ── 搜索结果 ── */}
        <div
          ref={resultsContainerRef}
          className="max-h-[calc(70vh-104px)] overflow-auto py-1"
        >
          {/* Files 模式 loading */}
          {mode === 'files' && building && (
            <div className="px-3 py-2 text-text-muted text-xs animate-pulse">
              正在建立索引...
            </div>
          )}

          {mode === 'files' && fileError && (
            <div className="px-3 py-2 text-red-400 text-xs whitespace-pre-wrap break-words">
              {fileError}
            </div>
          )}

          {/* Content 模式 loading */}
          {mode === 'content' && contentSearching && (
            <div className="px-3 py-2 text-text-muted text-xs animate-pulse">
              正在搜索...
            </div>
          )}

          {mode === 'content' && contentError && (
            <div className="px-3 py-2 text-red-400 text-xs break-words">
              {contentError}
            </div>
          )}

          {/* 无结果 */}
          {mode === 'files' && !building && !fileError && query && results.length === 0 && (
            <div className="px-3 py-2 text-text-muted text-xs">未找到文件</div>
          )}
          {mode === 'content' && !contentSearching && !contentError && query && flatContentResults.length === 0 && (
            <div className="px-3 py-2 text-text-muted text-xs">未找到内容匹配</div>
          )}

          {/* ── Files 结果列表 ── */}
          {mode === 'files' &&
            results.map((entry, idx) => {
              const isSelected = idx === selectedIdx;
              return (
                <div
                  key={entry.path}
                  className={`px-3 py-1.5 text-sm cursor-pointer ${
                    isSelected
                      ? 'bg-accent/30 text-text-primary'
                      : 'text-text-secondary hover:bg-surface-lighter'
                  }`}
                  onClick={() => {
                    if (entry.isDirectory) {
                      openDirectoryResult(entry.path);
                    } else {
                      revealAndOpenFile(entry.path);
                      onClose();
                    }
                  }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex-shrink-0">{entry.isDirectory ? '📁' : '📄'}</span>
                    <span className="truncate min-w-0 font-medium">{highlightMatch(entry.name, query)}</span>
                  </div>
                  <div className="mt-0.5 pl-6 text-text-muted text-xs leading-snug break-all whitespace-normal" title={entry.path}>
                    {entry.path}
                  </div>
                </div>
              );
            })}

          {/* ── Content 结果列表（按文件分组） ── */}
          {mode === 'content' &&
            contentGroups.map((group) => (
              <div key={group.filePath} className="mb-1">
                {/* 文件头 */}
                <div className="px-3 py-1 text-xs text-text-muted min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="flex-shrink-0">📄</span>
                    <span className="truncate font-medium text-text-secondary" title={group.fileName}>
                      {group.fileName}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-5 text-text-muted/50 leading-snug break-all whitespace-normal" title={group.filePath}>
                    {group.filePath}
                  </div>
                </div>
                {/* 匹配行 */}
                {group.matches.map((match) => {
                  const flatIdx = flatContentResults.indexOf(match);
                  const isSelected = flatIdx === selectedIdx;
                  return (
                    <div
                      key={`${match.filePath}:${match.lineNumber}`}
                      data-content-idx={flatIdx}
                      className={`flex items-start gap-2 px-3 py-0.5 text-xs cursor-pointer ${
                        isSelected
                          ? 'bg-accent/30 text-text-primary'
                          : 'text-text-secondary hover:bg-surface-lighter'
                      }`}
                      onClick={() => {
                        revealAndOpenFile(match.filePath, {
                          lineNumber: match.lineNumber,
                          columnStart: match.columnStart,
                          columnEnd: match.columnEnd,
                          text: match.matchText || query,
                        });
                        onClose();
                      }}
                      onMouseEnter={() => setSelectedIdx(flatIdx)}
                    >
                      <span className="text-text-muted/50 flex-shrink-0 text-right w-8 tabular-nums">
                        {match.lineNumber}
                      </span>
                      <span className="truncate">
                        {highlightMatch(match.lineContent, query)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>

        {/* ── Footer ── */}
        <div className="px-2 py-1 border-t border-border/40 text-[10px] text-text-muted flex gap-3">
          <span>↑↓ 切换</span>
          <span>↵ 打开</span>
          <span>Esc 关闭</span>
          {mode === 'content' && (
            <span className="text-text-muted/50">
              {flatContentResults.length} 个匹配
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
