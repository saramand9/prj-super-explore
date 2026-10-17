import { describe, expect, it, vi } from 'vitest';
import type { IpcMainInvokeEvent } from 'electron';
import { createIpcRegistrar } from '../../src/main/ipc/ipc-registrar';
import { OperationGuard } from '../../src/main/updates/operation-guard';

const handlers = vi.hoisted(
  () => new Map<string, (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>>(),
);
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: (event: IpcMainInvokeEvent, payload: unknown) => Promise<unknown>) =>
      handlers.set(channel, listener),
  },
}));

describe('update mutation lock at the real IPC registrar', () => {
  it('tracks an entire validated mutation and leaves workspace persistence usable while sealed', async () => {
    const guard = new OperationGuard();
    const registrar = createIpcRegistrar(() => true, vi.fn(), guard);
    let finish!: () => void;
    registrar.handle('file:create', async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { success: true };
    });
    registrar.handle('space:save', () => undefined);
    const event = {} as IpcMainInvokeEvent;
    const create = handlers.get('file:create')!;
    const creating = create(event, { parentPath: 'C:\\fixture', name: 'sample.txt' });
    expect(guard.acquire()).toBe(false);
    finish();
    await creating;
    expect(guard.acquire()).toBe(true);
    await expect(create(event, { parentPath: 'C:\\fixture', name: 'second.txt' })).rejects.toThrow();
    await expect(handlers.get('space:save')!(event, { spaces: [] })).resolves.toBeUndefined();
    guard.release();
  });
});
