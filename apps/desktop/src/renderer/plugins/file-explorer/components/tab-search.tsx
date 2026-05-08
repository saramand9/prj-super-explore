import { useState, useEffect, useRef, useCallback } from 'react';
import { useFileStore, type Tab } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { pinyin } from 'pinyin-pro';

function matchPinyin(text: string, query: string): boolean {
  if (!text || !query) return false;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower.includes(q)) return true;
  // 中文才做拼音匹配
  if (!/[一-鿿]/.test(text)) return false;
  try {
    const py = pinyin(text).toLowerCase().replace(/\s+/g, '');
    if (py.includes(q)) return true;
    const initials = pinyin(text)
      .split(/\s+/)
      .map((s: string) => s[0])
      .join('')
      .toLowerCase();
    if (initials.includes(q)) return true;
  } catch { /* ignore */ }
  return false;
}

interface TabSearchProps {
  open: boolean;
  onClose: () => void;
  side: 'left' | 'right';
}

export function TabSearch({ open, onClose, side }: TabSearchProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allTabs: (Tab & { groupName?: string })[] = [];
  if (open) {
    const panel = useFileStore.getState()[side];
    const groups = useFileStore.getState().getGroups(side);
    const groupedIds = new Set(groups.flatMap((g) => g.tabIds));
    for (const tab of panel.tabs) {
      const group = groups.find((g) => g.tabIds.includes(tab.id));
      allTabs.push({ ...tab, groupName: group?.name });
    }
  }

  const filtered = allTabs.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return matchPinyin(t.label, q);
  });

  const handleSelect = useCallback(
    (tab: Tab) => {
      useFileStore.getState().activateTab(side, tab.id);
      useFileStore.getState().navigateTo(side, tab.path, false);
      useLayoutStore.getState().setPanelPath(side, tab.path);
      onClose();
    },
    [side, onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[selectedIdx];
        if (target) handleSelect(target);
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [filtered, selectedIdx, handleSelect, onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      <div
        className="bg-[#1c1c25] border border-border rounded-lg shadow-2xl w-[400px] max-h-[400px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-2 border-b border-border/40">
          <input
            ref={inputRef}
            className="w-full bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
            placeholder="Search tabs..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-text-muted text-xs">No tabs found</div>
          ) : (
            filtered.map((tab, idx) => {
              const isActive = tab.id === useFileStore.getState()[side].activeTabId;
              const isSelected = idx === selectedIdx;
              return (
                <div
                  key={tab.id}
                  className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-accent/30 text-text-primary'
                      : 'text-text-secondary hover:bg-surface-lighter'
                  }`}
                  onClick={() => handleSelect(tab)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isActive ? 'bg-[#22c55e]' : 'bg-transparent'
                    }`}
                  />
                  <span className={`truncate ${isActive ? 'text-[#22c55e] font-semibold' : ''}`}>
                    {tab.label}
                  </span>
                  {tab.groupName && (
                    <span className="text-text-muted text-[10px] ml-auto flex-shrink-0">
                      {tab.groupName}/
                    </span>
                  )}
                  {tab.pinned && (
                    <span className="text-[10px] flex-shrink-0">📍</span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="px-2 py-1 border-t border-border/40 text-[10px] text-text-muted">
          Enter to switch · Esc to close · ↑↓ navigate
        </div>
      </div>
    </div>
  );
}
