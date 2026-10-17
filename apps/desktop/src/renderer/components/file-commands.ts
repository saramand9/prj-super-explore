import { useLayoutStore } from '../framework/store/layout-store';
import { useFileStore } from '../plugins/file-explorer/store';
import { ipc } from '../framework/bridge/ipc-client';
import { appDialog } from '../framework/dialogs/app-dialog';
import { reportError } from '../framework/diagnostics';
import { showNotification } from '../framework/plugin-system';
import {
  getFileOpToastType,
  resolveCopyConflictStrategyWithChoice,
  summarizeFileOpResult,
  summarizeFileOpToast,
} from '../plugins/file-explorer/utils/file-op-result';
import type { FileOpResult } from '@explore/shared';

export const activeSide = () => (useLayoutStore.getState().layout.id === 'right' ? 'right' : 'left');

export function useFileCommandContext() {
  const layout = useLayoutStore((state) => state.layout);
  const side = layout.id === 'right' ? 'right' : 'left';
  const target = side === 'left' ? 'right' : 'left';
  const path = useFileStore((state) => state[side].path);
  const targetPath = useFileStore((state) => state[target].path);
  const selected = useFileStore((state) => state[side].selected.size);
  const showHidden = useFileStore((state) => state[side].showHidden);
  const isFilePanel = layout[side].pluginId === 'file-explorer';
  const targetLabel = target === 'right' ? '右侧' : '左侧';
  const transferReason = !isFilePanel
    ? '请先在文件列表中选择要操作的项目'
    : layout.mode !== 'dual'
      ? '请先切换为双栏，再选择目标文件夹'
      : !targetPath
        ? `请先在${targetLabel}打开目标文件夹`
        : selected === 0
          ? '请先选择文件或文件夹'
          : undefined;
  return {
    side,
    target,
    path,
    targetPath,
    selected,
    showHidden,
    isFilePanel,
    targetLabel,
    transferReason,
    mode: layout.mode,
    canDelete: isFilePanel && selected > 0,
    canCreate: isFilePanel && !!path,
  };
}

/** Shared by menus and buttons: one confirmation, conflict and error policy. */
export async function runCommand(action: () => void | Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    reportError('command-bar', error);
    await appDialog.alert({
      title: '操作未完成',
      message: error instanceof Error ? error.message : '请稍后重试。',
      type: 'error',
    });
  }
}

async function reportResult(action: string, result: FileOpResult): Promise<void> {
  const summary = summarizeFileOpResult(action, result);
  if (summary)
    await appDialog.alert({
      message: summary,
      type: getFileOpToastType(result) === 'error' ? 'error' : 'warning',
    });
  else showNotification(summarizeFileOpToast(action, result), getFileOpToastType(result));
}

export async function openFolder(): Promise<void> {
  const side = activeSide();
  const folder = await ipc.invoke('dialog:openFolder', {
    defaultPath: useFileStore.getState()[side].path ?? undefined,
  });
  if (!folder) return;
  useFileStore.getState().addTab(side, folder);
  await useFileStore.getState().navigateTo(side, folder, true);
  useLayoutStore.getState().setPanelPlugin(side, 'file-explorer', 'browser');
  useLayoutStore.getState().setPanelPath(side, folder);
}

export async function createFolder(name: string, side: 'left' | 'right', parentPath: string): Promise<void> {
  const result = await ipc.invoke('file:mkdir', { parentPath, name: name.trim() });
  if (!result.success) throw new Error(result.error ?? '文件夹创建失败');
  await useFileStore.getState().refresh(side);
}

export async function transferFiles(kind: 'copy' | 'move'): Promise<void> {
  const side = activeSide();
  const target = side === 'left' ? 'right' : 'left';
  const layout = useLayoutStore.getState().layout;
  const state = useFileStore.getState()[side];
  const targetPath = useFileStore.getState()[target].path;
  if (
    layout.mode !== 'dual' ||
    layout[side].pluginId !== 'file-explorer' ||
    !targetPath ||
    !state.selected.size
  )
    return;
  const sources = [...state.selected];
  const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
    sources,
    targetPath,
    (path) => ipc.invoke('file:readDir', { path }),
    (message, buttons) =>
      appDialog.choice({ title: '同名冲突', message, buttons, defaultId: 'rename', cancelId: 'cancel' }),
  );
  if (!conflictStrategy) return;
  const result = await ipc.invoke(kind === 'copy' ? 'file:copy' : 'file:move', {
    sources,
    destDir: targetPath,
    conflictStrategy,
  });
  await reportResult(kind === 'copy' ? 'Copy' : 'Move', result);
  if (result.success) useFileStore.getState().clearSelection(side);
  await Promise.all([useFileStore.getState().refresh(side), useFileStore.getState().refresh(target)]);
}

export async function deleteFiles(permanent = false): Promise<void> {
  const side = activeSide();
  const state = useFileStore.getState()[side];
  if (useLayoutStore.getState().layout[side].pluginId !== 'file-explorer' || !state.selected.size) return;
  const paths = [...state.selected];
  const names = paths.map((path) => path.split(/[/\\]/).pop()).join(', ');
  const confirmed = await appDialog.confirm({
    title: permanent ? '永久删除' : '移到回收站',
    message: permanent
      ? `确定要永久删除 ${paths.length} 个项目吗？\n这些项目不会进入回收站。\n${names}`
      : `确定要移到回收站吗？\n${names}`,
  });
  if (!confirmed) return;
  if (
    permanent &&
    !(await appDialog.confirm({
      title: '再次确认永久删除',
      message: '再次确认：永久删除无法从回收站恢复。是否继续？',
    }))
  )
    return;
  const result = await ipc.invoke('file:delete', { paths, permanent });
  await reportResult(permanent ? 'PermanentDelete' : 'Delete', result);
  useFileStore.getState().clearSelection(side);
  await useFileStore.getState().refresh(side);
}
