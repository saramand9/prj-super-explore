import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useFileStore, type Tab, type TabGroup, computeGroups } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { SpaceDropdown } from './space-dropdown';

interface TabBarProps {
  side: 'left' | 'right';
}

export function TabBar({ side }: TabBarProps) {
  const tabs = useFileStore((s) => s[side].tabs);
  const activeTabId = useFileStore((s) => s[side].activeTabId);
  const navigateTo = useFileStore((s) => s.navigateTo);
  const activateTab = useFileStore((s) => s.activateTab);
  const pinTab = useFileStore((s) => s.pinTab);
  const unpinTab = useFileStore((s) => s.unpinTab);
  const closeTab = useFileStore((s) => s.closeTab);
  const forkTab = useFileStore((s) => s.forkTab);
  const renameTab = useFileStore((s) => s.renameTab);
  const persistPinnedTabs = useFileStore((s) => s.persistPinnedTabs);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const [contextMenu, setContextMenu] = useState<{ tab: Tab; x: number; y: number } | null>(null);
  const [hoveredTabId, setHoveredTabId] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
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
      if (tab.id !== activeTabId) {
        activateTab(side, tab.id);
        navigateTo(side, tab.path);
        useLayoutStore.getState().setPanelPath(side, tab.path);
      }
    },
    [side, activeTabId, activateTab, navigateTo],
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
      const wasActive = contextMenu.tab.id === activeTabId;
      closeTab(side, contextMenu.tab.id);
      persistPinnedTabs(side);
      if (wasActive) {
        const remaining = useFileStore.getState()[side].tabs;
        const next = remaining[remaining.length - 1];
        if (next) {
          navigateTo(side, next.path);
          useLayoutStore.getState().setPanelPath(side, next.path);
        }
      }
    }
    setContextMenu(null);
  }, [contextMenu, side, activeTabId, closeTab, navigateTo, persistPinnedTabs]);

  const handleFork = useCallback(() => {
    if (contextMenu) {
      forkTab(side, contextMenu.tab.id);
    }
    setContextMenu(null);
  }, [contextMenu, side, forkTab]);

  const handleRename = useCallback(() => {
    if (contextMenu) {
      setEditingTabId(contextMenu.tab.id);
      setEditValue(contextMenu.tab.label);
      setTimeout(() => editInputRef.current?.select(), 0);
    }
    setContextMenu(null);
  }, [contextMenu]);

  const confirmRename = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      renameTab(side, editingTabId, editValue.trim());
      persistPinnedTabs(side);
    }
    setEditingTabId(null);
  }, [editingTabId, editValue, side, renameTab, persistPinnedTabs]);

  // ── 分组布局（hook，必须在提前 return 之前）──
  const layout = useMemo(() => {
    const groups = computeGroups(tabs);
    const groupedTabIds = new Set(groups.flatMap((g) => g.tabIds));
    const items: Array<
      | { kind: 'tab'; tab: Tab }
      | { kind: 'group'; group: TabGroup }
    > = [];
    for (const tab of tabs) {
      if (tab.pinned) items.push({ kind: 'tab', tab });
    }
    for (const group of groups) {
      const isCollapsed = collapsedGroups.includes(group.path);
      items.push({ kind: 'group', group });
      if (!isCollapsed) {
        for (const tabId of group.tabIds) {
          const tab = tabs.find((t) => t.id === tabId);
          if (tab) items.push({ kind: 'tab', tab });
        }
      }
    }
    for (const tab of tabs) {
      if (!tab.pinned && !groupedTabIds.has(tab.id)) {
        items.push({ kind: 'tab', tab });
      }
    }
    return items;
  }, [tabs, collapsedGroups]);

  if (tabs.length === 0 && side !== 'left') return null;

  if (tabs.length === 0 && side === 'left') {
    return (
      <div className="flex items-center text-sm border-b border-border/40 px-1 flex-shrink-0 bg-[#2a2a35]">
        <SpaceDropdown />
        <span className="flex-1" />
      </div>
    );
  }

  function tabClass(isActive: boolean, isPinned: boolean) {
    const base = 'flex items-center gap-1 px-2 py-0.5 rounded-t cursor-pointer select-none whitespace-nowrap border-l-2 text-sm ';
    if (isActive) {
      const color = isPinned
        ? 'text-[#22c55e] border-l-[#22c55e]'
        : 'text-[#22c55e] border-l-[#22c55e]';
      return base + `bg-[#2a2a35] font-semibold scale-110 origin-bottom border-t border-x border-border/40 -mb-px transition-transform ${color}`;
    }
    if (isPinned) {
      return base + 'text-accent bg-accent/10 hover:bg-accent/20 border-l-accent/60 transition-colors';
    }
    return base + 'text-text-muted hover:text-text-primary hover:bg-emerald-500/10 border-l-transparent transition-colors';
  }

  function tabName(isActive: boolean, isPinned: boolean): string {
    if (isActive && isPinned) return '📍 Active · Pinned';
    if (isActive) return 'Active tab';
    if (isPinned) return 'Pinned tab';
    return '';
  }

  const renderTab = (tab: Tab) => {
    const isActive = tab.id === activeTabId;
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
        {editingTabId === tab.id ? (
          <input
            ref={editInputRef}
            className="bg-surface-lighter border border-accent rounded px-1 py-0 text-sm text-text-primary outline-none w-[100px]"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
              if (e.key === 'Escape') setEditingTabId(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate max-w-[120px]">{tab.label}</span>
        )}
        {!tab.pinned && (
          <span
          className="text-text-muted/0 group-hover:text-text-muted hover:text-accent cursor-pointer text-[10px] flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            const wasActive = tab.id === activeTabId;
            closeTab(side, tab.id);
            persistPinnedTabs(side);
            if (wasActive) {
              const remaining = useFileStore.getState()[side].tabs;
              const next = remaining[remaining.length - 1];
              if (next) {
                navigateTo(side, next.path);
                useLayoutStore.getState().setPanelPath(side, next.path);
              }
            }
          }}
          title="Close"
        >
          ✕
        </span>
        )}
      </div>
    );
  };

  const toggleGroupCollapse = (groupPath: string) => {
    setCollapsedGroups((prev) =>
      prev.includes(groupPath)
        ? prev.filter((p) => p !== groupPath)
        : [...prev, groupPath],
    );
  };

  const renderGroupHeader = (group: TabGroup) => {
    const isCollapsed = collapsedGroups.includes(group.path);
    const hasActiveChild = group.tabIds.includes(activeTabId!);
    return (
      <div
        key={`group-${group.path}`}
        className={`flex items-center gap-0.5 px-2 py-0.5 rounded-t cursor-pointer select-none whitespace-nowrap text-sm transition-colors border-l-2
          ${hasActiveChild && isCollapsed
            ? 'text-[#22c55e] font-semibold border-l-[#22c55e]'
            : 'text-text-muted hover:text-text-primary border-l-transparent hover:bg-surface-lighter'}`}
        onClick={() => toggleGroupCollapse(group.path)}
        title={`${group.path} (${group.tabIds.length} tabs)`}
      >
        <span className="text-[10px] flex-shrink-0">{isCollapsed ? '▸' : '▼'}</span>
        <span className="truncate max-w-[100px]">{group.name}</span>
        <span className="text-text-muted text-[10px]">({group.tabIds.length})</span>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex items-center text-sm overflow-x-auto scrollbar-none border-b border-border/40 px-1 flex-shrink-0 bg-[#2a2a35]">
      {side === 'left' && <SpaceDropdown />}
      {layout.map((item) => {
        if (item.kind === 'group') return renderGroupHeader(item.group);
        return renderTab(item.tab);
      })}

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
            onClick={handleRename}
          >
            ✏️ Rename tab
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-accent/20 text-text-secondary hover:text-text-primary"
            onClick={handleFork}
          >
            📋 Clone tab
          </button>
          {!contextMenu.tab.pinned && (
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-accent/20 text-text-secondary hover:text-text-primary"
            onClick={handleClose}
          >
            ✕ Close tab
          </button>
          )}
        </div>
      )}
    </div>
  );
}
