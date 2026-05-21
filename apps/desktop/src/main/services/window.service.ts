import { BrowserWindow, screen } from 'electron';
import { existsSync } from 'fs';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import type { Service } from '../service-container';

function getAppIconPath(): string | undefined {
  const iconPath = join(__dirname, '../../build/icons/prism_app.ico');
  return existsSync(iconPath) ? iconPath : undefined;
}

export class WindowService implements Service {
  private mainWindow: BrowserWindow | null = null;
  private launcherWindow: BrowserWindow | null = null;

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

    this.mainWindow.on('ready-to-show', () => {
      this.mainWindow?.show();
    });

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

  dispose(): void {
    if (this.launcherWindow && !this.launcherWindow.isDestroyed()) {
      this.launcherWindow.close();
    }
    this.launcherWindow = null;
    this.mainWindow = null;
  }
}
