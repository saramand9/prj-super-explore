import { BrowserWindow, dialog, app, clipboard, shell } from 'electron';
import { join } from 'path';
import type { IpcChannels, IpcEvents, FileEntry } from '@explore/shared';
import type { ServiceContainer } from '../service-container';
import type { FileService } from '../services/file.service';
import type { SearchService } from '../services/search.service';
import type { IndexService } from '../services/index.service';
import type { ConfigService } from '../services/config.service';
import type { WindowService } from '../services/window.service';
import type { WatcherService } from '../services/watcher.service';
import type { ScanService } from '../services/scan.service';
import type { DiagnosticsService } from '../services/diagnostics.service';
import { createIpcRegistrar } from './ipc-registrar';
import { registerPluginHandlers } from './plugin-handlers';
import { registerUpdateHandlers } from './update-handlers';
import type { UpdateService } from '../services/update.service';
import type { OperationGuard } from '../updates/operation-guard';

import { readTextFile } from './text-preview';
import { toIpcError, toIpcErrorInfo } from './ipc-errors';

export function registerIpcHandlers(container: ServiceContainer): void {
  const file = container.get<FileService>('file');
  const search = container.get<SearchService>('search');
  const index = container.get<IndexService>('index');
  const config = container.get<ConfigService>('config');
  const windowSvc = container.get<WindowService>('window');
  const watcher = container.get<WatcherService>('watcher');
  const scan = container.get<ScanService>('scan');
  const diagnostics = container.get<DiagnosticsService>('diagnostics');
  const updates = container.get<UpdateService>('updates');
  const owners = new Set<number>();
  const trackOwner = (sender: Electron.WebContents) => {
    if (owners.has(sender.id)) return;
    owners.add(sender.id);
    const cancel = () => {
      scan.cancelOwner(sender.id);
      search.cancelOwner(sender.id);
    };
    sender.on('did-start-loading', cancel);
    sender.once('destroyed', () => {
      cancel();
      owners.delete(sender.id);
    });
  };
  const ipcMain = createIpcRegistrar(
    (event) => windowSvc.isTrustedSender(event),
    (source, error) => diagnostics.log(source, error),
    container.get<OperationGuard>('operations'),
  );
  registerUpdateHandlers(ipcMain, updates, windowSvc);

  // ── File ──

  ipcMain.handle('file:readDir', (_e, payload: IpcChannels['file:readDir']['req']) =>
    file.readDir(payload.path, payload.sort, payload.showHidden),
  );

  ipcMain.handle('file:stat', (_e, payload: IpcChannels['file:stat']['req']) => file.getStat(payload.path));

  ipcMain.handle('file:copy', (_e, payload: IpcChannels['file:copy']['req']) =>
    file.copyFiles(payload.sources, payload.destDir, payload.conflictStrategy, payload.operationId),
  );

  ipcMain.handle('file:move', (_e, payload: IpcChannels['file:move']['req']) =>
    file.moveFiles(payload.sources, payload.destDir, payload.conflictStrategy, payload.operationId),
  );

  ipcMain.handle('file:delete', (_e, payload: IpcChannels['file:delete']['req']) =>
    file.deleteFiles(payload.paths, payload.permanent, payload.operationId),
  );

  ipcMain.handle('file:cancelOperation', (_e, payload: IpcChannels['file:cancelOperation']['req']) => ({
    cancelled: file.cancelOperation(payload.operationId),
  }));

  ipcMain.handle('file:mkdir', (_e, payload: IpcChannels['file:mkdir']['req']) =>
    file.createDir(payload.parentPath, payload.name),
  );

  ipcMain.handle('file:create', (_e, payload: IpcChannels['file:create']['req']) =>
    file.createFile(payload.parentPath, payload.name),
  );

  ipcMain.handle('file:rename', (_e, payload: IpcChannels['file:rename']['req']) =>
    file.renameFile(payload.path, payload.newName),
  );

  ipcMain.handle('file:exists', (_e, payload: IpcChannels['file:exists']['req']) =>
    file.exists(payload.path),
  );

  ipcMain.handle('file:open', (_e, payload: IpcChannels['file:open']['req']) => file.open(payload.path));

  ipcMain.handle('file:read', (_e, payload: IpcChannels['file:read']['req']) => readTextFile(payload));

  ipcMain.handle('file:openInExplorer', (_e, payload: IpcChannels['file:openInExplorer']['req']) => {
    const { shell } = require('electron');
    shell.openPath(payload.path);
  });

  ipcMain.handle('file:showItemInFolder', (_e, payload: IpcChannels['file:showItemInFolder']['req']) => {
    const { shell } = require('electron');
    shell.showItemInFolder(payload.path);
  });

  ipcMain.handle('file:watch', (_e, payload: IpcChannels['file:watch']['req']) => {
    const watcherId = `watch-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    watcher.watch(
      payload.path,
      watcherId,
      (event, filePath) => {
        const win = windowSvc.getMainWindow();
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
  });

  ipcMain.handle('file:unwatch', (_e, payload: IpcChannels['file:unwatch']['req']) => {
    watcher.unwatch(payload.watcherId);
  });

  // ── File watching (tail -f) ──

  ipcMain.handle('file:watchFile', (_e, payload: IpcChannels['file:watchFile']['req']) => {
    file.watchFile(
      payload.path,
      () => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send('file:contentChanged', { filePath: payload.path });
        }
      },
      (err) => {
        const win = BrowserWindow.getAllWindows()[0];
        if (win && !win.isDestroyed()) {
          win.webContents.send('file:watchError', {
            filePath: payload.path,
            error: toIpcErrorInfo('file:watchFile', err),
          });
        }
      },
    );
  });

  ipcMain.handle('file:unwatchFile', (_e, payload: IpcChannels['file:unwatchFile']['req']) => {
    file.unwatchFile(payload.path);
  });

  // ── Walk Tree (recursive directory listing for search index) ──

  ipcMain.handle('file:walkTree', async (event, payload: IpcChannels['file:walkTree']['req']) => {
    trackOwner(event.sender);
    const entries: FileEntry[] = [];
    const summary = await scan.scan(
      `${event.sender.id}:legacy:${Date.now()}:${Math.random()}`,
      payload.path,
      {
        ...payload,
        onBatch: (batch) => entries.push(...batch),
      },
    );
    if (summary.truncated) throw new Error('扫描条目过多，请缩小搜索范围');
    return entries;
  });
  ipcMain.handle('file:scan', async (event, payload) => {
    trackOwner(event.sender);
    return scan.scan(`${event.sender.id}:${payload.scanId}`, payload.path, {
      ...payload,
      onBatch: (entries, summary) => {
        if (!event.sender.isDestroyed())
          event.sender.send('file:scanProgress', { ...summary, scanId: payload.scanId, entries });
      },
    });
  });
  ipcMain.handle('file:cancelScan', (event, payload) => scan.cancel(`${event.sender.id}:${payload.scanId}`));

  // ── Directory Sizes (batch, with cache) ──

  ipcMain.handle('file:dirSizes', async (_e, payload: IpcChannels['file:dirSizes']['req']) => {
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
          } catch {
            /* skip */
          }
        }
      });
    }

    return result;
  });

  // ── Search ──

  ipcMain.handle('search:fulltext', (event, payload: IpcChannels['search:fulltext']['req']) => {
    trackOwner(event.sender);
    const searchId = `${event.sender.id}:${payload.searchId ?? `${payload.dir}:${payload.query}`}`;
    return search.fulltext(payload.dir, payload.query, searchId, {
      filePattern: payload.filePattern,
      excludePatterns: payload.excludePatterns,
      maxResults: payload.maxResults,
      maxFileSize: payload.maxFileSize,
    });
  });

  ipcMain.handle('search:cancel', (event, payload: IpcChannels['search:cancel']['req']) => {
    search.cancel(`${event.sender.id}:${payload.searchId}`);
  });
  ipcMain.handle('search:run', (event, payload) => {
    trackOwner(event.sender);
    return search.run(
      payload.dir,
      payload.query,
      `${event.sender.id}:${payload.searchId}`,
      payload,
      (matches, total) => {
        if (!event.sender.isDestroyed())
          event.sender.send('search:progress', { searchId: payload.searchId, matches, total });
      },
    );
  });

  // ── Index ──

  ipcMain.handle('index:query', (_e, payload: IpcChannels['index:query']['req']) =>
    index.query(payload.pattern, payload.maxResults),
  );

  ipcMain.handle('index:rebuild', (_e, payload: IpcChannels['index:rebuild']['req']) =>
    index.rebuild(payload.paths).then((itemCount) => ({ itemCount })),
  );

  ipcMain.handle('index:status', () => index.status);

  // ── Bookmarks ──

  ipcMain.handle('bookmark:list', () => config.getBookmarks());

  ipcMain.handle('bookmark:add', (_e, payload: IpcChannels['bookmark:add']['req']) => {
    config.addBookmark(payload);
  });

  ipcMain.handle('bookmark:remove', (_e, payload: IpcChannels['bookmark:remove']['req']) => {
    config.removeBookmark(payload.id);
  });

  ipcMain.handle('bookmark:update', (_e, payload: IpcChannels['bookmark:update']['req']) => {
    config.updateBookmark(payload.id, payload.updates);
  });

  // ── Pinned Tabs ──

  ipcMain.handle('tabs:load', () => {
    const tabs = config.getPinnedTabs();
    return {
      left: tabs.left.map((tab) => ({ ...tab, initialPath: (tab as any).initialPath ?? tab.path })),
      right: tabs.right.map((tab) => ({ ...tab, initialPath: (tab as any).initialPath ?? tab.path })),
    };
  });

  ipcMain.handle('tabs:save', (_e, payload: IpcChannels['tabs:save']['req']) => {
    config.savePinnedTabs(payload.side, payload.tabs);
  });

  // ── Spaces ──

  ipcMain.handle('space:list', () => config.getSpaces());

  ipcMain.handle('space:save', (_e, payload: IpcChannels['space:save']['req']) => {
    config.saveSpaces(payload.spaces);
  });

  // ── Window ──

  ipcMain.handle('window:readyForClose', (event) => windowSvc.readyForClose(event.sender.id));
  ipcMain.handle('window:resolveClose', (event, payload) =>
    windowSvc.resolveClose(event.sender.id, payload.allow, payload.requestId),
  );
  ipcMain.handle('window:closePending', (event, payload) =>
    windowSvc.closePending(event.sender.id, payload.requestId),
  );
  ipcMain.handle('app:reportError', (_event, payload) => {
    if (typeof payload?.source !== 'string' || typeof payload?.message !== 'string') return;
    diagnostics.log(
      payload.source,
      `${payload.message.slice(0, 4000)}\n${typeof payload.stack === 'string' ? payload.stack.slice(0, 8000) : ''}`,
    );
  });
  ipcMain.handle('app:copyDiagnostics', (_event, payload) =>
    clipboard.writeText(diagnostics.snapshot(payload)),
  );
  ipcMain.handle('app:openLogs', async () => {
    const error = await shell.openPath(diagnostics.logDirectory);
    if (error) throw new Error(error);
  });

  ipcMain.handle('window:toggleLauncher', () => {
    windowSvc.toggleLauncher();
  });

  // ── Dialogs ──

  ipcMain.handle('dialog:openFolder', async (_e, payload: IpcChannels['dialog:openFolder']['req']) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      defaultPath: payload.defaultPath,
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:confirm', async (_e, payload: IpcChannels['dialog:confirm']['req']) => {
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
  });

  ipcMain.handle('dialog:alert', async (_e, payload: IpcChannels['dialog:alert']['req']) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return;
    await dialog.showMessageBox(win, {
      type: payload.type ?? 'info',
      buttons: ['确定'],
      defaultId: 0,
      title: payload.title || '提示',
      message: payload.message,
    });
  });

  ipcMain.handle('dialog:choice', async (_e, payload: IpcChannels['dialog:choice']['req']) => {
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
  });

  ipcMain.handle('dialog:prompt', async (_e, payload: IpcChannels['dialog:prompt']['req']) => {
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
  });

  registerPluginHandlers(ipcMain);

  // ── App ──

  ipcMain.handle('settings:getAppearance', () => config.getAppearance());
  ipcMain.handle('settings:saveAppearance', (_event, payload) => config.saveAppearance(payload));

  ipcMain.handle('app:getVersion', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:getHomeDir', () => app.getPath('home'));
}
function normalizeFsEvent(event: string): 'add' | 'remove' | 'change' {
  if (event === 'rename') return 'change';
  return event === 'change' ? 'change' : 'change';
}
