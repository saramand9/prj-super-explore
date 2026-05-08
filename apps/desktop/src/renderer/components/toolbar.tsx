import { useCallback } from 'react';
import { useLayoutStore, useActivePanel } from '../framework/layout';
import { useFileStore } from '../plugins/file-explorer/store';
import { ipc } from '../framework/bridge/ipc-client';

export function Toolbar() {
  const { activePanel } = useActivePanel();

  const activeSide = activePanel === 'left' || activePanel === 'right' ? activePanel : 'left';

  const handleOpenFolder = useCallback(async () => {
    const currentPath = useFileStore.getState()[activeSide].path;
    const result = await ipc.invoke('dialog:openFolder', {
      defaultPath: currentPath ?? undefined,
    });
    if (result) {
      useFileStore.getState().addTab(activeSide, result);
      useFileStore.getState().navigateTo(activeSide, result, true);
      useLayoutStore.getState().setPanelPath(activeSide, result);
    }
  }, [activeSide]);

  const handleNewFolder = useCallback(async () => {
    const currentPath = useFileStore.getState()[activeSide].path;
    if (!currentPath) return;
    const name = prompt('Folder name:');
    if (name) {
      const result = await ipc.invoke('file:mkdir', {
        parentPath: currentPath,
        name,
      });
      if (result.success) useFileStore.getState().refresh(activeSide);
    }
  }, [activeSide]);

  const handleCopy = useCallback(async () => {
    const state = useFileStore.getState()[activeSide];
    const targetSide = activeSide === 'left' ? 'right' : 'left';
    const targetPath = useLayoutStore.getState().layout[targetSide].path;
    if (targetPath && state.selected.size > 0) {
      await ipc.invoke('file:copy', { sources: [...state.selected], destDir: targetPath });
      useFileStore.getState().clearSelection(activeSide);
      useFileStore.getState().refresh(activeSide);
      useFileStore.getState().refresh(targetSide);
    }
  }, [activeSide]);

  const handleMove = useCallback(async () => {
    const state = useFileStore.getState()[activeSide];
    const targetSide = activeSide === 'left' ? 'right' : 'left';
    const targetPath = useLayoutStore.getState().layout[targetSide].path;
    if (targetPath && state.selected.size > 0) {
      await ipc.invoke('file:move', { sources: [...state.selected], destDir: targetPath });
      useFileStore.getState().clearSelection(activeSide);
      useFileStore.getState().refresh(activeSide);
      useFileStore.getState().refresh(targetSide);
    }
  }, [activeSide]);

  const handleDelete = useCallback(async () => {
    const state = useFileStore.getState()[activeSide];
    if (state.selected.size === 0) return;
    const names = [...state.selected].map((p) => p.split(/[/\\]/).pop()).join(', ');
    if (confirm(`Delete ${names}?`)) {
      await ipc.invoke('file:delete', { paths: [...state.selected] });
      useFileStore.getState().clearSelection(activeSide);
      useFileStore.getState().refresh(activeSide);
    }
  }, [activeSide]);

  const btn =
    'px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-lighter rounded transition-colors cursor-pointer flex items-center gap-1';
  const sep = 'w-px h-4 bg-border/50 mx-0.5';

  return (
    <div className="flex items-center h-8 px-2 bg-surface-light border-b border-border gap-0.5 flex-shrink-0">
      <button className={btn} onClick={handleOpenFolder} title="Open folder (Ctrl+O)">
        📂 Open
      </button>

      <span className={sep} />

      <button className={btn} onClick={handleCopy} title="Copy to other panel (F5)">
        📋 Copy
      </button>
      <button className={btn} onClick={handleMove} title="Move to other panel (F6)">
        📦 Move
      </button>

      <span className={sep} />

      <button className={btn} onClick={handleNewFolder} title="New folder (F7)">
        📁 New Folder
      </button>
      <button className={btn} onClick={handleDelete} title="Delete (F8)">
        🗑 Delete
      </button>

      <span className="flex-1" />

      <button className={btn} onClick={handleOpenFolder} title="Open folder (Ctrl+O)">
        📂
      </button>
    </div>
  );
}
