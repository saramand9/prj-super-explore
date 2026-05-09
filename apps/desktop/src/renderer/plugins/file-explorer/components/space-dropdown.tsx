import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Wrench, Pencil, X, ChevronDown } from 'lucide-react';
import { useSpaceStore } from '../space-store';

export function SpaceDropdown() {
  const spaces = useSpaceStore((s) => s.spaces);
  const activeSpaceId = useSpaceStore((s) => s.activeSpaceId);
  const switchSpace = useSpaceStore((s) => s.switchSpace);
  const addSpace = useSpaceStore((s) => s.addSpace);
  const removeSpace = useSpaceStore((s) => s.removeSpace);
  const renameSpace = useSpaceStore((s) => s.renameSpace);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [newName, setNewName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLInputElement>(null);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (editingId || showNewInput) setTimeout(() => editRef.current?.focus(), 0);
  }, [editingId, showNewInput]);

  const toggleOpen = useCallback(() => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ x: rect.left, y: rect.bottom + 2 });
    }
    setOpen(!open);
  }, [open]);

  const handleSwitch = useCallback(
    (id: string) => {
      switchSpace(id);
      setOpen(false);
    },
    [switchSpace],
  );

  const handleAdd = useCallback(() => {
    if (newName.trim()) {
      addSpace(newName.trim());
      setNewName('');
      setShowNewInput(false);
    }
  }, [newName, addSpace]);

  const handleRename = useCallback(
    (id: string) => {
      if (editValue.trim()) {
        renameSpace(id, editValue.trim());
      }
      setEditingId(null);
    },
    [editValue, renameSpace],
  );

  return (
    <>
      <button
        ref={btnRef}
        className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors flex-shrink-0 mr-1"
        onClick={toggleOpen}
        title="Switch workspace"
      >
        <Wrench className="w-3 h-3 text-text-muted" />
        <span className="truncate max-w-[80px]">{activeSpace?.name ?? 'Default'}</span>
        <ChevronDown className="w-2.5 h-2.5 text-text-muted ml-0.5" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[200] bg-surface-light border border-border/50 rounded-lg shadow-xl py-1 min-w-[180px] text-xs"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            {spaces.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-1 px-2 py-1.5 hover:bg-accent/10 transition-colors ${
                  s.id === activeSpaceId ? 'text-accent' : 'text-text-secondary'
                }`}
              >
                {editingId === s.id ? (
                  <input
                    ref={editRef}
                    className="flex-1 bg-surface-lighter border border-accent/50 rounded px-1.5 py-0.5 text-xs outline-none min-w-0"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleRename(s.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRename(s.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    className="flex-1 text-left truncate"
                    onClick={() => handleSwitch(s.id)}
                  >
                    {s.id === activeSpaceId ? '● ' : '○ '}
                    {s.name}
                  </button>
                )}
                {spaces.length > 1 && (
                  <>
                    <button
                      className="text-text-muted hover:text-text-primary flex-shrink-0 p-0.5 rounded hover:bg-white/5 transition-colors"
                      title="Rename"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(s.id);
                        setEditValue(s.name);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      className="text-text-muted hover:text-red-400 flex-shrink-0 p-0.5 rounded hover:bg-white/5 transition-colors"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSpace(s.id);
                      }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            ))}

            {showNewInput ? (
              <div className="flex items-center gap-1 px-2 py-1.5">
                <input
                  ref={editRef}
                  className="flex-1 bg-surface-lighter border border-accent/50 rounded px-1.5 py-0.5 text-xs outline-none"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onBlur={handleAdd}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAdd();
                    if (e.key === 'Escape') {
                      setShowNewInput(false);
                      setNewName('');
                    }
                  }}
                  placeholder="Space name"
                />
              </div>
            ) : (
              <button
                className="w-full text-left px-3 py-1.5 text-text-muted hover:bg-accent/10 hover:text-text-primary transition-colors"
                onClick={() => setShowNewInput(true)}
              >
                + New Space
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
