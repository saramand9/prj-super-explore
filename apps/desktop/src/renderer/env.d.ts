/// <reference types="vite/client" />

declare module '*?worker' {
  const worker: new () => Worker;
  export default worker;
}

import type { IpcChannels, IpcEvents } from '@explore/shared';

export interface ExploreApi {
  invoke<C extends keyof IpcChannels>(
    channel: C,
    payload: IpcChannels[C]['req'],
  ): Promise<IpcChannels[C]['res']>;
  on<C extends keyof IpcEvents>(
    channel: C,
    callback: (payload: IpcEvents[C]) => void,
  ): () => void;
  once<C extends keyof IpcEvents>(
    channel: C,
    callback: (payload: IpcEvents[C]) => void,
  ): void;
}

declare global {
  interface Window {
    explore: ExploreApi;
  }
}
