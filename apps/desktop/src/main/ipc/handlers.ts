import { ipcMain, BrowserWindow, dialog, app } from 'electron';
import type { IpcChannels, IpcEvents } from '@explore/shared';
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
      file.copyFiles(payload.sources, payload.destDir),
  );

  ipcMain.handle(
    'file:move',
    (_e, payload: IpcChannels['file:move']['req']) =>
      file.moveFiles(payload.sources, payload.destDir),
  );

  ipcMain.handle(
    'file:delete',
    (_e, payload: IpcChannels['file:delete']['req']) =>
      file.deleteFiles(payload.paths, payload.permanent),
  );

  ipcMain.handle(
    'file:mkdir',
    (_e, payload: IpcChannels['file:mkdir']['req']) =>
      file.createDir(payload.parentPath, payload.name),
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
    'file:openInExplorer',
    (_e, payload: IpcChannels['file:openInExplorer']['req']) => {
      const { shell } = require('electron');
      shell.showItemInFolder(payload.path);
    },
  );

  // ── Search ──

  ipcMain.handle(
    'search:fulltext',
    (_e, payload: IpcChannels['search:fulltext']['req']) => {
      const searchId = `${payload.dir}:${payload.query}`;
      return search.fulltext(payload.dir, payload.query, searchId, {
        filePattern: payload.filePattern,
        maxResults: payload.maxResults,
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

  // ── App ──

  ipcMain.handle('app:getVersion', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:getHomeDir', () => app.getPath('home'));
}
