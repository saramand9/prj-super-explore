import { app } from 'electron';
import electronUpdater from 'electron-updater';
import { UPDATE_CHANNELS } from '@explore/shared';
import type { Service } from '../service-container';
import type { WindowService } from './window.service';
import type { DiagnosticsService } from './diagnostics.service';
import type { OperationGuard } from '../updates/operation-guard';
import { UpdateController } from '../updates/update-controller';
import { createUpdateEngine } from '../updates/update-engine';
import { UpdateSaveBarrier } from '../updates/update-save-barrier';

const CHECK_INTERVAL = 6 * 60 * 60 * 1000;

export class UpdateService implements Service {
  readonly controller: UpdateController;
  private saveBarrier: UpdateSaveBarrier;
  private startupTimer?: ReturnType<typeof setTimeout>;
  private checkTimer?: ReturnType<typeof setInterval>;
  private started = false;

  constructor(
    private windows: WindowService,
    diagnostics: DiagnosticsService,
    guard: OperationGuard,
  ) {
    const engine =
      app.isPackaged && process.platform === 'win32'
        ? createUpdateEngine(electronUpdater.autoUpdater, (source, error) => diagnostics.log(source, error))
        : null;
    this.saveBarrier = new UpdateSaveBarrier((requestId) => {
      windows.getMainWindow()?.webContents.send(UPDATE_CHANNELS.beforeInstall, { requestId });
    });
    this.controller = new UpdateController(app.getVersion(), engine, {
      guard,
      save: async () => {
        const window = windows.getMainWindow();
        if (!window || !windows.isReadyForUpdate()) return false;
        const cancel = () => this.saveBarrier.cancel();
        const contents = window.webContents;
        contents.once('did-start-loading', cancel);
        contents.once('render-process-gone', cancel);
        window.once('closed', cancel);
        try {
          return (await this.saveBarrier.wait(window.webContents.id)) && windows.isReadyForUpdate();
        } catch (error) {
          diagnostics.log('updater-save', error);
          return false;
        } finally {
          contents.off('did-start-loading', cancel);
          contents.off('render-process-gone', cancel);
          window.off('closed', cancel);
        }
      },
      permitQuit: (allow) => windows.permitUpdateQuit(allow),
    });
    this.controller.subscribe((state) => {
      const window = windows.getMainWindow();
      if (window && !window.isDestroyed()) window.webContents.send(UPDATE_CHANNELS.stateChanged, state);
    });
  }

  start(): void {
    if (this.started || this.controller.snapshot().status === 'disabled') return;
    this.started = true;
    this.startupTimer = setTimeout(() => void this.controller.check(), 10000);
    this.checkTimer = setInterval(() => void this.controller.check(), CHECK_INTERVAL);
  }

  resolveSave(owner: number, id: number, allow: boolean): void {
    this.saveBarrier.resolve(owner, id, allow);
  }

  dispose(): void {
    clearTimeout(this.startupTimer);
    clearInterval(this.checkTimer);
    this.saveBarrier.cancel();
    this.controller.dispose();
  }
}
