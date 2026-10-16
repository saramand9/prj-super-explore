import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileReadResult } from '@explore/shared';
import { ipc } from '../../src/renderer/framework/bridge/ipc-client';
import { useViewerStore } from '../../src/renderer/plugins/viewer/store';

const listeners = vi.hoisted(() => new Map<string, (value: any) => void>());

vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({
  ipc: {
    invoke: vi.fn(),
    on: vi.fn((channel, callback) => { listeners.set(channel, callback); return () => listeners.delete(channel); }),
  },
  getIpcErrorMessage: (error: Error) => error.message,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function result(content: string, partial = false): FileReadResult {
  return { content, size: content.length, bytesRead: content.length, partial, canContinue: partial };
}

function mockReads(read: (payload: any) => Promise<FileReadResult>) {
  vi.mocked(ipc.invoke).mockImplementation((channel, payload) =>
    (channel === 'file:read' ? read(payload) : Promise.resolve(undefined)) as any);
}

describe('viewer request lifecycle', () => {
  beforeEach(() => {
    vi.mocked(ipc.invoke).mockReset().mockResolvedValue(undefined);
    useViewerStore.getState().clear('left');
    useViewerStore.getState().clear('right');
    useViewerStore.setState(useViewerStore.getInitialState());
    vi.mocked(ipc.invoke).mockClear();
  });

  it.each(['success', 'error'])('does not show a stale %s from A under the path of B', async (outcome) => {
    const older = deferred<FileReadResult>();
    mockReads(({ path }) => path === 'D:/A.txt' ? older.promise : Promise.resolve(result('B content')));
    const pending = useViewerStore.getState().loadFile('left', 'D:/A.txt');
    await useViewerStore.getState().loadFile('left', 'D:/B.txt');
    if (outcome === 'success') older.resolve(result('A content'));
    else older.reject(new Error('A read failed'));
    await pending;

    expect(useViewerStore.getState().left).toMatchObject({
      filePath: 'D:/B.txt', content: 'B content', loading: false, error: null,
    });
    expect(ipc.invoke).not.toHaveBeenCalledWith('file:watchFile', { path: 'D:/A.txt' });
  });

  it('discards the older read even when the same path is opened again', async () => {
    const older = deferred<FileReadResult>();
    let reads = 0;
    mockReads(() => ++reads === 1 ? older.promise : Promise.resolve(result('new version')));
    const pending = useViewerStore.getState().loadFile('left', 'D:/same.txt');
    await useViewerStore.getState().loadFile('left', 'D:/same.txt');
    older.resolve(result('old version'));
    await pending;
    expect(useViewerStore.getState().left.content).toBe('new version');
  });

  it.each(['loadFullFile', 'reload', 'silentReload'] as const)('ignores %s after changing files', async (action) => {
    mockReads(() => Promise.resolve(result('A preview', true)));
    await useViewerStore.getState().loadFile('left', 'D:/A.txt');
    const older = deferred<FileReadResult>();
    mockReads(({ path }) => path === 'D:/A.txt' ? older.promise : Promise.resolve(result('B content')));
    const pending = useViewerStore.getState()[action]('left');
    await useViewerStore.getState().loadFile('left', 'D:/B.txt');
    older.resolve(result('A full or refreshed content'));
    await pending;
    expect(useViewerStore.getState().left).toMatchObject({ filePath: 'D:/B.txt', content: 'B content', loading: false });
  });

  it('does not repopulate a cleared preview or start its watcher', async () => {
    const older = deferred<FileReadResult>();
    mockReads(() => older.promise);
    const pending = useViewerStore.getState().loadFile('left', 'D:/A.txt');
    useViewerStore.getState().clear('left');
    older.resolve(result('A content'));
    await pending;
    expect(useViewerStore.getState().left).toMatchObject({ filePath: null, content: '', loading: false, error: null });
    expect(ipc.invoke).not.toHaveBeenCalledWith('file:watchFile', { path: 'D:/A.txt' });
  });

  it('keeps reads for opposite panels independent', async () => {
    const left = deferred<FileReadResult>();
    mockReads(({ path }) => path === 'D:/left.txt' ? left.promise : Promise.resolve(result('right')));
    const pending = useViewerStore.getState().loadFile('left', 'D:/left.txt');
    await useViewerStore.getState().loadFile('right', 'D:/right.txt');
    left.resolve(result('left'));
    await pending;
    expect(useViewerStore.getState().left.content).toBe('left');
    expect(useViewerStore.getState().right.content).toBe('right');
  });

  it('ignores an old watcher registration failure after navigating away', async () => {
    const watcher = deferred<void>();
    vi.mocked(ipc.invoke).mockImplementation((channel, payload: any) => {
      if (channel === 'file:read') return Promise.resolve(result(payload.path)) as any;
      if (channel === 'file:watchFile' && payload.path === 'D:/A.txt') return watcher.promise as any;
      return Promise.resolve(undefined) as any;
    });
    await useViewerStore.getState().loadFile('left', 'D:/A.txt');
    await useViewerStore.getState().loadFile('left', 'D:/B.txt');
    watcher.reject(new Error('A watcher failed'));
    await Promise.resolve();
    expect(useViewerStore.getState().left.watchError).toBeNull();
  });

  it('still reports a current watcher failure when the same file has been reloaded', async () => {
    const watcher = deferred<void>();
    vi.mocked(ipc.invoke).mockImplementation((channel) => {
      if (channel === 'file:read') return Promise.resolve(result('content')) as any;
      if (channel === 'file:watchFile') return watcher.promise as any;
      return Promise.resolve(undefined) as any;
    });
    await useViewerStore.getState().loadFile('left', 'D:/A.txt');
    await useViewerStore.getState().reload('left');
    watcher.reject(new Error('current watcher failed'));
    await Promise.resolve();
    expect(useViewerStore.getState().left.watchError).toBe('current watcher failed');
  });

  it('keeps a shared watcher until both panels leave the file', async () => {
    mockReads(() => Promise.resolve(result('shared content')));
    await useViewerStore.getState().loadFile('left', 'D:/shared.txt');
    await useViewerStore.getState().loadFile('right', 'D:/shared.txt');
    vi.mocked(ipc.invoke).mockClear();
    useViewerStore.getState().clear('left');
    expect(ipc.invoke).not.toHaveBeenCalledWith('file:unwatchFile', { path: 'D:/shared.txt' });
    listeners.get('file:contentChanged')!({ filePath: 'D:/shared.txt' });
    await Promise.resolve();
    expect(ipc.invoke).toHaveBeenCalledWith('file:read', { path: 'D:/shared.txt', loadFull: true });
    useViewerStore.getState().clear('right');
    expect(ipc.invoke).toHaveBeenCalledWith('file:unwatchFile', { path: 'D:/shared.txt' });
  });

  it('ignores stale watcher notifications while a new file is being read', async () => {
    mockReads(() => Promise.resolve(result('A')));
    await useViewerStore.getState().loadFile('left', 'D:/A.txt');
    const pendingRead = deferred<FileReadResult>();
    mockReads(() => pendingRead.promise);
    const pending = useViewerStore.getState().loadFile('left', 'D:/B.txt');
    listeners.get('file:contentChanged')!({ filePath: 'D:/A.txt' });
    listeners.get('file:watchError')!({ filePath: 'D:/A.txt', error: { message: 'old error' } });
    listeners.get('file:contentChanged')!({ filePath: 'D:/B.txt' });
    pendingRead.resolve(result('B'));
    await pending;
    expect(useViewerStore.getState().left).toMatchObject({ filePath: 'D:/B.txt', content: 'B', watchError: null, loading: false });
  });
});
