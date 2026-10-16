import { BrowserWindow, dialog, screen } from 'electron';
import type { IpcEvents } from '@explore/shared';
import { existsSync } from 'fs';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { Service } from '../service-container';
import { CloseCoordinator } from './close-coordinator';
import type { DiagnosticsService } from './diagnostics.service';

function getAppIconPath(): string | undefined {
  const iconPath = join(__dirname, '../../build/icons/prism_app.ico');
  return existsSync(iconPath) ? iconPath : undefined;
}

export class WindowService implements Service {
  private mainWindow: BrowserWindow | null = null;
  private launcherWindow: BrowserWindow | null = null;
  private closeGuard: { window: BrowserWindow; ready: boolean; coordinator: CloseCoordinator } | null = null;

  constructor(private diagnostics?: DiagnosticsService) {}

  createMainWindow(): BrowserWindow {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 500,
      title: 'Explore',
      icon: getAppIconPath(),
      backgroundColor: '#1a1a2e',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
      },
    });

    const window = this.mainWindow;
    const coordinator = new CloseCoordinator({
      requestSave: (requestId) => window.webContents.send('window:beforeClose', { requestId }),
      cancelSave: (requestId) => {
        this.diagnostics?.log('close-timeout', 'Window did not finish saving within 8 seconds');
        if (!window.isDestroyed()) window.webContents.send('window:closeCancelled', { requestId });
      },
      close: () => { if (!window.isDestroyed()) window.close(); },
      askTimeout: async () => {
        const result = await dialog.showMessageBox(window, {
          type: 'warning', title: '保存仍未完成',
          message: '窗口保存超时，可能正在等待磁盘或窗口响应。',
          detail: '可以返回窗口或重新等待保存。不保存退出可能丢失本次未保存的更改。',
          buttons: ['返回窗口', '重新等待保存', '不保存并退出'], defaultId: 0, cancelId: 0, noLink: true,
        });
        return result.response === 1 ? 'retry' : result.response === 2 ? 'discard' : 'cancel';
      },
    });
    const guard = { window, ready: false, coordinator };
    this.closeGuard = guard;
    this.mainWindow.on('close', (event) => {
      if (!guard.ready || coordinator.confirmed || guard.window.webContents.isCrashed()) return;
      event.preventDefault();
      coordinator.begin();
    });
    this.mainWindow.on('closed', () => {
      coordinator.reset();
      if (this.closeGuard === guard) this.closeGuard = null;
      if (this.mainWindow === window) this.mainWindow = null;
      if (this.launcherWindow && !this.launcherWindow.isDestroyed()) this.launcherWindow.close();
    });
    this.mainWindow.webContents.on('did-start-loading', () => {
      guard.ready = false;
      coordinator.reset();
    });

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
    });

    this.mainWindow.on('app-command', (event, command) => {
      const action = command === 'browser-backward'
        ? 'back'
        : command === 'browser-forward'
          ? 'forward'
          : null;
      if (!action) return;

      event.preventDefault();
      this.mainWindow?.webContents.send('navigation:command', {
        action,
        source: 'app-command',
      } satisfies IpcEvents['navigation:command']);
    });

    let recoveryPending = false;
    const recover = async (message: string) => {
      this.diagnostics?.log('window', message);
      if (recoveryPending || window.isDestroyed()) return;
      recoveryPending = true;
      try {
        const result = await dialog.showMessageBox(window, {
          type: 'error', title: '窗口无法正常显示', message,
          detail: '重新加载会恢复已保存的工作空间，未保存的界面状态可能丢失。',
          buttons: ['重新加载', '关闭窗口'], defaultId: 0, cancelId: 1, noLink: true,
        });
        if (window.isDestroyed()) return;
        if (result.response === 0) window.webContents.reload();
        else { guard.ready = false; window.close(); }
      } catch (error) { this.diagnostics?.log('window-recovery', error); }
      finally { recoveryPending = false; }
    };
    this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
      void recover(`界面进程已退出（${details.reason}）`);
    });
    this.mainWindow.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) void recover(`界面加载失败：${description}`);
    });
    this.mainWindow.on('unresponsive', () => this.diagnostics?.log('window-unresponsive', 'Renderer is not responding'));
    if (is.dev) {
      this.mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
      });
      this.mainWindow.webContents.on('render-process-gone', (_event, details) => {
        console.error('[renderer:gone]', details);
      });
      this.mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
        console.error(`[renderer:load-failed] ${code} ${description} ${url}`);
      });
    }

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      this.mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return this.mainWindow;
  }

  createLauncherWindow(): BrowserWindow {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.showLauncher();
      return this.launcherWindow;
    }

    const { width: screenWidth, height: screenHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    const winWidth = 680;
    const winHeight = 420;

    this.launcherWindow = new BrowserWindow({
      width: winWidth,
      height: winHeight,
      x: Math.round((screenWidth - winWidth) / 2),
      y: Math.round(screenHeight * 0.15),
      frame: false,
      transparent: true,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      icon: getAppIconPath(),
      webPreferences: {
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
      },
    });

    this.launcherWindow.on('blur', () => {
      this.hideLauncher();
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      const url = process.env['ELECTRON_RENDERER_URL'] + '#/launcher';
      this.launcherWindow.loadURL(url);
    } else {
      this.launcherWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: '/launcher',
      });
    }

    return this.launcherWindow;
  }

  showLauncher(): void {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.center();
      this.launcherWindow.show();
      this.launcherWindow.focus();
      this.launcherWindow.webContents.send('launcher:show');
    }
  }

  hideLauncher(): void {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.hide();
      this.launcherWindow.webContents.send('launcher:hide');
    }
  }

  toggleLauncher(): void {
    if (this.launcherWindow?.isVisible()) {
      this.hideLauncher();
    } else {
      this.createLauncherWindow();
      this.showLauncher();
    }
  }

  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  readyForClose(senderId: number): void {
    if (this.closeGuard?.window.webContents.id === senderId) this.closeGuard.ready = true;
  }

  closePending(senderId: number, requestId: number): void {
    if (this.closeGuard?.window.webContents.id === senderId) this.closeGuard.coordinator.userIsDeciding(requestId);
  }

  resolveClose(senderId: number, allow: boolean, requestId: number): void {
    const guard = this.closeGuard;
    if (!guard || guard.window.webContents.id !== senderId) return;
    guard.coordinator.resolve(requestId, allow);
  }

  dispose(): void {
    this.closeGuard?.coordinator.reset();
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.close();
    }
    this.launcherWindow = null;
    this.mainWindow = null;
  }
}
