import { app, BrowserWindow } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { ServiceContainer } from './service-container';
import { ConfigService } from './services/config.service';
import { FileService } from './services/file.service';
import { SearchService } from './services/search.service';
import { IndexService } from './services/index.service';
import { WatcherService } from './services/watcher.service';
import { HotkeyService } from './services/hotkey.service';
import { WindowService } from './services/window.service';
import { registerIpcHandlers } from './ipc/handlers';

let container: ServiceContainer;

app.whenReady().then(async () => {
  // 设置 Electron 工具
  electronApp.setAppUserModelId('com.explore.app');
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // 初始化服务容器
  container = new ServiceContainer();

  container.register('config', () => new ConfigService());
  container.register('watcher', () => new WatcherService());
  container.register('file', (ctx) => new FileService(ctx));
  container.register('search', (ctx) => new SearchService(ctx));
  container.register('index', (ctx) => new IndexService(ctx));
  container.register('window', () => new WindowService());
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
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', async () => {
  if (container) {
    await container.disposeAll();
  }
});
