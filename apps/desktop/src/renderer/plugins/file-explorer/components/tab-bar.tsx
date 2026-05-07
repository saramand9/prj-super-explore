import { useCallback, useState, useRef, useEffect } from 'react';
import { useFileStore, type Tab } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';

interface TabBarProps {
  side: 'left' | 'right';
}

export function TabBar({ side }: TabBarProps) {
  const tabs = useFileStore((s) => s[side].tabs);
  const currentPath = useFileStore((s) => s[side].path);
  const navigateTo = useFileStore((s) => s.navigateTo);
  const pinTab = useFileStore((s) => s.pinTab);
  const unpinTab = useFileStore((s) => s.unpinTab);
  const closeTab = useFileStore((s) => s.closeTab);
  const persistPinnedTabs = useFileStore((s) => s.persistPinnedTabs);

  const [contextMenu, setContextMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleClick = useCallback(
    (tab: Tab) => {
      if (tab.path !== currentPath) {
        navigateTo(side, tab.path);
        useLayoutStore.getState().setPanelPath(side, tab.path);
      }
    },
    [side, currentPath, navigateTo],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent, tab: Tab) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ tab, x: e.clientX, y: e.clientY });
  }, []);

  const handlePin = useCallback(() => {
    if (contextMenu && !contextMenu.tab.pinned) {
      pinTab(side, contextMenu.tab.id);
      persistPinnedTabs(side);
    }
    setContextMenu(null);
  }, [contextMenu, side, pinTab, persistPinnedTabs]);

  const handleUnpin = useCallback(() => {
    if (contextMenu && contextMenu.tab.pinned) {
      unpinTab(side, contextMenu.tab.id);
      persistPinnedTabs(side);
    }
    setContextMenu(null);
  }, [contextMenu, side, unpinTab, persistPinnedTabs]);

  const handleClose = useCallback(() => {
    if (contextMenu) {
      closeTab(side, contextMenu.tab.id);
      persistPinnedTabs(side);
    }
    setContextMenu(null);
  }, [contextMenu, side, closeTab, persistPinnedTabs]);

  if (tabs.length === 0) return null;

  const pinnedTabs = tabs.filter((t) => t.pinned);
  const unpinnedTabs = tabs.filter((t) => !t.pinned);

  function tabClass(isActive: boolean, isPinned: boolean) {
    const base = 'flex items-center gap-1 px-2 py-0.5 rounded-t cursor-pointer select-none whitespace-nowrap transition-colors border-l-2 ';
    if (isActive) {
      return base + `bg-surface border-t border-x border-border/40 -mb-px ${isPinned ? 'text-accent border-l-accent' : 'text-text-primary border-l-transparent'}`;
    }
    if (isPinned) {
      return base + 'text-accent bg-accent/10 hover:bg-accent/20 border-l-accent/60';
    }
    return base + 'text-text-secondary hover:text-text-primary hover:bg-surface-lighter border-l-transparent';
  }

  function tabName(isActive: boolean, isPinned: boolean): string {
    if (isActive && isPinned) return '📍 Active · Pinned';
    if (isActive) return 'Active tab';
    if (isPinned) return 'Pinned tab';
    return '';
  }

  const renderTab = (tab: Tab) => {
    const isActive = tab.path === currentPath;
    const isPinned = tab.pinned;
    return (
      <div
        key={tab.id}
        className={tabClass(isActive, isPinned)}
        onClick={() => handleClick(tab)}
        onContextMenu={(e) => handleContextMenu(e, tab)}
        onMouseEnter={(e) => {
          setHoveredTabId(tab.id);
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          setTooltipPos({ x: rect.left, y: rect.bottom + 2 });
        }}
        onMouseLeave={() => setHoveredTabId(null)}
      >
        {isPinned && <span className="text-[10px] flex-shrink-0">📍</span>}
        <span className="truncate max-w-[120px]">{tab.label}</span>
        <span
          className="text-text-muted/0 group-hover:text-text-muted hover:text-accent cursor-pointer text-[10px] flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            closeTab(side, tab.id);
            persistPinnedTabs(side);
          }}
          title="Close"
        >
          ✕
        </span>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex items-center text-sm overflow-x-auto scrollbar-none border-b border-border/40 px-1 flex-shrink-0">
      {pinnedTabs.map(renderTab)}

      {pinnedTabs.length > 0 && unpinnedTabs.length > 0 && (
        <span className="w-px h-3 bg-border/50 mx-0.5 flex-shrink-0" />
      )}

      {unpinnedTabs.map(renderTab)}

      {/* 气泡路径提示 — fixed 定位，不受 overflow 影响 */}
      {hoveredTabId && tooltipPos && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="bg-surface-lighter border border-border rounded shadow-lg px-2 py-0.5 text-xs text-text-primary whitespace-nowrap">
            {tabs.find((t) => t.id === hoveredTabId)?.path}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-surface-light border border-border rounded shadow-lg py-1 min-w-[140px] text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1 text-text-muted truncate max-w-[250px] border-b border-border/50 mb-0.5">
            {contextMenu.tab.path}
          </div>
          {contextMenu.tab.pinned ? (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/20 text-text-secondary hover:text-text-primary"
              onClick={handleUnpin}
            >
              📍 Unpin tab
            </button>
          ) : (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/20 text-text-secondary hover:text-text-primary"
              onClick={handlePin}
            >
              📌 Pin tab
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-accent/20 text-text-secondary hover:text-text-primary"
            onClick={handleClose}
          >
            ✕ Close tab
          </button>
        </div>
      )}
    </div>
  );
}
