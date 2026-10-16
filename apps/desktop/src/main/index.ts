import { app, BrowserWindow, dialog, shell } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { ServiceContainer } from './service-container';
import { ConfigService } from './services/config.service';
import { FileService } from './services/file.service';
import { SearchService } from './services/search.service';
import { IndexService } from './services/index.service';
import { WatcherService } from './services/watcher.service';
import { ScanService } from './services/scan.service';
import { DiagnosticsService } from './services/diagnostics.service';
import { HotkeyService } from './services/hotkey.service';
import { WindowService } from './services/window.service';
import { registerIpcHandlers } from './ipc/handlers';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

const userDataOverride = app.commandLine.getSwitchValue('user-data-dir');
if (userDataOverride) {
  const userDataPath = resolve(userDataOverride);
  mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
}

let container: ServiceContainer;
const diagnostics = new DiagnosticsService();
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) {
  console.info('[startup] Existing instance owns', app.getPath('userData'));
  app.quit();
}

if (primaryInstance) {
  app.on('second-instance', () => {
    const window = container?.tryGet<WindowService>('window')?.getMainWindow();
    if (window && !window.isDestroyed()) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });

  // Log fatal exceptions without suppressing Electron's default failure handling.
  process.on('uncaughtExceptionMonitor', (error) => diagnostics.log('main-exception', error));
  process.on('unhandledRejection', (error) => diagnostics.log('main-promise', error));

  void app
    .whenReady()
    .then(async () => {
      diagnostics.init();
      diagnostics.log('startup', `Explore ${app.getVersion()} (${process.platform} ${process.arch})`);
      // 设置 Electron 工具
      electronApp.setAppUserModelId('com.explore.app');
      app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window);
      });

      // 初始化服务容器
      container = new ServiceContainer();

      container.register('diagnostics', () => diagnostics);
      container.register('config', () => new ConfigService());
      container.register('watcher', () => new WatcherService());
      container.register('scan', () => new ScanService());
      container.register('file', (ctx) => new FileService(ctx));
      container.register('search', (ctx) => new SearchService(ctx));
      container.register('index', (ctx) => new IndexService(ctx));
      container.register('window', () => new WindowService(diagnostics));
      container.register('hotkey', (ctx) => new HotkeyService(ctx));

      await container.initAll();

      // 注册 IPC
      registerIpcHandlers(container);

      // 创建主窗口
      const windowSvc = container.get<WindowService>('window');
      windowSvc.createMainWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          windowSvc.createMainWindow();
        }
      });
    })
    .catch(async (error) => {
      diagnostics.log('startup-failed', error);
      try {
        await container?.disposeAll();
      } catch (failure) {
        diagnostics.log('startup-cleanup', failure);
      }
      let response = 1;
      while (response === 1) {
        ({ response } = await dialog.showMessageBox({
          type: 'error',
          title: 'Explore 启动失败',
          message: '应用未能完成初始化。',
          detail: `${error instanceof Error ? error.message : String(error)}\n可以查看本地日志后重新启动。`,
          buttons: ['重新启动', '打开日志', '退出'],
          defaultId: 0,
          cancelId: 2,
          noLink: true,
        }));
        if (response === 1) await shell.openPath(diagnostics.logDirectory).catch(() => {});
      }
      if (response === 0) app.relaunch();
      app.exit(1);
    });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (container) {
    void container.disposeAll().catch((error) => diagnostics.log('shutdown', error));
  }
});
