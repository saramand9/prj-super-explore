import { useCallback, useRef, useEffect } from 'react';
import { useSearchStore } from '../store';
import { ipc } from '../../../framework/bridge/ipc-client';

export function SearchPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useSearchStore((s) => s.query);
  const results = useSearchStore((s) => s.results);
  const searching = useSearchStore((s) => s.searching);
  const selectedIdx = useSearchStore((s) => s.selectedIdx);
  const filePattern = useSearchStore((s) => s.filePattern);

  const setQuery = useSearchStore((s) => s.setQuery);
  const setFilePattern = useSearchStore((s) => s.setFilePattern);
  const search = useSearchStore((s) => s.search);
  const moveSelection = useSearchStore((s) => s.moveSelection);
  const openFile = useSearchStore((s) => s.openFile);

  // 分组结果按文件
  const grouped = groupByFile(results);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
          if (match) openFile(match);
          break;
        case 'Escape':
          useSearchStore.getState().clearResults();
          break;
      }
    },
    [results, selectedIdx, moveSelection, openFile],
  );

  // Ctrl+Enter 触发搜索
  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        search();
      }
    },
    [search],
  );

  const selectedMatch = results[selectedIdx];

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Search Bar */}
      <div className="flex-shrink-0 p-2 border-b border-border">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onKeyUp={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                search();
              }
            }}
            placeholder="搜索文件内容..."
            className="flex-1 bg-surface-lighter border border-border rounded px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            onClick={search}
            disabled={searching || !query.trim()}
            className="px-3 py-1.5 bg-accent text-white text-sm rounded hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searching ? '...' : '搜索'}
          </button>
        </div>
        <div className="flex gap-2 mt-1">
          <input
            type="text"
            value={filePattern}
            onChange={(e) => setFilePattern(e.target.value)}
            placeholder="文件名模式，例如 *.ts"
            className="flex-1 bg-surface-lighter border border-border rounded px-2 py-0.5 text-xs text-text-secondary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto">
        {results.length === 0 && !searching && query && (
          <div className="text-center text-text-muted py-8 text-sm">
            未找到结果
          </div>
        )}

        {results.length === 0 && !searching && !query && (
          <div className="text-center text-text-muted py-8 text-sm">
            输入搜索内容后按 Enter
          </div>
        )}

        {grouped.map((group) => (
          <div key={group.filePath}>
            {/* File header */}
            <div
              className="sticky top-0 px-3 py-1 bg-surface-light text-xs text-accent font-medium cursor-pointer hover:bg-surface-lighter"
              onClick={() =>
                ipc.invoke('file:open', { path: group.filePath })
              }
              title={group.filePath}
            >
              📄 {group.fileName}
              <span className="text-text-muted ml-2">
                ({group.matches.length} 个匹配)
              </span>
            </div>

            {/* Match lines */}
            {group.matches.map((match, idx) => {
              const globalIdx = results.indexOf(match);
              const isSelected = globalIdx === selectedIdx;
              return (
                <div
                  key={`${match.filePath}:${match.lineNumber}:${idx}`}
                  className={`flex items-start gap-2 px-3 py-0.5 text-xs cursor-pointer ${
                    isSelected
                      ? 'bg-accent/40 text-white'
                      : 'hover:bg-surface-lighter text-text-secondary'
                  }`}
                  onClick={() => {
                    useSearchStore.setState({ selectedIdx: globalIdx });
                    openFile(match);
                  }}
                  onMouseEnter={() =>
                    useSearchStore.setState({ selectedIdx: globalIdx })
                  }
                >
                  <span className="text-text-muted w-10 text-right flex-shrink-0">
                    {match.lineNumber}
                  </span>
                  <span className="truncate">{match.lineContent.trim()}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-2 py-1 border-t border-border text-xs text-text-muted flex gap-4">
        <span>{results.length} 个结果</span>
        <span>↑↓ 选择</span>
        <span>↵ 打开</span>
        <span>Esc 清空</span>
      </div>
    </div>
  );
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
