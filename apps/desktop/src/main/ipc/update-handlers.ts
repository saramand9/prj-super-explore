import { UPDATE_CHANNELS } from '@explore/shared';
import type { IpcRegistrar } from './ipc-registrar';
import type { UpdateService } from '../services/update.service';
import type { WindowService } from '../services/window.service';

export function registerUpdateHandlers(
  ipc: IpcRegistrar,
  updates: UpdateService,
  windows: WindowService,
): void {
  const mainOnly = (owner: number) => {
    if (windows.getMainWindow()?.webContents.id !== owner)
      throw Object.assign(new Error('Updates are available only in the main window'), {
        code: 'PERMISSION_DENIED',
      });
  };
  ipc.handle(UPDATE_CHANNELS.getState, (event) => {
    mainOnly(event.sender.id);
    return updates.controller.snapshot();
  });
  ipc.handle(UPDATE_CHANNELS.check, (event) => {
    mainOnly(event.sender.id);
    return updates.controller.check();
  });
  ipc.handle(UPDATE_CHANNELS.download, (event) => {
    mainOnly(event.sender.id);
    return updates.controller.download();
  });
  ipc.handle(UPDATE_CHANNELS.install, (event) => {
    mainOnly(event.sender.id);
    return updates.controller.install();
  });
  ipc.handle(UPDATE_CHANNELS.resolveSave, (event, payload) => {
    mainOnly(event.sender.id);
    updates.resolveSave(event.sender.id, payload.requestId, payload.allow);
  });
}
