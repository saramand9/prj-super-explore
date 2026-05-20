import type { PluginContext } from '@explore/shared';
import { ipc } from '../bridge/ipc-client';
import { pluginManager } from './plugin-manager';
import { useLayoutStore } from '../store/layout-store';

let notifyFn: ((message: string, type: 'info' | 'warn' | 'error') => void) | null = null;

export function setNotificationHandler(fn: typeof notifyFn): void {
  notifyFn = fn;
}

const eventListeners = new Map<string, Set<(...args: any[]) => void>>();

export function emitEvent(event: string, ...args: any[]): void {
  eventListeners.get(event)?.forEach((cb) => cb(...args));
}

export function createPluginContext(): PluginContext {
  return {
    fs: {
      readDir(path, opts) {
        return ipc.invoke('file:readDir', {
          path,
          sort: opts?.sort,
          showHidden: opts?.showHidden,
        });
      },
      stat(path) {
        return ipc.invoke('file:stat', { path });
      },
      copy(sources, destDir, opts) {
        return ipc.invoke('file:copy', {
          sources,
          destDir,
          conflictStrategy: opts?.conflictStrategy,
        });
      },
      move(sources, destDir, opts) {
        return ipc.invoke('file:move', {
          sources,
          destDir,
          conflictStrategy: opts?.conflictStrategy,
        });
      },
      delete(paths, permanent) {
        return ipc.invoke('file:delete', { paths, permanent });
      },
      mkdir(parentPath, name) {
        return ipc.invoke('file:mkdir', { parentPath, name });
      },
      open(path) {
        return ipc.invoke('file:open', { path });
      },
    },

    search: {
      fulltext(dir, query, opts) {
        return ipc.invoke('search:fulltext', {
          dir,
          query,
          filePattern: opts?.filePattern,
          maxResults: opts?.maxResults,
        });
      },
    },

    commands: {
      register(id, handler) {
        pluginManager.registerCommandHandler(id, handler);
      },
      async execute<T = unknown>(id: string, ...args: any[]): Promise<T> {
        return pluginManager.executeCommand<T>(id, ...args);
      },
      list() {
        return pluginManager.getAllCommands();
      },
    },

    notifications: {
      info(message) {
        notifyFn?.(message, 'info');
      },
      warn(message) {
        notifyFn?.(message, 'warn');
      },
      error(message) {
        notifyFn?.(message, 'error');
      },
    },

    panels: {
      openPanel(pluginId, panelId) {
        const layout = useLayoutStore.getState().layout;
        const targetSide = (layout.id === 'left' || layout.id === 'right') ? layout.id : 'left';
        useLayoutStore.getState().setPanelPlugin(targetSide, pluginId, panelId);
      },
    },

    events: {
      on(event, cb) {
        if (!eventListeners.has(event)) eventListeners.set(event, new Set());
        eventListeners.get(event)!.add(cb);
        return () => eventListeners.get(event)?.delete(cb);
      },
    },
  };
}
