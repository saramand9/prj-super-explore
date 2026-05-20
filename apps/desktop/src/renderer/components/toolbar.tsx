import { useCallback, useState } from 'react';
import { useLayoutStore, useActivePanel } from '../framework/layout';
import { useFileStore } from '../plugins/file-explorer/store';
import { ipc } from '../framework/bridge/ipc-client';
import { appDialog } from '../framework/dialogs/app-dialog';
import { showNotification } from '../framework/plugin-system';
import {
  getFileOpToastType,
  resolveCopyConflictStrategyWithChoice,
  summarizeFileOpResult,
  summarizeFileOpToast,
} from '../plugins/file-explorer/utils/file-op-result';
import type { FileOpResult } from '@explore/shared';

export function Toolbar() {
  const { activePanel } = useActivePanel();
  const [inlinePrompt, setInlinePrompt] = useState<{
    message: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  const activeSide = activePanel === 'left' || activePanel === 'right' ? activePanel : 'left';

  const showPrompt = useCallback(
    (message: string, defaultValue: string): Promise<string | null> =>
      new Promise((resolve) => {
        setInlinePrompt({ message, defaultValue, resolve });
      }),
    [],
  );

  const reportFileOperationResult = useCallback(async (action: string, result: FileOpResult) => {
    const summary = summarizeFileOpResult(action, result);
    if (summary) {
      await appDialog.alert({
        message: summary,
        type: getFileOpToastType(result) === 'error' ? 'error' : 'warning',
      });
      return;
    }
    showNotification(summarizeFileOpToast(action, result), getFileOpToastType(result));
  }, []);

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
    const name = await showPrompt('文件夹名称：', '新建文件夹');
    if (name) {
      const result = await ipc.invoke('file:mkdir', {
        parentPath: currentPath,
        name,
      });
      if (result.success) useFileStore.getState().refresh(activeSide);
    }
  }, [activeSide, showPrompt]);

  const handleCopy = useCallback(async () => {
    const state = useFileStore.getState()[activeSide];
    const targetSide = activeSide === 'left' ? 'right' : 'left';
    const targetPath = useLayoutStore.getState().layout[targetSide].path;
    if (targetPath && state.selected.size > 0) {
      const sources = [...state.selected];
      const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
        sources,
        targetPath,
        (p) => ipc.invoke('file:readDir', { path: p }),
        (message, buttons) => appDialog.choice({
          title: '同名冲突',
          message,
          buttons,
          defaultId: 'rename',
          cancelId: 'cancel',
        }),
      );
      if (!conflictStrategy) return;
      const result = await ipc.invoke('file:copy', {
        sources,
        destDir: targetPath,
        conflictStrategy,
      });
      await reportFileOperationResult('Copy', result);
      if (result.success) useFileStore.getState().clearSelection(activeSide);
      useFileStore.getState().refresh(activeSide);
      useFileStore.getState().refresh(targetSide);
    }
  }, [activeSide, reportFileOperationResult]);

  const handleMove = useCallback(async () => {
    const state = useFileStore.getState()[activeSide];
    const targetSide = activeSide === 'left' ? 'right' : 'left';
    const targetPath = useLayoutStore.getState().layout[targetSide].path;
    if (targetPath && state.selected.size > 0) {
      const sources = [...state.selected];
      const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
        sources,
        targetPath,
        (p) => ipc.invoke('file:readDir', { path: p }),
        (message, buttons) => appDialog.choice({
          title: '同名冲突',
          message,
          buttons,
          defaultId: 'rename',
          cancelId: 'cancel',
        }),
      );
      if (!conflictStrategy) return;
      const result = await ipc.invoke('file:move', {
        sources,
        destDir: targetPath,
        conflictStrategy,
      });
      await reportFileOperationResult('Move', result);
      if (result.success) useFileStore.getState().clearSelection(activeSide);
      useFileStore.getState().refresh(activeSide);
      useFileStore.getState().refresh(targetSide);
    }
  }, [activeSide, reportFileOperationResult]);

  const handleDelete = useCallback(async () => {
    const state = useFileStore.getState()[activeSide];
    if (state.selected.size === 0) return;
    const names = [...state.selected].map((p) => p.split(/[/\\]/).pop()).join(', ');
    if (await appDialog.confirm({ message: `确定要移到回收站吗？\n${names}` })) {
      const result = await ipc.invoke('file:delete', { paths: [...state.selected] });
      await reportFileOperationResult('Delete', result);
      useFileStore.getState().clearSelection(activeSide);
      useFileStore.getState().refresh(activeSide);
    }
  }, [activeSide, reportFileOperationResult]);

  const handlePermanentDelete = useCallback(async () => {
    const state = useFileStore.getState()[activeSide];
    if (state.selected.size === 0) return;
    const paths = [...state.selected];
    const names = paths.map((p) => p.split(/[/\\]/).pop()).join(', ');
    const first = await appDialog.confirm({
      title: '永久删除',
      message: `确定要永久删除 ${paths.length} 个项目吗？\n这些项目不会进入回收站。\n${names}`,
    });
    if (!first) return;
    const second = await appDialog.confirm({
      title: '再次确认永久删除',
      message: '再次确认：永久删除无法从回收站恢复。是否继续？',
    });
    if (!second) return;
    const result = await ipc.invoke('file:delete', { paths, permanent: true });
    await reportFileOperationResult('PermanentDelete', result);
    useFileStore.getState().clearSelection(activeSide);
    useFileStore.getState().refresh(activeSide);
  }, [activeSide, reportFileOperationResult]);

  const btn =
    'px-2 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:bg-surface-lighter rounded transition-colors cursor-pointer flex items-center gap-1';
  const sep = 'w-px h-4 bg-border/50 mx-0.5';

  return (
    <>
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
      <button className={btn} onClick={handlePermanentDelete} title="Permanent delete (Shift+F8)">
        ⛔ Permanent
      </button>

      <span className="flex-1" />

      <button className={btn} onClick={handleOpenFolder} title="Open folder (Ctrl+O)">
        📂
      </button>
    </div>
    {inlinePrompt && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={() => { inlinePrompt.resolve(null); setInlinePrompt(null); }}>
        <div className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[320px]" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm text-text-primary mb-3">{inlinePrompt.message}</div>
          <input
            autoFocus
            id="toolbar-inline-prompt-input"
            className="w-full bg-surface-lighter border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            defaultValue={inlinePrompt.defaultValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { inlinePrompt.resolve((e.target as HTMLInputElement).value); setInlinePrompt(null); }
              if (e.key === 'Escape') { inlinePrompt.resolve(null); setInlinePrompt(null); }
            }}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button className="px-3 py-1 text-xs text-text-muted hover:text-text-primary" onClick={() => { inlinePrompt.resolve(null); setInlinePrompt(null); }}>取消</button>
            <button className="px-3 py-1 text-xs bg-accent text-white rounded" onClick={() => { const el = document.getElementById('toolbar-inline-prompt-input') as HTMLInputElement; inlinePrompt.resolve(el?.value || ''); setInlinePrompt(null); }}>确定</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
