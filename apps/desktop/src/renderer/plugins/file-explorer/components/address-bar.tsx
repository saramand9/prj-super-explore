import { useCallback, useState, useRef, useEffect } from 'react';
import { ExternalLink, Home } from 'lucide-react';
import { useFileStore } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { ipc } from '../../../framework/bridge/ipc-client';

interface AddressBarProps {
  side: 'left' | 'right';
  pathOverride?: string | null;
  onNavigate?: (path: string) => void;
}

function naturalName(fullPath: string): string {
  return '起点';
}

export function AddressBar({ side, pathOverride, onNavigate }: AddressBarProps) {
  const storePath = useFileStore((s) => s[side].path);
  const path = pathOverride ?? storePath;
  const initialPath = useFileStore((s) => {
    const panel = s[side];
    const activeTab = panel.tabs.find((t) => t.id === panel.activeTabId);
    return activeTab?.initialPath ?? null;
  });
  const navigateTo = useFileStore((s) => s.navigateTo);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const syncLayout = useCallback(
    (newPath: string) => {
      useLayoutStore.getState().setPanelPath(side, newPath);
    },
    [side],
  );

  const handleNavigate = useCallback(
    (targetPath: string) => {
      navigateTo(side, targetPath);
      syncLayout(targetPath);
      onNavigate?.(targetPath);
    },
    [side, navigateTo, syncLayout, onNavigate],
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

  // 展开时 Esc 折叠
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [expanded]);

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

  // 自适应折叠：首3段 + ... + 末2段
  const KEEP_FIRST = 3;
  const KEEP_LAST = 2;
  const COLLAPSE_THRESHOLD = KEEP_FIRST + KEEP_LAST;
  let visibleParts: { label: string; fullPath: string }[] = [];
  let isCollapsed = false;

  if (parts.length > COLLAPSE_THRESHOLD) {
    isCollapsed = true;
    visibleParts = [...parts.slice(0, KEEP_FIRST), ...parts.slice(-KEEP_LAST)];
  } else {
    visibleParts = parts;
  }

  // 展开时显示全部，折叠时缩略
  const displayParts = expanded ? parts : visibleParts;

  // 点击段落后折叠恢复
  const handleSegmentClick = useCallback(
    (fullPath: string) => {
      handleNavigate(fullPath);
      setExpanded(false);
    },
    [handleNavigate],
  );

  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setExpanded(true);
      // 下一帧注册折叠监听，避免同一点击事件触发
      requestAnimationFrame(() => {
        const collapse = (ev: MouseEvent) => {
          if (containerRef.current && !containerRef.current.contains(ev.target as HTMLElement)) {
            setExpanded(false);
            document.removeEventListener('mousedown', collapse);
          }
        };
        document.addEventListener('mousedown', collapse);
      });
    },
    [],
  );
  const initialName = initialPath ? (initialPath.split(/[/\\]/).pop() || initialPath) : null;

  return (
    <div className="flex items-center gap-0.5 flex-1 min-w-0 text-sm">
      {/* 起始路径 */}
      {initialPath && (
        <button
          className="flex-shrink-0 px-1.5 py-px rounded bg-accent/10 hover:bg-accent/30 text-accent text-[10px] transition-colors flex items-center gap-0.5"
          onClick={() => handleNavigate(initialPath)}
          title={`起点: ${initialPath}`}
        >
          <span><Home className="w-3.5 h-3.5" /></span>
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
      ) : (() => {
          const lastParts = displayParts.slice(-KEEP_LAST);
          const prefixParts = displayParts.slice(0, -KEEP_LAST);

          // 渲染单个面包屑段
          const renderSegment = (
            part: { label: string; fullPath: string },
            idx: number,
            isLast: boolean,
          ) => (
            <span key={part.fullPath} className="flex items-center gap-0.5">
              {idx > 0 && (
                <span className="text-text-muted/40 shrink-0">{sep}</span>
              )}
              <span
                className={`hover:text-accent hover:bg-accent/10 rounded px-0.5 cursor-pointer ${
                  isLast
                    ? 'text-text-primary font-medium shrink-0'
                    : 'text-text-secondary shrink min-w-0 truncate inline-block max-w-full align-bottom'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSegmentClick(part.fullPath);
                }}
                title={part.fullPath}
              >
                {part.label}
              </span>
            </span>
          );

          return (
        <div
          ref={containerRef}
          className="flex items-center gap-0.5 cursor-text flex-1 min-w-0 overflow-hidden"
          onClick={startEdit}
          title="Click to edit path"
        >
          {expanded ? (
            /* 展开模式 — 所有段自然换行 */
            <div className="flex items-center gap-0.5 flex-wrap min-w-0">
              {displayParts.map((part, i) =>
                renderSegment(part, i, i === displayParts.length - 1),
              )}
            </div>
          ) : (
            /* 正常模式 — 前缀可压缩，末2段永不截断 */
            <>
              {prefixParts.map((part, i) => (
                <span key={part.fullPath} className="flex items-center gap-0.5">
                  {i > 0 && (
                    <span className="text-text-muted/40 shrink-0">{sep}</span>
                  )}
                  <span
                    className="text-text-secondary hover:text-accent hover:bg-accent/10 rounded px-0.5 cursor-pointer shrink min-w-0 truncate"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSegmentClick(part.fullPath);
                    }}
                    title={part.fullPath}
                  >
                    {part.label}
                  </span>
                </span>
              ))}

              {/* 折叠省略号 — 在前缀段和末段之间，始终可见 */}
              {isCollapsed && (
                <span className="shrink-0 flex items-center gap-0.5">
                  <span className="text-text-muted/40 shrink-0">{sep}</span>
                  <span
                    className="text-xs text-accent hover:bg-accent/20 rounded px-0.5 cursor-pointer"
                    onClick={handleToggleExpand}
                    title="Click to expand full path"
                  >
                    ...
                  </span>
                </span>
              )}

              {/* 末 KEEP_LAST 段 — 永不截断 */}
              {lastParts.map((part, i) => {
                // 不需要前导分隔符：是第一个末段 且 前面没有任何段（无前缀 + 未折叠）
                const skipSep = i === 0 && prefixParts.length === 0 && !isCollapsed;
                return (
                  <span key={part.fullPath} className="flex items-center gap-0.5">
                    {!skipSep && (
                      <span className="text-text-muted/40 shrink-0">{sep}</span>
                    )}
                    <span
                      className={`hover:text-accent hover:bg-accent/10 rounded px-0.5 cursor-pointer shrink-0 ${
                        i === lastParts.length - 1
                          ? 'text-text-primary font-medium'
                          : 'text-text-secondary'
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSegmentClick(part.fullPath);
                      }}
                      title={part.fullPath}
                    >
                      {part.label}
                    </span>
                  </span>
                );
              })}
            </>
          )}
          <span className="w-1 shrink-0" />
        </div>
          );
        })()}

      {/* Open in Explorer */}
      <button
        className="flex-shrink-0 p-0.5 text-text-muted hover:text-text-primary hover:bg-white/5 rounded transition-colors"
        onClick={() => {
          if (path) ipc.invoke('file:openInExplorer', { path });
        }}
        title="Open in Explorer"
      >
        <ExternalLink className="w-4 h-4" />
      </button>
    </div>
  );
}
