import { useEffect, useRef, useCallback } from 'react';
import { useLauncherStore } from '../store';
import { ipc } from '../../../framework/bridge/ipc-client';

export function Launcher() {
  const inputRef = useRef<HTMLInputElement>(null);
  const query = useLauncherStore((s) => s.query);
  const results = useLauncherStore((s) => s.results);
  const loading = useLauncherStore((s) => s.loading);
  const selectedIndex = useLauncherStore((s) => s.selectedIndex);

  const search = useLauncherStore((s) => s.search);
  const moveSelection = useLauncherStore((s) => s.moveSelection);
  const openSelected = useLauncherStore((s) => s.openSelected);
  const reset = useLauncherStore((s) => s.reset);

  // 监听 IPC 事件
  useEffect(() => {
    const unsub = ipc.on('launcher:show', () => {
      reset();
      setTimeout(() => inputRef.current?.focus(), 50);
    });

    const unsub2 = ipc.on('launcher:hide', () => {
      reset();
    });

    // Auto-focus on mount
    setTimeout(() => inputRef.current?.focus(), 50);

    return () => {
      unsub();
      unsub2();
    };
  }, [reset]);

  const handleInput = useCallback(
    (value: string) => {
      search(value);
    },
    [search],
  );

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
          openSelected();
          break;
        case 'Escape':
          e.preventDefault();
          ipc.invoke('window:toggleLauncher', undefined);
          break;
      }
    },
    [moveSelection, openSelected],
  );

  return (
    <div className="flex flex-col h-full bg-surface/95 rounded-xl border border-border shadow-2xl overflow-hidden">
      {/* Search Input */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center gap-3 border-b-2 border-accent pb-2">
          <span className="text-accent text-lg">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="搜索文件和程序..."
            className="flex-1 bg-transparent text-lg text-text-primary placeholder:text-text-muted focus:outline-none"
            autoFocus
          />
          {loading && <span className="text-text-muted text-xs animate-pulse">...</span>}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto px-2 pb-2">
        {results.length === 0 && query && !loading && (
          <div className="text-center text-text-muted py-8">未找到“{query}”</div>
        )}

        {results.length === 0 && !query && (
          <div className="text-center text-text-muted py-8">
            <div className="text-sm">输入关键字搜索已索引目录中的文件</div>
            <div className="text-xs mt-2">可在设置中配置索引路径</div>
          </div>
        )}

        {results.map((item, idx) => (
          <div
            key={item.path}
            className={`flex items-center gap-2 px-3 py-1.5 rounded cursor-pointer text-sm ${
              idx === selectedIndex
                ? 'bg-accent/40 text-white'
                : 'hover:bg-surface-lighter text-text-secondary'
            }`}
            onClick={() => {
              useLauncherStore.setState({ selectedIndex: idx });
              openSelected();
            }}
            onMouseEnter={() => useLauncherStore.setState({ selectedIndex: idx })}
          >
            <span>{item.isDirectory ? '📁' : '📄'}</span>
            <span className="flex-1 truncate">{item.name}</span>
            <span className="text-xs text-text-muted truncate max-w-[40%]">{item.path}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-1.5 border-t border-border text-xs text-text-muted flex gap-4">
        <span>↑↓ 选择</span>
        <span>↵ 打开</span>
        <span>Esc 关闭</span>
      </div>
    </div>
  );
}
