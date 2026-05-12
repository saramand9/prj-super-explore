import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { Pin, PinOff, X, Pencil, Copy, ChevronRight, ChevronDown, Folder, RefreshCw } from 'lucide-react';
import { useFileStore, type Tab, type TabGroup, computeGroups } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { ipc } from '../../../framework/bridge/ipc-client';
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
  const repinTab = useFileStore((s) => s.repinTab);
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
  const sizerRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // 重命名输入框自适应宽度
  useEffect(() => {
    if (editingTabId && editInputRef.current && sizerRef.current) {
      const width = sizerRef.current.offsetWidth + 16; // padding
      editInputRef.current.style.width = `${Math.max(80, width)}px`;
    }
  }, [editValue, editingTabId]);

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

  const handleRepin = useCallback(() => {
    if (contextMenu) {
      repinTab(side, contextMenu.tab.id);
      persistPinnedTabs(side);
    }
    setContextMenu(null);
  }, [contextMenu, side, repinTab, persistPinnedTabs]);

  const handleClose = useCallback(async () => {
    if (!contextMenu) return;
    const tab = contextMenu.tab;
    if (tab.pinned) {
      const confirmed = await ipc.invoke('dialog:confirm', {
        message: `Close pinned tab "${tab.label}"?\n\nIt will be unpinned and closed.`,
      });
      if (!confirmed) { setContextMenu(null); return; }
      unpinTab(side, tab.id);
    }
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
    setContextMenu(null);
  }, [contextMenu, side, activeTabId, closeTab, unpinTab, navigateTo, persistPinnedTabs]);

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

  const layout = useMemo(() => {
    const groups = computeGroups(tabs);
    const groupedTabIds = new Set(groups.flatMap((g) => g.tabIds));
    const items: Array<
      | { kind: 'tab'; tab: Tab; grouped: boolean }
      | { kind: 'group'; group: TabGroup }
    > = [];
    const renderedTabs = new Set<string>();
    for (const tab of tabs) {
      if (renderedTabs.has(tab.id)) continue;
      if (groupedTabIds.has(tab.id)) {
        const group = groups.find((g) => g.tabIds.includes(tab.id));
        if (group) {
          const isCollapsed = collapsedGroups.includes(group.path);
          items.push({ kind: 'group', group });
          for (const tabId of group.tabIds) {
            renderedTabs.add(tabId);
            if (!isCollapsed) {
              const t = tabs.find((x) => x.id === tabId);
              if (t) items.push({ kind: 'tab', tab: t, grouped: true });
            }
          }
        }
      } else {
        items.push({ kind: 'tab', tab, grouped: false });
      }
    }
    return items;
  }, [tabs, collapsedGroups]);

  if (tabs.length === 0 && side !== 'left') return null;

  if (tabs.length === 0 && side === 'left') {
    return (
      <div className="flex items-center px-1 flex-shrink-0 h-8">
        <SpaceDropdown />
        <span className="flex-1" />
      </div>
    );
  }

  const renderTab = (tab: Tab, indented = false) => {
    const isActive = tab.id === activeTabId;
    const isPinned = tab.pinned;
    return (
      <div
        key={tab.id}
        className={`group flex items-center gap-1.5 py-1 cursor-pointer select-none text-xs transition-colors duration-150 border-t border-x rounded-t -mb-px min-w-[60px] ${
          indented ? 'pl-6 pr-3' : 'px-3'
        } ${
          isActive
            ? 'text-text-primary bg-surface-light border-border font-medium'
            : 'text-text-muted hover:text-text-secondary hover:bg-surface-lighter border-transparent'
        }`}
        onClick={() => handleClick(tab)}
        onContextMenu={(e) => handleContextMenu(e, tab)}
        onMouseEnter={(e) => {
          setHoveredTabId(tab.id);
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          setTooltipPos({ x: rect.left, y: rect.bottom + 2 });
        }}
        onMouseLeave={() => setHoveredTabId(null)}
      >
        {isPinned && (
          <Pin className="w-3 h-3 flex-shrink-0 text-accent/60" />
        )}
        {editingTabId === tab.id ? (
          <>
          <span
            ref={sizerRef}
            className="px-1.5 py-0 text-xs whitespace-pre invisible fixed"
            aria-hidden="true"
          >
            {editValue || ' '}
          </span>
          <input
            ref={editInputRef}
            className="bg-surface-lighter border border-accent/50 rounded px-1.5 py-0 text-xs text-text-primary outline-none w-[80px]"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={confirmRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') confirmRename();
              if (e.key === 'Escape') setEditingTabId(null);
            }}
            onClick={(e) => e.stopPropagation()}
          />
          </>
        ) : (
          <span className="truncate min-w-0">{tab.label}</span>
        )}
        {!tab.pinned && (
          <span
            className="opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-text-primary cursor-pointer flex-shrink-0 rounded-sm hover:bg-white/5 transition-all p-0.5"
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
            <X className="w-3 h-3" />
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
        className={`flex items-center gap-1 px-3 py-1 cursor-pointer select-none whitespace-nowrap text-xs transition-colors duration-150 ${
          hasActiveChild
            ? 'text-accent bg-accent/5 font-medium'
            : 'text-text-secondary bg-surface-lighter/50 hover:text-text-primary'
        }`}
        onClick={() => toggleGroupCollapse(group.path)}
        title={`${group.path} (${group.tabIds.length} tabs)`}
      >
        {isCollapsed ? <ChevronRight className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
        <Folder className="w-3 h-3 flex-shrink-0 text-accent/60" />
        <span className="truncate max-w-[120px]">{group.name}</span>
        <span className="text-text-muted/50">· {group.tabIds.length}</span>
      </div>
    );
  };

  return (
    <div ref={containerRef} className="flex items-center overflow-x-auto scrollbar-none px-1 flex-shrink-0 gap-0.5 h-8">
      {side === 'left' && <SpaceDropdown />}
      {layout.map((item) => {
        if (item.kind === 'group') return renderGroupHeader(item.group);
        return renderTab(item.tab, item.grouped);
      })}

      {hoveredTabId && tooltipPos && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="bg-surface-light border border-border/50 rounded-md shadow-lg px-3 py-1.5 text-xs text-text-primary whitespace-nowrap">
            {tabs.find((t) => t.id === hoveredTabId)?.path}
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-surface-light border border-border/50 rounded-lg shadow-xl py-1 min-w-[160px] text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-text-muted truncate max-w-[250px] border-b border-border/30 mb-0.5">
            {contextMenu.tab.path}
          </div>
          {contextMenu.tab.pinned ? (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
            >
              <Pin className="w-3.5 h-3.5" /> Pin tab
            </button>
          ) : (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
              onClick={handlePin}
            >
              <Pin className="w-3.5 h-3.5" /> Pin tab
            </button>
          )}
          {contextMenu.tab.pinned ? (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
              onClick={handleUnpin}
            >
              <PinOff className="w-3.5 h-3.5" /> Unpin tab
            </button>
          ) : (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
            >
              <PinOff className="w-3.5 h-3.5" /> Unpin tab
            </button>
          )}
          {contextMenu.tab.pinned ? (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
              onClick={handleRepin}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-pin tab
            </button>
          ) : (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Re-pin tab
            </button>
          )}
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
            onClick={handleRename}
          >
            <Pencil className="w-3.5 h-3.5" /> Rename tab
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
            onClick={handleFork}
          >
            <Copy className="w-3.5 h-3.5" /> Clone tab
          </button>
          {contextMenu.tab.pinned ? (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
              onClick={handleClose}
            >
              <X className="w-3.5 h-3.5" /> Close tab
            </button>
          ) : (
            <button
              className="w-full text-left px-3 py-1.5 hover:bg-accent/10 text-text-secondary hover:text-text-primary flex items-center gap-2 transition-colors"
              onClick={handleClose}
            >
              <X className="w-3.5 h-3.5" /> Close tab
            </button>
          )}
        </div>
      )}
    </div>
  );
}
