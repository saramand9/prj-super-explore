import { contextBridge, ipcRenderer } from 'electron';
import { createBridge } from './bridge';

contextBridge.exposeInMainWorld(
  'explore',
  createBridge(ipcRenderer, {
    sandboxed: process.sandboxed === true,
    contextIsolated: process.contextIsolated === true,
  }),
);
