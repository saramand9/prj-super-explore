import { ipcMain as electronIpcMain, BrowserWindow, dialog, app } from 'electron';
import { readdir, readFile, stat, mkdir, cp, open as openFileHandle } from 'fs/promises';
import { join, basename, extname } from 'path';
import type { IpcChannels, IpcEvents, FileEntry, IpcErrorCode, IpcErrorInfo, FileReadResult } from '@explore/shared';
import type { ServiceContainer } from '../service-container';
import type { FileService } from '../services/file.service';
import type { SearchService } from '../services/search.service';
import type { IndexService } from '../services/index.service';
import type { ConfigService } from '../services/config.service';
import type { WindowService } from '../services/window.service';
import type { WatcherService } from '../services/watcher.service';

const IPC_ERROR_PREFIX = '__EXPLORE_IPC_ERROR__';
const DEFAULT_TEXT_PREVIEW_LIMIT = 1024 * 1024;

export function registerIpcHandlers(container: ServiceContainer): void {
  const file = container.get<FileService>('file');
  const search = container.get<SearchService>('search');
  const index = container.get<IndexService>('index');
  const config = container.get<ConfigService>('config');
  const windowSvc = container.get<WindowService>('window');
  const watcher = container.get<WatcherService>('watcher');
  const ipcMain = {
    handle<C extends keyof IpcChannels>(
      channel: C,
      listener: (event: any, payload: IpcChannels[C]['req']) => IpcChannels[C]['res'] | Promise<IpcChannels[C]['res']>,
    ): void {
      electronIpcMain.handle(channel, async (event, payload) => {
        try {
          return await listener(event, payload);
        } catch (err) {
          throw toIpcError(channel, err);
        }
      });
    },
  };

  // ── File ──

  ipcMain.handle(
    'file:readDir',
    (_e, payload: IpcChannels['file:readDir']['req']) =>
      file.readDir(payload.path, payload.sort, payload.showHidden),
  );

  ipcMain.handle(
    'file:stat',
    (_e, payload: IpcChannels['file:stat']['req']) => file.getStat(payload.path),
  );

  ipcMain.handle(
    'file:copy',
    (_e, payload: IpcChannels['file:copy']['req']) =>
      file.copyFiles(payload.sources, payload.destDir, payload.conflictStrategy, payload.operationId),
  );

  ipcMain.handle(
    'file:move',
    (_e, payload: IpcChannels['file:move']['req']) =>
      file.moveFiles(payload.sources, payload.destDir, payload.conflictStrategy, payload.operationId),
  );

  ipcMain.handle(
    'file:delete',
    (_e, payload: IpcChannels['file:delete']['req']) =>
      file.deleteFiles(payload.paths, payload.permanent, payload.operationId),
  );

  ipcMain.handle(
    'file:cancelOperation',
    (_e, payload: IpcChannels['file:cancelOperation']['req']) => ({
      cancelled: file.cancelOperation(payload.operationId),
    }),
  );

  ipcMain.handle(
    'file:mkdir',
    (_e, payload: IpcChannels['file:mkdir']['req']) =>
      file.createDir(payload.parentPath, payload.name),
  );

  ipcMain.handle(
    'file:create',
    (_e, payload: IpcChannels['file:create']['req']) =>
      file.createFile(payload.parentPath, payload.name),
  );

  ipcMain.handle(
    'file:rename',
    (_e, payload: IpcChannels['file:rename']['req']) =>
      file.renameFile(payload.path, payload.newName),
  );

  ipcMain.handle(
    'file:exists',
    (_e, payload: IpcChannels['file:exists']['req']) =>
      file.exists(payload.path),
  );

  ipcMain.handle(
    'file:open',
    (_e, payload: IpcChannels['file:open']['req']) =>
      file.open(payload.path),
  );

  ipcMain.handle(
    'file:read',
    (_e, payload: IpcChannels['file:read']['req']) => readTextFile(payload),
  );

  ipcMain.handle(
    'file:openInExplorer',
    (_e, payload: IpcChannels['file:openInExplorer']['req']) => {
      const { shell } = require('electron');
      shell.openPath(payload.path);
    },
  );

  ipcMain.handle(
    'file:watch',
    (_e, payload: IpcChannels['file:watch']['req']) => {
      const watcherId = `watch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      watcher.watch(
        payload.path,
        watcherId,
        (event, filePath) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win && !win.isDestroyed()) {
            win.webContents.send('fs:changed', {
              watcherId,
              events: [{ type: normalizeFsEvent(event), path: join(payload.path, filePath) }],
            } satisfies IpcEvents['fs:changed']);
          }
        },
        (err) => {
          const win = BrowserWindow.getAllWindows()[0];
          if (win && !win.isDestroyed()) {
            win.webContents.send('fs:watchError', {
              watcherId,
              path: payload.path,
              error: toIpcErrorInfo('file:watch', err),
            } satisfies IpcEvents['fs:watchError']);
          }
        },
      );
      return watcherId;
    },
  );

  ipcMain.handle(
    'file:unwatch',
    (_e, payload: IpcChannels['file:unwatch']['req']) => {
      watcher.unwatch(payload.watcherId);
    },
  );

  // ── File watching (tail -f) ──

  ipcMain.handle(
    'file:watchFile',
    (_e, payload: IpcChannels['file:watchFile']['req']) => {
      file.watchFile(payload.path, () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send('file:contentChanged', { filePath: payload.path });
        }
      }, (err) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send('file:watchError', {
            filePath: payload.path,
            error: toIpcErrorInfo('file:watchFile', err),
          });
        }
      });
    },
  );

  ipcMain.handle(
    'file:unwatchFile',
    (_e, payload: IpcChannels['file:unwatchFile']['req']) => {
      file.unwatchFile(payload.path);
    },
  );

  // ── Walk Tree (recursive directory listing for search index) ──

  ipcMain.handle(
    'file:walkTree',
    async (_e, payload: IpcChannels['file:walkTree']['req']) => {
      return walkTree(payload.path, payload.maxDepth ?? 5, new Set(payload.excludePatterns ?? []));
    },
  );

  // ── Directory Sizes (batch, with cache) ──

  ipcMain.handle(
    'file:dirSizes',
    async (_e, payload: IpcChannels['file:dirSizes']['req']) => {
      const result = await file.getDirSizes(payload.paths);

      // 提前终止但未触及上限的目录，后台静默补算
      const partialDirs = Object.entries(result)
        .filter(([, r]) => r.partial && (r.fileCount ?? 0) < 50000)
        .map(([p]) => p);

      if (partialDirs.length > 0) {
        setImmediate(async () => {
          for (const dirPath of partialDirs) {
            try {
              const r = await file.computeDirSizeBackground(dirPath);
              const win = BrowserWindow.getAllWindows()[0];
              if (win && !win.isDestroyed()) {
                win.webContents.send('file:dirSizeUpdate', {
                  path: dirPath,
                  size: r.size,
                  partial: r.partial,
                });
              }
            } catch { /* skip */ }
          }
        });
      }

      return result;
    },
  );

  // ── Search ──

  ipcMain.handle(
    'search:fulltext',
    (_e, payload: IpcChannels['search:fulltext']['req']) => {
      const searchId = payload.searchId ?? `${payload.dir}:${payload.query}`;
      return search.fulltext(payload.dir, payload.query, searchId, {
        filePattern: payload.filePattern,
        excludePatterns: payload.excludePatterns,
        maxResults: payload.maxResults,
        maxFileSize: payload.maxFileSize,
      });
    },
  );

  ipcMain.handle(
    'search:cancel',
    (_e, payload: IpcChannels['search:cancel']['req']) => {
      search.cancel(payload.searchId);
    },
  );

  // ── Index ──

  ipcMain.handle(
    'index:query',
    (_e, payload: IpcChannels['index:query']['req']) =>
      index.query(payload.pattern, payload.maxResults),
  );

  ipcMain.handle(
    'index:rebuild',
    (_e, payload: IpcChannels['index:rebuild']['req']) =>
      index.rebuild(payload.paths).then((itemCount) => ({ itemCount })),
  );

  ipcMain.handle('index:status', () => index.status);

  // ── Bookmarks ──

  ipcMain.handle('bookmark:list', () => config.getBookmarks());

  ipcMain.handle(
    'bookmark:add',
    (_e, payload: IpcChannels['bookmark:add']['req']) => {
      config.addBookmark(payload);
    },
  );

  ipcMain.handle(
    'bookmark:remove',
    (_e, payload: IpcChannels['bookmark:remove']['req']) => {
      config.removeBookmark(payload.id);
    },
  );

  ipcMain.handle(
    'bookmark:update',
    (_e, payload: IpcChannels['bookmark:update']['req']) => {
      config.updateBookmark(payload.id, payload.updates);
    },
  );

  // ── Pinned Tabs ──

  ipcMain.handle('tabs:load', () => {
    const tabs = config.getPinnedTabs();
    return {
      left: tabs.left.map((tab) => ({ ...tab, initialPath: (tab as any).initialPath ?? tab.path })),
      right: tabs.right.map((tab) => ({ ...tab, initialPath: (tab as any).initialPath ?? tab.path })),
    };
  });

  ipcMain.handle(
    'tabs:save',
    (_e, payload: IpcChannels['tabs:save']['req']) => {
      config.savePinnedTabs(payload.side, payload.tabs);
    },
  );

  // ── Spaces ──

  ipcMain.handle('space:list', () => config.getSpaces());

  ipcMain.handle(
    'space:save',
    (_e, payload: IpcChannels['space:save']['req']) => {
      config.saveSpaces(payload.spaces);
    },
  );

  // ── Window ──

  ipcMain.handle('window:toggleLauncher', () => {
    windowSvc.toggleLauncher();
  });

  // ── Dialogs ──

  ipcMain.handle(
    'dialog:openFolder',
    async (_e, payload: IpcChannels['dialog:openFolder']['req']) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;
      const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory'],
        defaultPath: payload.defaultPath,
      });
      return result.canceled ? null : result.filePaths[0];
    },
  );

  ipcMain.handle(
    'dialog:confirm',
    async (_e, payload: IpcChannels['dialog:confirm']['req']) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return false;
      const result = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['确定', '取消'],
        defaultId: 0,
        title: payload.title || '确认',
        message: payload.message,
      });
      return result.response === 0;
    },
  );

  ipcMain.handle(
    'dialog:alert',
    async (_e, payload: IpcChannels['dialog:alert']['req']) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return;
      await dialog.showMessageBox(win, {
        type: payload.type ?? 'info',
        buttons: ['确定'],
        defaultId: 0,
        title: payload.title || '提示',
        message: payload.message,
      });
    },
  );

  ipcMain.handle(
    'dialog:choice',
    async (_e, payload: IpcChannels['dialog:choice']['req']) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;
      const defaultId = payload.defaultId
        ? payload.buttons.findIndex((button) => button.id === payload.defaultId)
        : 0;
      const cancelId = payload.cancelId
        ? payload.buttons.findIndex((button) => button.id === payload.cancelId)
        : payload.buttons.length - 1;
      const result = await dialog.showMessageBox(win, {
        type: payload.type ?? 'question',
        buttons: payload.buttons.map((button) => button.label),
        defaultId: defaultId >= 0 ? defaultId : 0,
        cancelId: cancelId >= 0 ? cancelId : payload.buttons.length - 1,
        title: payload.title || '请选择',
        message: payload.message,
      });
      return payload.buttons[result.response]?.id ?? null;
    },
  );

  ipcMain.handle(
    'dialog:prompt',
    async (_e, payload: IpcChannels['dialog:prompt']['req']) => {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) return null;
      // Electron doesn't have a native prompt, use a simple workaround
      const { BrowserWindow: _ } = require('electron');
      // For now, use showMessageBox with a workaround
      const result = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['确定', '取消'],
        defaultId: 0,
        title: payload.title || '输入',
        message: `${payload.message}\n\n默认值：${payload.defaultValue || ''}`,
      });
      if (result.response === 0) {
        return payload.defaultValue || '';
      }
      return null;
    },
  );

  // ── Plugins ──

  const pluginsDir = join(app.getPath('userData'), 'plugins');

  // Ensure plugins directory exists
  mkdir(pluginsDir, { recursive: true }).catch(() => {});

  ipcMain.handle('plugin:scanExternal', async () => {
    const result: { pluginId: string; pluginPath: string }[] = [];
    try {
      const dirs = await readdir(pluginsDir, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const pluginPath = join(pluginsDir, d.name);
        const manifestPath = join(pluginPath, 'manifest.json');
        try {
          await stat(manifestPath);
          const manifestRaw = await readFile(manifestPath, 'utf-8');
          const manifest = JSON.parse(manifestRaw);
          result.push({ pluginId: manifest.id || d.name, pluginPath });
        } catch { /* skip */ }
      }
    } catch { /* no plugins dir */ }
    return result;
  });

  ipcMain.handle(
    'plugin:readFile',
    async (_e, payload: IpcChannels['plugin:readFile']['req']) => {
      const pluginPath = join(pluginsDir, payload.pluginId);
      const filePath = join(pluginPath, payload.file);
      return readFile(filePath, 'utf-8');
    },
  );

  ipcMain.handle(
    'plugin:install',
    async (_e, payload: IpcChannels['plugin:install']['req']) => {
      try {
        const sourcePath = payload.sourcePath;
        const manifestRaw = await readFile(join(sourcePath, 'manifest.json'), 'utf-8');
        const manifest = JSON.parse(manifestRaw);
        const pluginId = manifest.id || basename(sourcePath);
        const destPath = join(pluginsDir, pluginId);
        await cp(sourcePath, destPath, { recursive: true });
        return { success: true, pluginId };
      } catch (err: any) {
        return { success: false, error: err.message };
      }
    },
  );

  // ── App ──

  ipcMain.handle('app:getVersion', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:getHomeDir', () => app.getPath('home'));
}

async function readTextFile(payload: IpcChannels['file:read']['req']): Promise<FileReadResult> {
  const limit = payload.maxSize ?? DEFAULT_TEXT_PREVIEW_LIMIT;
  const st = await stat(payload.path);
  if (st.isDirectory()) {
    throw createIpcCodedError('IS_DIRECTORY', '这是文件夹，不能按文本预览', payload.path);
  }

  if (payload.loadFull || st.size <= limit) {
    const buffer = await readFile(payload.path);
    return {
      content: decodeUtf8(buffer, false, payload.path),
      size: st.size,
      bytesRead: buffer.length,
    };
  }

  const handle = await openFileHandle(payload.path, 'r');
  try {
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    const chunk = buffer.subarray(0, bytesRead);
    return {
      content: decodeUtf8(chunk, true, payload.path),
      size: st.size,
      bytesRead,
      partial: true,
      limit,
      canContinue: true,
    };
  } finally {
    await handle.close();
  }
}

function decodeUtf8(buffer: Buffer, stream: boolean, filePath: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer, { stream });
  } catch {
    throw createIpcCodedError('INVALID_ENCODING', '文件不是有效的 UTF-8 文本，无法预览', filePath);
  }
}

function createIpcCodedError(code: IpcErrorCode, message: string, path?: string): Error {
  const err = new Error(message) as Error & { code?: IpcErrorCode; path?: string };
  err.code = code;
  err.path = path;
  return err;
}

function toIpcError(channel: keyof IpcChannels, err: unknown): Error {
  return new Error(`${IPC_ERROR_PREFIX}${encodeIpcErrorInfo(toIpcErrorInfo(channel, err))}`);
}

function toIpcErrorInfo(channel: keyof IpcChannels, err: unknown): IpcErrorInfo {
  const anyErr = err as { code?: string; message?: string; path?: string; filePath?: string; errno?: number };
  const nativeCode = typeof anyErr?.code === 'string' ? anyErr.code : undefined;
  const code = mapErrorCode(channel, nativeCode);
  const path = typeof anyErr?.path === 'string'
    ? anyErr.path
    : typeof anyErr?.filePath === 'string'
      ? anyErr.filePath
      : undefined;
  const details = anyErr?.message && anyErr.message !== userMessageFor(code)
    ? anyErr.message
    : undefined;

  return {
    code,
    message: userMessageFor(code),
    channel: String(channel),
    nativeCode,
    path,
    details,
  };
}

function encodeIpcErrorInfo(info: IpcErrorInfo): string {
  return `b64:${Buffer.from(JSON.stringify(info), 'utf8').toString('base64url')}`;
}

function mapErrorCode(channel: keyof IpcChannels, nativeCode?: string): IpcErrorCode {
  switch (nativeCode) {
    case 'FILE_NOT_FOUND':
    case 'PERMISSION_DENIED':
    case 'PATH_TOO_LONG':
    case 'FILE_TOO_LARGE':
    case 'INVALID_ENCODING':
    case 'IS_DIRECTORY':
    case 'WATCH_FAILED':
    case 'PROCESS_FAILED':
    case 'IPC_BRIDGE_MISSING':
      return nativeCode;
    case 'ENOENT':
    case 'ENOTDIR':
      return 'FILE_NOT_FOUND';
    case 'EACCES':
    case 'EPERM':
      return 'PERMISSION_DENIED';
    case 'ENAMETOOLONG':
      return 'PATH_TOO_LONG';
    case 'EISDIR':
      return 'IS_DIRECTORY';
    default:
      return String(channel).startsWith('search:') ? 'PROCESS_FAILED' : 'UNKNOWN';
  }
}

function userMessageFor(code: IpcErrorCode): string {
  switch (code) {
    case 'FILE_NOT_FOUND':
      return '文件不存在或已被移动';
    case 'PERMISSION_DENIED':
      return '没有权限访问此路径';
    case 'PATH_TOO_LONG':
      return '路径过长，系统无法访问';
    case 'FILE_TOO_LARGE':
      return '文件过大，已停止读取';
    case 'INVALID_ENCODING':
      return '文件编码不是有效的 UTF-8 文本，无法预览';
    case 'IS_DIRECTORY':
      return '这是文件夹，不能按文本预览';
    case 'WATCH_FAILED':
      return '文件监听失败，内容不会自动刷新';
    case 'PROCESS_FAILED':
      return '搜索进程执行失败';
    case 'IPC_BRIDGE_MISSING':
      return 'IPC 桥接不可用';
    default:
      return '操作失败';
  }
}

function normalizeFsEvent(event: string): 'add' | 'remove' | 'change' {
  if (event === 'rename') return 'change';
  return event === 'change' ? 'change' : 'change';
}

async function walkTree(
  dirPath: string,
  maxDepth: number,
  excludePatterns: Set<string>,
  isRoot = true,
): Promise<FileEntry[]> {
  if (maxDepth <= 0) return [];
  const exclude = new Set(['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information', ...excludePatterns]);
  const result: FileEntry[] = [];

  try {
    const names = await readdir(dirPath);
    const tasks = names.map(async (name) => {
      if (exclude.has(name) || name.startsWith('.')) return;
      const fullPath = join(dirPath, name);
      try {
        const st = await stat(fullPath);
        result.push({
          name,
          path: fullPath,
          isDirectory: st.isDirectory(),
          isSymlink: st.isSymbolicLink(),
          size: st.size,
          modifiedAt: st.mtimeMs,
        });
        if (st.isDirectory() && !st.isSymbolicLink()) {
          const children = await walkTree(fullPath, maxDepth - 1, excludePatterns, false);
          result.push(...children);
        }
      } catch { /* skip */ }
    });
    await Promise.all(tasks);
  } catch (err) {
    if (isRoot) throw err;
  }

  return result;
}
