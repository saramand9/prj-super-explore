import { contextBridge, ipcRenderer } from 'electron';

/**
 * 类型安全的 IPC 桥接层。
 * 渲染进程通过 window.explore 调用主进程能力。
 */

const api = {
  invoke: <Req, Res>(channel: string, payload: Req): Promise<Res> => {
    return ipcRenderer.invoke(channel, payload);
  },

  on: <T>(channel: string, callback: (payload: T) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => {
      callback(payload);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },

  /** 一次性监听 */
  once: <T>(channel: string, callback: (payload: T) => void) => {
    ipcRenderer.once(channel, (_event, payload: T) => {
      callback(payload);
    });
  },
};

contextBridge.exposeInMainWorld('explore', api);
