/**
 * 渲染进程 IPC 客户端。
 * 封装 window.explore 调用，提供类型安全的 API。
 */

import type {
  IpcChannels,
  IpcEvents,
} from '@explore/shared';

type ExploreApi = Window['explore'];

const win = window as unknown as { explore?: ExploreApi };

function getApi(): ExploreApi | null {
  if (!win.explore) return null;
  return win.explore;
}

function panic(msg: string): never {
  // 不抛同步异常，避免 React unmount 导致白屏
  console.error(`[IPC] ${msg}`);
  throw new Error(msg);
}

export const ipc = {
  invoke<C extends keyof IpcChannels>(
    channel: C,
    payload: IpcChannels[C]['req'],
  ): Promise<IpcChannels[C]['res']> {
    const api = getApi();
    if (!api) return Promise.reject(new Error('IPC bridge not available'));
    return api.invoke(channel, payload);
  },

  on<C extends keyof IpcEvents>(
    channel: C,
    callback: (payload: IpcEvents[C]) => void,
  ): () => void {
    const api = getApi();
    if (!api) {
      console.error('[IPC] bridge not available, cannot listen to', channel);
      return () => {};
    }
    return api.on(channel, callback);
  },

  once<C extends keyof IpcEvents>(
    channel: C,
    callback: (payload: IpcEvents[C]) => void,
  ): void {
    const api = getApi();
    if (!api) return;
    api.once(channel, callback);
  },
};
