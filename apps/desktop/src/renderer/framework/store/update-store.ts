import { create } from 'zustand';
import { UPDATE_CHANNELS, type UpdateState } from '@explore/shared';
import { ipc, getIpcErrorMessage } from '../bridge/ipc-client';
import { reportError } from '../diagnostics';

type UpdateAction = 'check' | 'download' | 'install';

export const useUpdateStore = create<{
  state: UpdateState | null;
  open: boolean;
  error: string | null;
  setOpen: (open: boolean) => void;
  run: (action: UpdateAction) => Promise<void>;
}>((set) => ({
  state: null,
  open: false,
  error: null,
  setOpen: (open) => set({ open }),
  run: async (action) => {
    set({ error: null });
    try {
      // Push events are authoritative; a late invoke response must not rewind newer progress.
      await ipc.invoke(UPDATE_CHANNELS[action], undefined);
    } catch (error) {
      reportError(`update-${action}`, error);
      set({ error: getIpcErrorMessage(error, '更新操作失败，请重试。') });
    }
  },
}));

export function connectUpdates(): () => void {
  let revision = 0;
  let disposed = false;
  const off = ipc.on(UPDATE_CHANNELS.stateChanged, (state) => {
    revision++;
    useUpdateStore.setState({ state });
  });
  void ipc
    .invoke(UPDATE_CHANNELS.getState, undefined)
    .then((state) => {
      if (!disposed && revision === 0) useUpdateStore.setState({ state });
    })
    .catch((error) => {
      if (!disposed) useUpdateStore.setState({ error: getIpcErrorMessage(error, '无法获取更新状态。') });
      reportError('update-state', error);
    });
  return () => {
    disposed = true;
    off();
  };
}

export function isPreparingUpdate(): boolean {
  const status = useUpdateStore.getState().state?.status;
  return status === 'preparing' || status === 'installing';
}
