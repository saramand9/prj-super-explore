import { useState, useEffect, useRef, useCallback } from 'react';
import type { FileEntry } from '@explore/shared';
import { FileSearchIndex } from './file-search-index';
import { ipc } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';

interface FileSearchProps {
  side: 'left' | 'right';
  open: boolean;
  onClose: () => void;
}

export function FileSearch({ side, open, onClose }: FileSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [building, setBuilding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const indexRef = useRef<FileSearchIndex | null>(null);
  const indexPathRef = useRef<string | null>(null);

  // 打开搜索时构建 Trie
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setSelectedIdx(0);
    setTimeout(() => inputRef.current?.focus(), 50);

    const currentPath = useLayoutStore.getState().layout[side].path;
    if (!currentPath || currentPath === indexPathRef.current) return;

    setBuilding(true);
    const index = new FileSearchIndex();
    indexRef.current = index;
    indexPathRef.current = currentPath;

    ipc
      .invoke('file:walkTree', { path: currentPath, maxDepth: 5 })
      .then((entries) => {
        index.build(entries);
        indexPathRef.current = currentPath;
      })
      .catch(() => {})
      .finally(() => setBuilding(false));
  }, [open, side]);

  // 搜索
  const doSearch = useCallback(
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

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIdx(0);
      if (!indexRef.current?.isReady) return;
      doSearch(value);
    },
    [doSearch],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const entry = results[selectedIdx];
        if (entry) {
          if (entry.isDirectory) {
            useLayoutStore.getState().setPanelPath(side, entry.path);
          } else {
            ipc.invoke('file:open', { path: entry.path });
          }
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [results, selectedIdx, side, onClose],
  );

  if (!open) return null;

  return (
    <div className="absolute inset-x-0 top-0 z-50 mx-1 mt-1">
      <div className="bg-surface-light border border-border rounded-lg shadow-2xl overflow-hidden">
        {/* 输入框 */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
          <span className="text-text-muted text-sm">🔍</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
            placeholder={building ? 'Indexing...' : 'Search files and folders...'}
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

        {/* 结果列表 */}
        <div className="max-h-[320px] overflow-y-auto py-1">
          {building && (
            <div className="px-3 py-2 text-text-muted text-xs animate-pulse">
              Building index...
            </div>
          )}

          {!building && query && results.length === 0 && (
            <div className="px-3 py-2 text-text-muted text-xs">No results</div>
          )}

          {results.map((entry, idx) => {
            const isSelected = idx === selectedIdx;
            return (
              <div
                key={entry.path}
                className={`flex items-center gap-2 px-3 py-1 text-sm cursor-pointer ${
                  isSelected
                    ? 'bg-accent/30 text-text-primary'
                    : 'text-text-secondary hover:bg-surface-lighter'
                }`}
                onClick={() => {
                  if (entry.isDirectory) {
                    useLayoutStore.getState().setPanelPath(side, entry.path);
                  } else {
                    ipc.invoke('file:open', { path: entry.path });
                  }
                  onClose();
                }}
                onMouseEnter={() => setSelectedIdx(idx)}
              >
                <span className="flex-shrink-0">{entry.isDirectory ? '📁' : '📄'}</span>
                <span className="truncate">{entry.name}</span>
                <span className="text-text-muted text-xs truncate ml-auto flex-shrink-0 max-w-[40%]">
                  {entry.path}
                </span>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-2 py-1 border-t border-border/40 text-[10px] text-text-muted flex gap-3">
          <span>↑↓ Navigate</span>
          <span>↵ Open</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
