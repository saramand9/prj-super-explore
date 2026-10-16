import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { FileText, Folder, Search, X } from 'lucide-react';
import type { FileEntry, FulltextMatch } from '@explore/shared';
import { useFileScan } from './use-file-scan';
import { TaskWarnings } from '../../../components/task-warnings';
import { getIpcErrorMessage, ipc } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { useFileStore } from '../store';
import { previewSearchResult, type SearchResultHighlight } from '../../fulltext-search/utils/preview-search-result';

type SearchMode = 'files' | 'content';

function hasWildcard(query: string): boolean {
  return query.includes('*') || query.includes('?');
}

function buildPattern(query: string): RegExp {
  const escaped = query.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const glob = escaped.replace(/\*/g, '.*?').replace(/\?/g, '.');
  return new RegExp(glob, 'gi');
}

function highlightMatch(text: string, query: string, allowWildcard = true): React.ReactNode {
  if (!query) return text;
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  if (allowWildcard && hasWildcard(query)) {
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
  const [openError, setOpenError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scan = useFileScan(open, side, setResults);
  const { building, error: fileError } = scan;

  // ── Content mode state ──
  const [contentResults, setContentResults] = useState<FulltextMatch[]>([]);
  const [contentSearching, setContentSearching] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentWarnings, setContentWarnings] = useState<string[]>([]);
  const [contentStopped, setContentStopped] = useState(false);
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
    setOpenError(null);
    setContentWarnings([]);
    setContentStopped(false);
    scan.search('');
    setSelectedIdx(0);
    setMode('files');
    const timer = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, [open, side, scan.search]);

  // ── Files 模式搜索 ──
  const doFileSearch = scan.search;

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
      ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
      const searchId = `content:${side}:${crypto.randomUUID()}`;
      contentSearchIdRef.current = searchId;
      setContentSearching(true);
      setContentError(null);
      setContentResults([]);
      setContentWarnings([]);
      setContentStopped(false);
      const off = ipc.on('search:progress', (progress) => {
        if (seq !== contentSearchSeqRef.current || progress.searchId !== searchId) return;
        setContentResults((entries) => [...entries, ...progress.matches]);
      });
      try {
        const result = await ipc.invoke('search:run', {
          dir,
          query: q,
          searchId,
          maxResults: 200,
        });
        if (seq !== contentSearchSeqRef.current) return;
        setContentResults(result.matches);
        setContentWarnings(result.warnings);
        setContentStopped(result.cancelled);
      } catch (err: any) {
        if (seq !== contentSearchSeqRef.current) return;
        setContentError(err?.message ?? '内容搜索失败');
      } finally {
        off();
        if (seq === contentSearchSeqRef.current) setContentSearching(false);
      }
    },
    [side],
  );

  const stopContentSearch = useCallback(() => {
    contentSearchSeqRef.current++;
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    contentTimerRef.current = null;
    void ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
    setContentSearching(false);
    setContentStopped(true);
  }, []);

  // ── 输入处理（含防抖） ──
  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      setOpenError(null);
      setSelectedIdx(0);

      if (mode === 'files') {
        doFileSearch(value);
      } else {
        contentSearchSeqRef.current += 1;
        ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
        setContentResults([]);
        setContentSearching(false);
        setContentError(null);
        setContentWarnings([]);
        setContentStopped(false);
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
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
    contentTimerRef.current = null;
    setMode(newMode);
    setSelectedIdx(0);
    if (newMode === 'files') {
      contentSearchSeqRef.current += 1;
      ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
      setContentResults([]);
      setContentError(null);
      setContentSearching(false);
      doFileSearch(query);
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

  // Cancel pending work when the popup closes, even though its component stays mounted.
  useEffect(() => {
    if (!open) setContentSearching(false);
    return () => {
      contentSearchSeqRef.current += 1;
      if (contentTimerRef.current) clearTimeout(contentTimerRef.current);
      contentTimerRef.current = null;
      ipc.invoke('search:cancel', { searchId: contentSearchIdRef.current }).catch(() => {});
    };
  }, [open]);

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
      highlight?: SearchResultHighlight,
    ) => {
      setOpenError(null);
      try {
        const dir = parentDir(filePath);
        await useFileStore.getState().navigateTo(side, dir);
        const panel = useFileStore.getState()[side];
        if (panel.path !== dir) return;
        if (panel.error) throw new Error(panel.error);
        useLayoutStore.getState().setPanelPlugin(side, 'file-explorer', 'browser');
        useLayoutStore.getState().setPanelPath(side, dir);
        useLayoutStore.getState().setActivePanel(side);
        useFileStore.getState().selectSingle(side, filePath);
        await previewSearchResult(side, filePath, highlight);
        onClose();
      } catch (err) {
        setOpenError(getIpcErrorMessage(err, '打开搜索结果失败'));
      }
    },
    [side, onClose],
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
        setSelectedIdx((i) => Math.max(0, Math.min(i + 1, totalItems - 1)));
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
              void revealAndOpenFile(entry.path);
            }
          }
        } else {
          const match = flatContentResults[selectedIdx];
          if (match) {
            void revealAndOpenFile(match.filePath, {
              lineNumber: match.lineNumber,
              columnStart: match.columnStart,
              columnEnd: match.columnEnd,
              text: match.matchText || query,
            });
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
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t transition-colors ${
              mode === 'files'
                ? 'bg-accent/20 text-accent font-medium'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => handleModeSwitch('files')}
          >
            <Folder className="w-3.5 h-3.5" /> 文件
          </button>
          <button
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t transition-colors ${
              mode === 'content'
                ? 'bg-accent/20 text-accent font-medium'
                : 'text-text-muted hover:text-text-secondary'
            }`}
            onClick={() => handleModeSwitch('content')}
          >
            <FileText className="w-3.5 h-3.5" /> 内容
          </button>
        </div>

        {/* ── 输入框 ── */}
        <div className="flex items-center gap-2 px-3 py-2">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            aria-label={mode === 'files' ? '搜索文件和文件夹' : '搜索文件内容'}
            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
            placeholder={
              mode === 'files'
                ? building
                  ? '扫描中，也可以输入名称搜索...'
                  : '搜索文件和文件夹...'
                : `在 ${searchDir ? searchDir.split(/[/\\]/).pop() : '...'} 中搜索文件内容`
            }
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            aria-label="关闭搜索"
            className="text-text-muted hover:text-accent text-sm"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 pb-2 text-xs text-text-secondary truncate" title={searchDir}>
          范围：{searchDir || '未选择目录'}（含子文件夹）
        </div>

        {/* ── 搜索结果 ── */}
        <div
          ref={resultsContainerRef}
          className="max-h-[calc(70vh-104px)] overflow-auto py-1"
        >
          {openError && (
            <div role="alert" className="px-3 py-2 text-red-400 text-xs whitespace-pre-wrap break-words">
              {openError}
            </div>
          )}
          {/* Files 模式 loading */}
          {mode === 'files' && building && (
            <div data-testid="scan-progress" className="px-3 py-2 text-text-muted text-xs flex items-center justify-between">
              <span>正在扫描，已索引 {scan.count} 项</span>
              <button className="text-accent" onClick={scan.stop}>停止扫描</button>
            </div>
          )}
          {mode === 'files' && !building && (
            <div data-testid="scan-status" className="px-3 py-2 text-text-muted text-xs flex items-center justify-between">
              <span>{scan.summary?.cancelled ? '已停止扫描，保留已索引内容' : `已索引 ${scan.count} 项`}{scan.summary?.truncated && '，已达扫描上限，请缩小范围'}</span>
              <button className="text-accent" onClick={scan.retry}>重新扫描</button>
            </div>
          )}
          {mode === 'files' && <TaskWarnings warnings={scan.summary?.warnings ?? []} />}

          {mode === 'files' && fileError && (
            <div className="px-3 py-2 text-red-400 text-xs whitespace-pre-wrap break-words">
              {fileError}
            </div>
          )}

          {/* Content 模式 loading */}
          {mode === 'content' && contentSearching && (
            <div className="px-3 py-2 text-text-muted text-xs flex items-center justify-between">
              <span>正在搜索，已找到 {contentResults.length} 个匹配</span>
              <button className="text-accent" onClick={stopContentSearch}>停止搜索</button>
            </div>
          )}
          {mode === 'content' && <TaskWarnings warnings={contentWarnings} />}
          {mode === 'content' && contentStopped && <div className="px-3 py-2 text-text-muted text-xs">已停止搜索，保留已找到的结果</div>}

          {mode === 'content' && contentError && (
            <div className="px-3 py-2 text-red-400 text-xs break-words">
              {contentError}
            </div>
          )}

          {/* 无结果 */}
          {mode === 'files' && !building && !fileError && !scan.summary?.cancelled && query && results.length === 0 && (
            <div className="px-3 py-2 text-text-muted text-xs">未找到文件</div>
          )}
          {mode === 'content' && !contentSearching && !contentError && !contentStopped && query && flatContentResults.length === 0 && (
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
                      void revealAndOpenFile(entry.path);
                    }
                  }}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.isDirectory ? <Folder className="w-4 h-4 flex-shrink-0" /> : <FileText className="w-4 h-4 flex-shrink-0" />}
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
                    <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate font-medium text-text-secondary" title={group.fileName}>
                      {group.fileName}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-5 text-text-muted leading-snug break-all whitespace-normal" title={group.filePath}>
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
                        void revealAndOpenFile(match.filePath, {
                          lineNumber: match.lineNumber,
                          columnStart: match.columnStart,
                          columnEnd: match.columnEnd,
                          text: match.matchText || query,
                        });
                      }}
                      onMouseEnter={() => setSelectedIdx(flatIdx)}
                    >
                      <span className="text-text-muted/50 flex-shrink-0 text-right w-8 tabular-nums">
                        {match.lineNumber}
                      </span>
                      <span className="truncate">
                        {highlightMatch(match.lineContent, query, false)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
        </div>

        {/* ── Footer ── */}
        <div className="px-3 py-2 border-t border-border/40 text-xs text-text-muted flex flex-wrap gap-x-3 gap-y-1">
          <span>↑↓ 切换</span>
          <span>{mode === 'content' ? `↵ 定位文件并在${side === 'left' ? '右侧' : '左侧'}预览` : '↵ 打开文件夹 / 定位并打开文件'}</span>
          <span>Tab 切换搜索方式</span>
          <span>Esc 关闭</span>
          {mode === 'content' && (
            <span className="text-text-muted/50">
              {flatContentResults.length} 个匹配
              {flatContentResults.length >= 200 && '（已达上限，请缩小搜索范围）'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
