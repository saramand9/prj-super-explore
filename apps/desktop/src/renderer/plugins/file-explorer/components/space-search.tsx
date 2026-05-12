import { useState, useEffect, useRef, useCallback } from 'react';
import { useSpaceStore } from '../space-store';
import { useFileStore } from '../store';
import { pinyin } from 'pinyin-pro';
import { Layers } from 'lucide-react';

function matchPinyin(text: string, query: string): boolean {
  if (!text || !query) return false;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (lower.includes(q)) return true;
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

interface SpaceSearchProps {
  open: boolean;
  onClose: () => void;
}

export function SpaceSearch({ open, onClose }: SpaceSearchProps) {
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

  const spaces = useSpaceStore((s) => s.spaces);
  const activeSpaceId = useSpaceStore((s) => s.activeSpaceId);

  const filtered = spaces.filter((s) => {
    if (!query.trim()) return true;
    return matchPinyin(s.name, query);
  });

  const handleSelect = useCallback(
    (id: string) => {
      useSpaceStore.getState().switchSpace(id);
      onClose();
    },
    [onClose],
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
        if (target) handleSelect(target.id);
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
        className="bg-surface-light border border-border rounded-lg shadow-2xl w-[400px] max-h-[400px] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40">
          <Layers className="w-4 h-4 text-text-muted" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary placeholder:text-text-muted"
            placeholder="Search workspace..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            className="text-text-muted hover:text-accent text-sm"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-text-muted text-xs">No workspace found</div>
          ) : (
            filtered.map((space, idx) => {
              const isActive = space.id === activeSpaceId;
              const isSelected = idx === selectedIdx;
              const tabCount = (space.left.tabs?.length ?? 0) + (space.right.tabs?.length ?? 0);
              return (
                <div
                  key={space.id}
                  className={`px-3 py-1.5 text-xs cursor-pointer flex items-center gap-2 ${
                    isSelected
                      ? 'bg-accent/30 text-text-primary'
                      : 'text-text-secondary hover:bg-surface-lighter'
                  }`}
                  onClick={() => handleSelect(space.id)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <Layers className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? 'text-accent' : 'text-text-muted'}`} />
                  <span className={`truncate ${isActive ? 'text-accent font-medium' : ''}`}>
                    {space.name}
                  </span>
                  <span className="text-text-muted text-[10px] ml-auto flex-shrink-0">
                    {tabCount} tabs
                  </span>
                  {isActive && (
                    <span className="active-dot" />
                  )}
                </div>
              );
            })
          )}
        </div>
        <div className="px-2 py-1 border-t border-border/40 text-[10px] text-text-muted flex gap-3">
          <span>↑↓ Navigate</span>
          <span>↵ Switch</span>
          <span>Esc Close</span>
        </div>
      </div>
    </div>
  );
}
