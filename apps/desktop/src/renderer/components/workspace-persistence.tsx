import { useEffect, useState } from 'react';
import { ipc } from '../framework/bridge/ipc-client';
import { appDialog } from '../framework/dialogs/app-dialog';
import { useLayoutStore } from '../framework/store/layout-store';
import { initializeWorkspaces, initAutoSave, useSpaceStore } from '../plugins/file-explorer/space-store';
import { reportError } from '../framework/diagnostics';

export function WorkspacePersistence() {
  const loadError = useSpaceStore((state) => state.loadError);
  const saveError = useSpaceStore((state) => state.saveError);
  const preferenceError = useLayoutStore((state) => state.preferenceError);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let disposed = false;
    let stopAutoSave: (() => void) | undefined;
    void initializeWorkspaces().then(() => {
      if (disposed) return;
      stopAutoSave = initAutoSave();
      if (useSpaceStore.getState().loaded) void useSpaceStore.getState().saveCurrentSpace();
    });
    return () => {
      disposed = true;
      stopAutoSave?.();
    };
  }, []);

  useEffect(() => {
    let pendingRequest: number | null = null;
    const offCancel = ipc.on('window:closeCancelled', ({ requestId }) => {
      if (pendingRequest === requestId) pendingRequest = null;
    });
    const off = ipc.on('window:beforeClose', async ({ requestId }) => {
      pendingRequest = requestId;
      let allow = false;
      try {
        const spaces = useSpaceStore.getState();
        const preferences = useLayoutStore.getState();
        const results = await Promise.all([
          spaces.loaded ? spaces.saveCurrentSpace() : Promise.resolve(true),
          preferences.preferencesDirty ? preferences.savePreferences() : Promise.resolve(true),
        ]);
        if (pendingRequest !== requestId) return;
        allow = results.every(Boolean);
        if (!allow) {
          await ipc.invoke('window:closePending', { requestId });
          allow =
            (await appDialog.choice({
              title: '有更改尚未保存',
              message: '工作空间或设置保存失败。可以返回后重试，或放弃本次未保存的更改并退出。',
              type: 'warning',
              buttons: [
                { id: 'stay', label: '返回并重试' },
                { id: 'discard', label: '不保存并退出' },
              ],
              defaultId: 'stay',
              cancelId: 'stay',
            })) === 'discard';
        }
      } catch (error) {
        reportError('close-save', error);
      } finally {
        if (pendingRequest === requestId) {
          pendingRequest = null;
          await ipc
            .invoke('window:resolveClose', { allow, requestId })
            .catch((error) => reportError('close-response', error));
        }
      }
    });
    void ipc.invoke('window:readyForClose', undefined).catch(() => {});
    return () => {
      pendingRequest = null;
      off();
      offCancel();
    };
  }, []);

  if (!loadError && !saveError && !preferenceError) return null;

  const retry = async () => {
    setRetrying(true);
    try {
      if (loadError) await initializeWorkspaces();
      if (useSpaceStore.getState().loaded) await useSpaceStore.getState().saveCurrentSpace();
      const preferences = useLayoutStore.getState();
      if (preferenceError) {
        if (!preferences.preferencesLoaded && !preferences.preferencesDirty)
          await preferences.loadPreferences();
        else await preferences.savePreferences();
      }
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      data-testid="persistence-error"
      className="flex flex-shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
    >
      <div className="min-w-0 flex-1 whitespace-pre-wrap break-words">
        {loadError && <div>工作空间未能恢复，自动保存已暂停：{loadError}</div>}
        {saveError && <div>工作空间尚未保存：{saveError}</div>}
        {preferenceError && <div>设置未能加载或保存：{preferenceError}</div>}
      </div>
      <button
        className="flex-shrink-0 rounded border border-amber-400/40 px-2 py-1 hover:bg-amber-400/10 disabled:opacity-50"
        onClick={() => void retry()}
        disabled={retrying}
      >
        {retrying ? '正在重试…' : '重试'}
      </button>
    </div>
  );
}
