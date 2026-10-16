import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileStore } from '../../src/renderer/plugins/file-explorer/store';
import { ipc } from '../../src/renderer/framework/bridge/ipc-client';

vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({
  ipc: { invoke: vi.fn() },
  IpcClientError: class extends Error {},
  getIpcErrorMessage: (error: Error) => error.message,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('directory navigation', () => {
  beforeEach(() => {
    vi.mocked(ipc.invoke).mockReset();
    useFileStore.setState(useFileStore.getInitialState());
  });

  it.each(['success', 'error'])('ignores a stale directory %s after newer navigation', async (outcome) => {
    const older = deferred<any[]>();
    vi.mocked(ipc.invoke).mockReturnValueOnce(older.promise).mockResolvedValueOnce([{ name: 'new.txt' }]);
    const pending = useFileStore.getState().navigateTo('left', 'D:/old');
    await useFileStore.getState().navigateTo('left', 'D:/new');
    if (outcome === 'success') older.resolve([{ name: 'old.txt' }]);
    else older.reject(new Error('old directory missing'));
    await pending;

    expect(useFileStore.getState().left).toMatchObject({
      path: 'D:/new', entries: [{ name: 'new.txt' }], loading: false, error: null,
    });
  });

  it('ignores a refresh after navigating away', async () => {
    const older = deferred<any[]>();
    vi.mocked(ipc.invoke).mockResolvedValueOnce([]).mockReturnValueOnce(older.promise).mockResolvedValueOnce([]);
    await useFileStore.getState().navigateTo('left', 'D:/old');
    const pending = useFileStore.getState().refresh('left');
    await useFileStore.getState().navigateTo('left', 'D:/new');
    older.resolve([{ name: 'old.txt' }]);
    await pending;
    expect(useFileStore.getState().left.entries).toEqual([]);
  });

  it('invalidates pending reads when resetting a panel', async () => {
    const older = deferred<any[]>();
    vi.mocked(ipc.invoke).mockReturnValueOnce(older.promise);
    const pending = useFileStore.getState().navigateTo('right', 'D:/old');
    useFileStore.getState().resetPanel('right');
    older.resolve([{ name: 'old.txt' }]);
    await pending;
    expect(useFileStore.getState().right).toMatchObject({ path: null, entries: [], loading: false });
  });

  it('loads both sides independently', async () => {
    vi.mocked(ipc.invoke).mockResolvedValueOnce([{ name: 'left.txt' }]).mockResolvedValueOnce([{ name: 'right.txt' }]);
    await Promise.all([
      useFileStore.getState().navigateTo('left', 'D:/left'),
      useFileStore.getState().navigateTo('right', 'D:/right'),
    ]);
    expect(useFileStore.getState().left.entries[0].name).toBe('left.txt');
    expect(useFileStore.getState().right.entries[0].name).toBe('right.txt');
  });
});
