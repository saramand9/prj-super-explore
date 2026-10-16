import { useCallback, useEffect, useRef } from 'react';
import { FileText, FolderSearch } from 'lucide-react';
import { FULLTEXT_RESULT_LIMIT, useSearchStore } from '../store';
import { TaskWarnings } from '../../../components/task-warnings';

export function SearchPanel({ side }: { side: 'left' | 'right' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const searching = useSearchStore((s) => s.searching);
  const error = useSearchStore((s) => s.error);
  const previewError = useSearchStore((s) => s.previewError);
  const warnings = useSearchStore((s) => s.warnings);
  const cancelled = useSearchStore((s) => s.cancelled);
  const selectedIdx = useSearchStore((s) => s.selectedIdx);
  const filePattern = useSearchStore((s) => s.filePattern);
  const searchDir = useSearchStore((s) => s.searchDir);

  const setQuery = useSearchStore((s) => s.setQuery);
  const setFilePattern = useSearchStore((s) => s.setFilePattern);
  const search = useSearchStore((s) => s.search);
  const cancelSearch = useSearchStore((s) => s.cancelSearch);
  const moveSelection = useSearchStore((s) => s.moveSelection);
  const openFile = useSearchStore((s) => s.openFile);

  // 分组结果按文件
  const grouped = groupByFile(results);
  const previewSide = side === 'left' ? '右侧' : '左侧';

  useEffect(() => {
    resultsRef.current?.querySelector(`[data-result-index="${selectedIdx}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIdx]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.key !== 'Escape') return;
      if (e.target instanceof HTMLButtonElement && e.key === 'Enter') return;
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveSelection(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveSelection(-1);
          break;
        case 'Enter':
          e.preventDefault();
          const match = results[selectedIdx];
          if (match) void openFile(match, side);
          break;
        case 'Escape':
          useSearchStore.getState().clearResults();
          break;
      }
    },
    [results, selectedIdx, moveSelection, openFile, side],
  );

  // Enter / Ctrl+Enter 触发搜索，结果区的 Enter 用于预览。
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void search();
      } else if (e.key === 'ArrowDown' && results.length > 0) {
        e.preventDefault();
        resultsRef.current?.focus({ preventScroll: true });
      }
    },
    [search, results.length],
  );

  return (
    <div className="h-full flex flex-col bg-surface" onKeyDown={handleKeyDown}>
      {/* Search Bar */}
      <div className="flex-shrink-0 p-2 border-b border-border">
        <div className="flex items-center gap-2 px-1 pb-2 text-xs text-text-secondary">
          <FolderSearch className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate" title={searchDir ?? undefined}>
            {searchDir ? `范围：${searchDir}（含子文件夹）` : '请先在文件面板选择搜索目录'}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label="全文搜索内容"
            placeholder="搜索文件内容（普通文本）..."
            className="flex-1 min-w-0 bg-surface-lighter border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={searching ? cancelSearch : search}
            disabled={!searching && (!query.trim() || !searchDir)}
            className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? '停止' : '搜索'}
          </button>
        </div>
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            value={filePattern}
            onChange={(e) => setFilePattern(e.target.value)}
            onKeyDown={handleInputKeyDown}
            aria-label="全文搜索文件名筛选"
            placeholder="文件名筛选（可选），例如 *.ts"
            className="flex-1 min-w-0 bg-surface-lighter border border-border rounded px-2 py-0.5 text-xs text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Results */}
      <div ref={resultsRef} tabIndex={0} aria-label="全文搜索结果" className="flex-1 overflow-auto focus:outline-none">
        <TaskWarnings warnings={warnings} />
        {cancelled && <div className="px-3 py-2 text-xs text-text-muted">已停止搜索，保留已找到的结果</div>}
        {error && (
          <div className="px-3 py-3 text-red-400 text-xs whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
        {previewError && (
          <div role="alert" className="px-3 py-3 text-red-400 text-xs whitespace-pre-wrap break-words">
            {previewError}
          </div>
        )}

        {results.length === 0 && !searching && !error && !cancelled && query && (
          <div className="text-center text-text-muted py-8 text-sm">
            未找到结果
          </div>
        )}

        {results.length === 0 && !searching && !error && !query && (
          <div className="text-center text-text-muted py-8 text-sm">
            输入搜索内容后按 Enter
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.filePath}>
            {/* File header */}
            <div
              className="sticky top-0 px-3 py-1.5 bg-surface-light text-sm text-accent font-medium cursor-pointer hover:bg-surface-lighter"
              onClick={() => {
                useSearchStore.setState({ selectedIdx: results.indexOf(group.matches[0]) });
                resultsRef.current?.focus({ preventScroll: true });
                void openFile(group.matches[0], side);
              }}
              title={`${group.filePath}\n点击在${previewSide}预览`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{group.fileName}</span>
                <span className="text-text-muted text-xs flex-shrink-0">{group.matches.length} 个匹配</span>
              </div>
              <div className="pl-5 text-xs text-text-muted truncate">{group.filePath}</div>
            </div>

            {/* Match lines */}
            {group.matches.map((match, idx) => {
              const globalIdx = results.indexOf(match);
              const isSelected = globalIdx === selectedIdx;
              return (
                <div
                  key={`${match.filePath}:${match.lineNumber}:${idx}`}
                  data-result-index={globalIdx}
                  title={`在${previewSide}预览第 ${match.lineNumber} 行`}
                  className={`flex items-start gap-2 px-3 py-1 text-xs cursor-pointer ${
                    isSelected
                      ? 'bg-accent/40 text-white'
                      : 'hover:bg-surface-lighter text-text-secondary'
                  }`}
                  onClick={() => {
                    useSearchStore.setState({ selectedIdx: globalIdx });
                    resultsRef.current?.focus({ preventScroll: true });
                    void openFile(match, side);
                  }}
                >
                  <span className="text-text-muted w-10 text-right flex-shrink-0">
                    {match.lineNumber}
                  </span>
                  <span className="truncate"><HighlightedMatch text={match.lineContent.trim()} query={match.matchText || query} /></span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-2 py-1.5 border-t border-border text-xs text-text-muted flex flex-wrap gap-x-3 gap-y-1">
        <span>{results.length} 个结果</span>
        {searching && <span>搜索中…</span>}
        {results.length >= FULLTEXT_RESULT_LIMIT && <span>已达 {FULLTEXT_RESULT_LIMIT} 条上限，请缩小搜索范围</span>}
        <span>↑↓ 选择</span>
        <span>↵ {previewSide}预览</span>
        <span>Esc 清空</span>
      </div>
    </div>
  );
}

function HighlightedMatch({ text, query }: { text: string; query: string }) {
  const start = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (start < 0) return <>{text}</>;
  return <>
    {text.slice(0, start)}
    <mark className="bg-accent/20 text-accent font-semibold">{text.slice(start, start + query.length)}</mark>
    {text.slice(start + query.length)}
  </>;
}

/** 按文件分组搜索结果 */
function groupByFile(
  matches: import('@explore/shared').FulltextMatch[],
): { filePath: string; fileName: string; matches: import('@explore/shared').FulltextMatch[] }[] {
  const map = new Map<
    string,
    { filePath: string; fileName: string; matches: import('@explore/shared').FulltextMatch[] }
  >();
  for (const m of matches) {
    const existing = map.get(m.filePath);
    if (existing) {
      existing.matches.push(m);
    } else {
      map.set(m.filePath, { filePath: m.filePath, fileName: m.fileName, matches: [m] });
    }
  }
  return Array.from(map.values());
}
