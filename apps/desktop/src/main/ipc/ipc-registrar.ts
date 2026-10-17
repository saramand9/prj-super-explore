import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { IpcChannels } from '@explore/shared';
import { validateRequest } from './request-validation';
import { toIpcError } from './ipc-errors';
import type { OperationGuard } from '../updates/operation-guard';

export interface IpcRegistrar {
  handle<C extends keyof IpcChannels>(
    channel: C,
    listener: (
      event: IpcMainInvokeEvent,
      payload: IpcChannels[C]['req'],
    ) => IpcChannels[C]['res'] | Promise<IpcChannels[C]['res']>,
  ): void;
}

export function createIpcRegistrar(
  isTrusted: (event: IpcMainInvokeEvent) => boolean,
  report: (source: string, error: unknown) => void,
  operations?: OperationGuard,
): IpcRegistrar {
  return {
    handle(channel, listener) {
      ipcMain.handle(channel, async (event, payload: unknown) => {
        try {
          if (!isTrusted(event))
            throw Object.assign(new Error('Untrusted IPC sender'), { code: 'PERMISSION_DENIED' });
          validateRequest(channel, payload);
          return await (operations
            ? operations.run(channel, () => listener(event, payload))
            : listener(event, payload));
        } catch (error) {
          report(`ipc:${channel}`, error);
          throw toIpcError(channel, error);
        }
      });
    },
  };
}
