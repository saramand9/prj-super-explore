import { useCallback, useState, useRef, useEffect } from 'react';
import { useFileStore } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { ipc } from '../../../framework/bridge/ipc-client';

interface AddressBarProps {
  side: 'left' | 'right';
}

/** Windows 风格地址栏：面包屑 + 历史下拉 + 点击空白输入路径 */
function naturalName(fullPath: string): string {
  const name = fullPath.split(/[/\\]/).pop() || fullPath;
  return `起点 · ${name}`;
}

export function AddressBar({ side }: AddressBarProps) {
  const path = useFileStore((s) => s[side].path);
  const backStack = useFileStore((s) => s[side].backStack);
  const forwardStack = useFileStore((s) => s[side].forwardStack);
  const initialPath = useFileStore((s) => {
    const panel = s[side];
    const activeTab = panel.tabs.find((t) => t.id === panel.activeTabId);
    return activeTab?.initialPath ?? null;
  });
  const navigateTo = useFileStore((s) => s.navigateTo);
  const goBackFn = useFileStore((s) => s.goBack);
  const goForwardFn = useFileStore((s) => s.goForward);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [showBackHistory, setShowBackHistory] = useState(false);
  const [showForwardHistory, setShowForwardHistory] = useState(false);
  const [showQuickAccess, setShowQuickAccess] = useState(false);
  const [subDirs, setSubDirs] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const backBtnRef = useRef<HTMLButtonElement>(null);
  const fwdBtnRef = useRef<HTMLButtonElement>(null);

  const syncLayout = useCallback(
    (newPath: string) => {
      useLayoutStore.getState().setPanelPath(side, newPath);
    },
    [side],
  );

  const handleBack = useCallback(async () => {
    setShowBackHistory(false);
    await goBackFn(side);
    const newPath = useFileStore.getState()[side].path;
    if (newPath) syncLayout(newPath);
  }, [side, goBackFn, syncLayout]);

  const handleForward = useCallback(async () => {
    setShowForwardHistory(false);
    await goForwardFn(side);
    const newPath = useFileStore.getState()[side].path;
    if (newPath) syncLayout(newPath);
  }, [side, goForwardFn, syncLayout]);

  const handleNavigate = useCallback(
    (targetPath: string) => {
      navigateTo(side, targetPath);
      syncLayout(targetPath);
    },
    [side, navigateTo, syncLayout],
  );

  const startEdit = useCallback(() => {
    setEditValue(path ?? '');
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, [path]);

  const confirmEdit = useCallback(() => {
    setEditing(false);
    if (editValue.trim() && editValue !== path) {
      handleNavigate(editValue.trim());
    }
  }, [editValue, path, handleNavigate]);

  const cancelEdit = useCallback(() => {
    setEditing(false);
    setEditValue(path ?? '');
  }, [path]);

  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelEdit();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, cancelEdit]);

  // 点击外部关闭历史下拉
  useEffect(() => {
    if (!showBackHistory && !showForwardHistory) return;
    const handler = (e: MouseEvent) => {
      if (
        backBtnRef.current && !backBtnRef.current.contains(e.target as Node) &&
        fwdBtnRef.current && !fwdBtnRef.current.contains(e.target as Node)
      ) {
        // 检查是否点在下拉菜单内部
        const target = e.target as HTMLElement;
        if (!target.closest('.history-dropdown')) {
          setShowBackHistory(false);
          setShowForwardHistory(false);
        }
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showBackHistory, showForwardHistory]);

  // 打开快速访问时加载当前路径的子目录
  useEffect(() => {
    if (!showQuickAccess || !path) return;
    ipc
      .invoke('file:readDir', { path, showHidden: false })
      .then((entries) => {
        setSubDirs(entries.filter((e) => e.isDirectory).map((e) => e.path));
      })
      .catch(() => setSubDirs([]));
  }, [showQuickAccess, path]);

  if (!path) return null;

  const sep = path.includes('\\') ? '\\' : '/';
  const segments = path.split(sep).filter(Boolean);

  const parts: { label: string; fullPath: string }[] = [];
  if (segments.length > 0 && /^[A-Za-z]:$/.test(segments[0])) {
    parts.push({ label: segments[0], fullPath: segments[0] + sep });
    for (let i = 1; i < segments.length; i++) {
      const fullPath = parts[parts.length - 1].fullPath + segments[i] + sep;
      parts.push({ label: segments[i], fullPath });
    }
  } else {
    let accumulated = '';
    for (const seg of segments) {
      accumulated += sep + seg;
      parts.push({ label: seg, fullPath: accumulated });
    }
  }

  // 历史栈（最新在前）
  const backItems = [...backStack].reverse();
  const fwdItems = [...forwardStack].reverse();

  const initialName = initialPath ? (initialPath.split(/[/\\]/).pop() || initialPath) : null;

  return (
    <div className="flex items-center gap-0.5 flex-1 min-w-0 text-sm">
      {/* 后退 + 历史下拉 */}
      <div className="relative flex-shrink-0">
        <button
          ref={backBtnRef}
          className={`px-0.5 ${backStack.length > 0 ? 'text-text-secondary hover:text-accent' : 'text-text-muted/30 cursor-default'}`}
          onClick={() => {
            if (backStack.length > 0) {
              setShowBackHistory(!showBackHistory);
              setShowForwardHistory(false);
            }
          }}
          title="Back (click to see history)"
        >
          ◀
        </button>
        {showBackHistory && backItems.length > 0 && (
          <div className="history-dropdown absolute left-0 top-6 z-50 bg-surface-light border border-border rounded shadow-lg py-1 min-w-[280px] max-h-[300px] overflow-y-auto">
            {backItems.map((p) => (
              <button
                key={p}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-accent/20 hover:text-text-primary truncate"
                onClick={() => {
                  handleNavigate(p);
                  setShowBackHistory(false);
                }}
                title={p}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 前进 + 历史下拉 */}
      <div className="relative flex-shrink-0">
        <button
          ref={fwdBtnRef}
          className={`px-0.5 ${forwardStack.length > 0 ? 'text-text-secondary hover:text-accent' : 'text-text-muted/30 cursor-default'}`}
          onClick={() => {
            if (forwardStack.length > 0) {
              setShowForwardHistory(!showForwardHistory);
              setShowBackHistory(false);
            }
          }}
          title="Forward (click to see history)"
        >
          ▶
        </button>
        {showForwardHistory && fwdItems.length > 0 && (
          <div className="history-dropdown absolute left-0 top-6 z-50 bg-surface-light border border-border rounded shadow-lg py-1 min-w-[280px] max-h-[300px] overflow-y-auto">
            {fwdItems.map((p) => (
              <button
                key={p}
                className="w-full text-left px-3 py-1.5 text-xs text-text-secondary hover:bg-accent/20 hover:text-text-primary truncate"
                onClick={() => {
                  handleNavigate(p);
                  setShowForwardHistory(false);
                }}
                title={p}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 起始路径 — 🏠 + 路径简述 */}
      {initialPath && (
        <button
          className="flex-shrink-0 px-1.5 py-px rounded bg-accent/10 hover:bg-accent/30 text-accent text-[10px] transition-colors flex items-center gap-0.5"
          onClick={() => handleNavigate(initialPath)}
          title={`起点: ${initialPath}`}
        >
          <span>🏠</span>
          <span className="truncate max-w-[100px]">{naturalName(initialPath)}</span>
        </button>
      )}

      {/* 地址栏 */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={confirmEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirmEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          className="flex-1 bg-surface-lighter border border-accent rounded px-2 py-0.5 text-sm text-text-primary outline-none min-w-0"
          spellCheck={false}
        />
      ) : (
        <div className="relative flex-1 min-w-0">
          <div
            className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap scrollbar-none cursor-pointer flex-1"
            onClick={() => setShowQuickAccess(!showQuickAccess)}
            title="Click to show quick access"
          >
          {parts.map((part, i) => (
            <span key={part.fullPath} className="flex items-center gap-0.5">
              {i > 0 && <span className="text-text-muted/40">{sep}</span>}
              <span
                className={`hover:text-accent hover:bg-accent/10 rounded px-0.5 cursor-pointer ${
                  i === parts.length - 1
                    ? 'text-text-primary font-medium'
                    : 'text-text-secondary'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleNavigate(part.fullPath);
                }}
                title={part.fullPath}
              >
                {part.label}
              </span>
            </span>
          ))}
          <span className="w-1 flex-shrink-0" />
        </div>

        {/* Quick Access Dropdown */}
        {showQuickAccess && (
          <div className="absolute left-0 top-full mt-0.5 z-50 bg-surface-light border border-border rounded-lg shadow-xl py-1 min-w-[300px] max-h-[360px] overflow-y-auto">
            {/* 当前目录的子文件夹 */}
            {subDirs.length > 0 && (
              <>
                <div className="px-3 py-0.5 text-[10px] text-text-muted/60 uppercase tracking-wider">
                  Subfolders
                </div>
                {subDirs.slice(0, 15).map((p) => (
                  <button
                    key={p}
                    className="w-full text-left px-3 py-1 text-sm text-text-secondary hover:bg-accent/20 hover:text-text-primary flex items-center gap-2"
                    onClick={() => {
                      handleNavigate(p);
                      setShowQuickAccess(false);
                    }}
                  >
                    <span className="flex-shrink-0">📁</span>
                    <span className="truncate">{p.split(/[/\\]/).pop()}</span>
                  </button>
                ))}
                <div className="border-t border-border/40 my-0.5" />
              </>
            )}
            {/* 最近路径 + 固定标签路径 */}
            {(() => {
              const pinnedPaths = useFileStore.getState()[side].tabs
                .filter((t) => t.pinned)
                .map((t) => t.path);
              const quickPaths = [...new Set([...[...backStack].reverse(), ...pinnedPaths])].filter(
                (p) => p !== path,
              );
              if (quickPaths.length === 0) {
                return <div className="px-3 py-2 text-text-muted text-xs">No recent paths</div>;
              }
              return quickPaths.slice(0, 12).map((p) => (
                <button
                  key={p}
                  className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-accent/20 hover:text-text-primary flex items-center gap-2"
                  onClick={() => {
                    handleNavigate(p);
                    setShowQuickAccess(false);
                  }}
                >
                  <span className="flex-shrink-0">📁</span>
                  <span className="truncate">{p}</span>
                </button>
              ));
            })()}
            <div className="border-t border-border/40 mt-0.5 pt-0.5">
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-accent/20 hover:text-text-primary flex items-center gap-2"
                onClick={async () => {
                  setShowQuickAccess(false);
                  const currentPath = useFileStore.getState()[side].path;
                  const result = await ipc.invoke('dialog:openFolder', { defaultPath: currentPath ?? undefined });
                  if (result) handleNavigate(result);
                }}
              >
                <span>📂</span> Browse...
              </button>
              <button
                className="w-full text-left px-3 py-1.5 text-sm text-text-secondary hover:bg-accent/20 hover:text-text-primary flex items-center gap-2"
                onClick={() => {
                  setShowQuickAccess(false);
                  startEdit();
                }}
              >
                <span>✎</span> Edit path...
              </button>
            </div>
          </div>
        )}

        {/* Click-away */}
        {showQuickAccess && (
          <div className="fixed inset-0 z-40" onClick={() => setShowQuickAccess(false)} />
        )}
      </div>
      )}
    </div>
  );
}
