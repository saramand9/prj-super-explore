import type { PluginContext } from '@explore/shared';
import { ipc } from '../bridge/ipc-client';

/**
 * 创建插件上下文（暴露给插件的 API）
 */
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
      copy(sources, destDir) {
        return ipc.invoke('file:copy', { sources, destDir });
      },
      move(sources, destDir) {
        return ipc.invoke('file:move', { sources, destDir });
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
      register(_id: string, _handler: (...args: any[]) => any): void {
        // 由 PluginManager 代理
      },
      async execute<T = unknown>(id: string, ...args: any[]): Promise<T> {
        // 通过 IPC 触发命令执行
        console.warn(`Command "${id}" not registered in plugin context`);
        return undefined as unknown as T;
      },
      list() {
        return []; // 由 PluginManager 代理
      },
    },

    notifications: {
      info(message: string): void {
        console.info(`[Explore] ${message}`);
      },
      warn(message: string): void {
        console.warn(`[Explore] ${message}`);
      },
      error(message: string): void {
        console.error(`[Explore] ${message}`);
      },
    },

    panels: {
      openPanel(_pluginId: string, _panelId: string): void {
        // 由布局引擎代理
      },
    },

    events: {
      on(_event: string, _cb: (...args: any[]) => void) {
        return () => {};
      },
    },
  };
}
