import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import { readdir, readFile, stat, mkdir, cp } from 'fs/promises';
import { join, basename, extname } from 'path';
import type { IpcChannels, IpcEvents, FileEntry } from '@explore/shared';
import type { ServiceContainer } from '../service-container';
import type { FileService } from '../services/file.service';
import type { SearchService } from '../services/search.service';
import type { IndexService } from '../services/index.service';
import type { ConfigService } from '../services/config.service';
import type { WindowService } from '../services/window.service';

export function registerIpcHandlers(container: ServiceContainer): void {
  const file = container.get<FileService>('file');
  const search = container.get<SearchService>('search');
  const index = container.get<IndexService>('index');
  const config = container.get<ConfigService>('config');
  const windowSvc = container.get<WindowService>('window');

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
    async (_e, payload: IpcChannels['file:read']['req']) => {
      const maxSize = payload.maxSize ?? 1024 * 1024;
      const st = await stat(payload.path);
      if (st.size > maxSize) throw new Error(`File too large: ${(st.size / 1024).toFixed(1)} KB`);
      const content = await readFile(payload.path, 'utf-8');
      return { content, size: st.size };
    },
  );

  ipcMain.handle(
    'file:openInExplorer',
    (_e, payload: IpcChannels['file:openInExplorer']['req']) => {
      const { shell } = require('electron');
      shell.openPath(payload.path);
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
      index.rebuild(payload.paths),
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

  ipcMain.handle('tabs:load', () => config.getPinnedTabs());

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

async function walkTree(
  dirPath: string,
  maxDepth: number,
  excludePatterns: Set<string>,
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
          const children = await walkTree(fullPath, maxDepth - 1, excludePatterns);
          result.push(...children);
        }
      } catch { /* skip */ }
    });
    await Promise.all(tasks);
  } catch { /* skip */ }

  return result;
}
