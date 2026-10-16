import { useCallback, useState } from 'react';
import { ArrowRightLeft, Copy, FolderOpen, FolderPlus, Trash2 } from 'lucide-react';
import { useLayoutStore, useActivePanel } from '../framework/layout';
import { useFileStore } from '../plugins/file-explorer/store';
import { SpaceDropdown } from '../plugins/file-explorer/components/space-dropdown';
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
      useLayoutStore.getState().setPanelPlugin(activeSide, 'file-explorer', 'browser');
      useLayoutStore.getState().setPanelPath(activeSide, result);
    }
  }, [activeSide]);

  const handleNewFolder = useCallback(async () => {
    if (useLayoutStore.getState().layout[activeSide].pluginId !== 'file-explorer') return;
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
    const layout = useLayoutStore.getState().layout;
    if (layout.mode !== 'dual' || layout[activeSide].pluginId !== 'file-explorer') return;
    const state = useFileStore.getState()[activeSide];
    const targetSide = activeSide === 'left' ? 'right' : 'left';
    const targetPath = useFileStore.getState()[targetSide].path;
    if (targetPath && state.selected.size > 0) {
      const sources = [...state.selected];
      const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
        sources,
        targetPath,
        (p) => ipc.invoke('file:readDir', { path: p }),
        (message, buttons) =>
          appDialog.choice({
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
    const layout = useLayoutStore.getState().layout;
    if (layout.mode !== 'dual' || layout[activeSide].pluginId !== 'file-explorer') return;
    const state = useFileStore.getState()[activeSide];
    const targetSide = activeSide === 'left' ? 'right' : 'left';
    const targetPath = useFileStore.getState()[targetSide].path;
    if (targetPath && state.selected.size > 0) {
      const sources = [...state.selected];
      const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
        sources,
        targetPath,
        (p) => ipc.invoke('file:readDir', { path: p }),
        (message, buttons) =>
          appDialog.choice({
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
    if (useLayoutStore.getState().layout[activeSide].pluginId !== 'file-explorer') return;
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

  const selectedCount = useFileStore((s) => s[activeSide].selected.size);
  const currentPath = useFileStore((s) => s[activeSide].path);
  const targetSide = activeSide === 'left' ? 'right' : 'left';
  const targetPath = useFileStore((s) => s[targetSide].path);
  const activePlugin = useLayoutStore((s) => s.layout[activeSide].pluginId);
  const isFilePanel = activePlugin === 'file-explorer';
  const dualPanel = useLayoutStore((s) => s.layout.mode === 'dual');
  const targetLabel = targetSide === 'right' ? '右侧' : '左侧';
  const targetName =
    targetPath
      ?.replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .pop() || targetPath;
  const transferDisabledReason = !isFilePanel
    ? '请先在文件列表中选择要操作的项目'
    : !dualPanel
      ? '请先切换为双栏，再选择目标文件夹'
      : !targetPath
        ? `请先在${targetLabel}打开目标文件夹`
        : selectedCount === 0
          ? '请先选择文件或文件夹'
          : null;
  const canTransfer = !transferDisabledReason;
  const canDelete = isFilePanel && selectedCount > 0;

  const btn =
    'inline-flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded px-2 text-xs text-text-secondary transition-colors hover:bg-surface-lighter hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary';
  const sep = 'w-px h-4 bg-border/50 mx-1';

  return (
    <>
      <div
        data-testid="global-toolbar"
        className="flex min-h-10 flex-shrink-0 flex-wrap items-center gap-0.5 border-b border-border bg-surface-light px-2 py-1"
      >
        <SpaceDropdown />
        <span className={sep} />
        <button className={btn} onClick={handleOpenFolder} title="打开文件夹 (Ctrl+O)">
          <FolderOpen className="h-3.5 w-3.5" />
          <span>打开</span>
        </button>

        <span className={sep} />

        <button
          className={btn}
          onClick={handleCopy}
          title={transferDisabledReason ?? `复制到${targetLabel}：${targetPath} (F5)`}
          disabled={!canTransfer}
        >
          <Copy className="h-3.5 w-3.5" />
          <span>复制到{targetLabel}</span>
        </button>
        <button
          className={btn}
          onClick={handleMove}
          title={transferDisabledReason ?? `移动到${targetLabel}：${targetPath} (F6)`}
          disabled={!canTransfer}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
          <span>移动到{targetLabel}</span>
        </button>
        {dualPanel && (
          <span
            data-testid="transfer-destination"
            className="hidden max-w-[150px] truncate px-1 text-xs text-text-secondary xl:block"
            title={targetPath ? `目标文件夹：${targetPath}` : `${targetLabel}尚未打开目标文件夹`}
          >
            → {targetName ?? '未选目标文件夹'}
          </span>
        )}

        <span className={sep} />

        <button
          className={btn}
          onClick={handleNewFolder}
          title="新建文件夹 (F7)"
          disabled={!isFilePanel || !currentPath}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          <span>新建文件夹</span>
        </button>
        <button className={btn} onClick={handleDelete} title="移到回收站 (F8)" disabled={!canDelete}>
          <Trash2 className="h-3.5 w-3.5" />
          <span>删除</span>
        </button>

        <span className="flex-1" />

        <div
          className="hidden max-w-[34%] truncate text-[11px] text-text-muted lg:block"
          title={currentPath ?? undefined}
        >
          <span className="text-text-secondary">{activeSide === 'left' ? '左侧' : '右侧'}</span>
          <span className="mx-1 text-text-muted/50">/</span>
          {!isFilePanel
            ? activePlugin === 'fulltext-search'
              ? '搜索中'
              : activePlugin === 'viewer'
                ? '预览中'
                : '工具面板'
            : currentPath
              ? selectedCount > 0
                ? `已选 ${selectedCount} 项`
                : '未选择'
              : '未打开文件夹'}
        </div>
      </div>
      {inlinePrompt && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50"
          onClick={() => {
            inlinePrompt.resolve(null);
            setInlinePrompt(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={inlinePrompt.message}
            className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[320px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm text-text-primary mb-3">{inlinePrompt.message}</div>
            <input
              autoFocus
              id="toolbar-inline-prompt-input"
              className="w-full bg-surface-lighter border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              defaultValue={inlinePrompt.defaultValue}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  inlinePrompt.resolve((e.target as HTMLInputElement).value);
                  setInlinePrompt(null);
                }
                if (e.key === 'Escape') {
                  inlinePrompt.resolve(null);
                  setInlinePrompt(null);
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                onClick={() => {
                  inlinePrompt.resolve(null);
                  setInlinePrompt(null);
                }}
              >
                取消
              </button>
              <button
                className="px-3 py-1 text-xs bg-accent text-white rounded"
                onClick={() => {
                  const el = document.getElementById('toolbar-inline-prompt-input') as HTMLInputElement;
                  inlinePrompt.resolve(el?.value || '');
                  setInlinePrompt(null);
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
