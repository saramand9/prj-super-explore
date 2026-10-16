import { useEffect, useCallback, useState } from 'react';
import { useBookmarkStore } from '../store';
import { ipc } from '../../../framework/bridge/ipc-client';

export function BookmarkPanel() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const loading = useBookmarkStore((s) => s.loading);
  const load = useBookmarkStore((s) => s.load);
  const add = useBookmarkStore((s) => s.add);
  const remove = useBookmarkStore((s) => s.remove);
  const navigate = useBookmarkStore((s) => s.navigate);

  const [newPath, setNewPath] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = useCallback(() => {
    if (newPath.trim()) {
      add(newPath.trim());
      setNewPath('');
      setShowAdd(false);
    }
  }, [newPath, add]);

  const handleContextMenu = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      if (await ipc.invoke('dialog:confirm', { message: '确定要删除这个书签吗？' })) {
        remove(id);
      }
    },
    [remove],
  );

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-xs font-medium text-text-secondary">BOOKMARKS</span>
        <button onClick={() => setShowAdd(!showAdd)} className="text-xs text-accent hover:text-accent/80">
          {showAdd ? '✕' : '+'}
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="flex-shrink-0 p-2 border-b border-border">
          <input
            type="text"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              if (e.key === 'Escape') setShowAdd(false);
            }}
            placeholder="Paste path and press Enter..."
            className="w-full bg-surface-lighter border border-border rounded px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            autoFocus
          />
        </div>
      )}

      {/* List */}
      <div className="flex-1 overflow-auto">
        {loading && <div className="text-center text-text-muted py-4 text-xs">Loading...</div>}

        {!loading && bookmarks.length === 0 && (
          <div className="text-center text-text-muted py-8 text-xs">
            <div>No bookmarks</div>
            <div className="mt-1">Click + to add one</div>
          </div>
        )}

        {bookmarks.map((bm) => (
          <div
            key={bm.id}
            className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-surface-lighter group"
            onClick={() => {
              ipc.invoke('file:open', { path: bm.path });
            }}
            onDoubleClick={() => navigate(bm.path)}
            onContextMenu={(e) => handleContextMenu(e, bm.id)}
            title={`${bm.name}\n${bm.path}`}
          >
            <span className="text-accent">★</span>
            <span className="flex-1 truncate text-text-primary">{bm.name}</span>
            <span className="text-text-muted truncate max-w-[50%] hidden group-hover:inline">{bm.path}</span>
          </div>
        ))}
      </div>

      {/* Help */}
      <div className="flex-shrink-0 px-2 py-1 border-t border-border text-xs text-text-muted">
        Double-click to navigate · Right-click to remove
      </div>
    </div>
  );
}
