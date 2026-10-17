import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpdateController, type UpdateEvents } from '../../src/main/updates/update-controller';
import { OperationGuard } from '../../src/main/updates/operation-guard';
import { UpdateSaveBarrier } from '../../src/main/updates/update-save-barrier';
import { validateRequest } from '../../src/main/ipc/request-validation';

function fixture() {
  let events!: UpdateEvents;
  const engine = {
    subscribe: vi.fn((listeners: UpdateEvents) => {
      events = listeners;
      return vi.fn();
    }),
    check: vi.fn(async () => {
      events.available('1.0.3');
    }),
    download: vi.fn(async () => {
      events.downloaded('1.0.3');
    }),
    install: vi.fn(),
  };
  const guard = new OperationGuard();
  const save = vi.fn(async () => true);
  const permitQuit = vi.fn();
  const controller = new UpdateController('1.0.2', engine, { guard, save, permitQuit });
  return { controller, engine, guard, save, permitQuit, events: () => events };
}

afterEach(() => vi.useRealTimers());

describe('manual-consent updates', () => {
  it('checks without downloading and downloads without installing', async () => {
    const { controller, engine } = fixture();
    await controller.check();
    expect(controller.snapshot().status).toBe('available');
    expect(engine.download).not.toHaveBeenCalled();
    await controller.download();
    expect(controller.snapshot()).toMatchObject({ status: 'downloaded', availableVersion: '1.0.3' });
    expect(engine.install).not.toHaveBeenCalled();
  });
  it('never downloads or installs before a verified update is available', async () => {
    const { controller, engine } = fixture();
    await controller.download();
    await controller.install();
    expect(engine.download).not.toHaveBeenCalled();
    expect(engine.install).not.toHaveBeenCalled();
  });
  it('keeps checks single-flight and throttles repeated checks', async () => {
    const { controller, engine, events } = fixture();
    let finish!: () => void;
    engine.check.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const check = controller.check();
    await controller.check();
    expect(engine.check).toHaveBeenCalledTimes(1);
    events().notAvailable();
    finish();
    await check;
    await controller.check();
    expect(engine.check).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().status).toBe('idle');
  });
  it('reports progress but only marks ready after download verification completes', async () => {
    const { controller, engine, events } = fixture();
    await controller.check();
    let finish!: () => void;
    engine.download.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const download = controller.download();
    events().progress(150);
    expect(controller.snapshot()).toMatchObject({ status: 'downloading', percent: 100 });
    events().error(new Error('sha512 mismatch'));
    finish();
    await download;
    expect(controller.snapshot().status).toBe('error');
    await controller.install();
    expect(engine.install).not.toHaveBeenCalled();
  });
  it('blocks installation during a file mutation and blocks new mutations while saving', async () => {
    const { controller, guard, engine, save } = fixture();
    await controller.check();
    await controller.download();
    let finish!: () => void;
    const copying = guard.run(
      'file:copy',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await controller.install();
    expect(save).not.toHaveBeenCalled();
    expect(controller.snapshot().message).toContain('文件操作');
    finish();
    await copying;
    let saved!: (allow: boolean) => void;
    save.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          saved = resolve;
        }),
    );
    const installing = controller.install();
    await expect(guard.run('file:rename', async () => true)).rejects.toThrow('更新');
    await expect(guard.run('settings:saveAppearance', async () => true)).resolves.toBe(true);
    saved(true);
    await installing;
    expect(engine.install).toHaveBeenCalledTimes(1);
  });
  it('does not quit after save failure and releases the mutation lock for retry', async () => {
    const { controller, engine, save, guard, permitQuit } = fixture();
    await controller.check();
    await controller.download();
    save.mockResolvedValue(false);
    await controller.install();
    expect(engine.install).not.toHaveBeenCalled();
    expect(permitQuit).not.toHaveBeenCalledWith(true);
    expect(controller.snapshot().status).toBe('downloaded');
    await expect(guard.run('file:delete', async () => true)).resolves.toBe(true);
    save.mockResolvedValue(true);
    await controller.install();
    expect(permitQuit).toHaveBeenCalledWith(true);
    expect(engine.install).toHaveBeenCalledTimes(1);
  });
  it('recovers if launching the installer fails, including asynchronous errors', async () => {
    const { controller, engine, events, guard, permitQuit } = fixture();
    await controller.check();
    await controller.download();
    engine.install.mockImplementationOnce(() => {
      throw new Error('spawn failed');
    });
    await controller.install();
    expect(controller.snapshot().status).toBe('downloaded');
    expect(permitQuit).toHaveBeenLastCalledWith(false);
    await controller.install();
    events().error(new Error('installer rejected'));
    expect(controller.snapshot().status).toBe('downloaded');
    await expect(guard.run('file:create', async () => true)).resolves.toBe(true);
  });
  it('ignores stale completion after disposal and rejects development updates', async () => {
    const { controller, engine, events } = fixture();
    await controller.check();
    controller.dispose();
    events().downloaded('99.0.0');
    await controller.install();
    expect(engine.install).not.toHaveBeenCalled();
    const disabled = new UpdateController('1.0.2', null, {
      guard: new OperationGuard(),
      save: async () => true,
      permitQuit: vi.fn(),
    });
    await disabled.check();
    expect(disabled.snapshot().status).toBe('disabled');
  });
});

describe('update save handshake', () => {
  it('accepts only the matching main renderer response', async () => {
    const send = vi.fn();
    const barrier = new UpdateSaveBarrier(send);
    const saving = barrier.wait(42);
    const requestId = send.mock.calls[0][0];
    barrier.resolve(7, requestId, true);
    barrier.resolve(42, requestId + 1, true);
    barrier.resolve(42, requestId, false);
    await expect(saving).resolves.toBe(false);
  });
  it('times out closed/unresponsive renderers and ignores late responses', async () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const barrier = new UpdateSaveBarrier(send);
    const saving = barrier.wait(42);
    vi.advanceTimersByTime(15000);
    barrier.resolve(42, send.mock.calls[0][0], true);
    await expect(saving).resolves.toBe(false);
    const next = barrier.wait(42);
    barrier.cancel();
    await expect(next).resolves.toBe(false);
  });
  it('does not accept arbitrary feed URLs, paths, options or invalid save responses over IPC', () => {
    for (const channel of ['update:check', 'update:download', 'update:install', 'update:getState'] as const) {
      expect(() => validateRequest(channel, undefined)).not.toThrow();
      expect(() => validateRequest(channel, { url: 'https://evil.example/installer.exe' })).toThrow();
    }
    expect(() => validateRequest('update:resolveSave', { requestId: 1, allow: true })).not.toThrow();
    expect(() => validateRequest('update:resolveSave', { requestId: -1, allow: true })).toThrow();
  });
});
