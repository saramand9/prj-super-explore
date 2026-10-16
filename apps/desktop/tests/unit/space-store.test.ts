import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Space } from '@explore/shared';
import { ipc } from '../../src/renderer/framework/bridge/ipc-client';
import { useFileStore } from '../../src/renderer/plugins/file-explorer/store';
import {
  initAutoSave,
  initializeWorkspaces,
  restoreState,
  useSpaceStore,
} from '../../src/renderer/plugins/file-explorer/space-store';
import { useLayoutStore } from '../../src/renderer/framework/store/layout-store';
import { fixtureFile } from '../helpers/file-entry';

vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({
  ipc: { invoke: vi.fn() },
  IpcClientError: class extends Error {},
  getIpcErrorMessage: (error: Error) => error.message,
}));

function space(id: string, path: string | null): Space {
  const panel = () => ({
    tabs: path ? [{ path, initialPath: path, label: id, pinned: false }] : [],
    activeTabId: null,
    path,
  });
  return { id, name: id, left: panel(), right: panel() };
}

describe('workspace persistence', () => {
  beforeEach(() => {
    vi.mocked(ipc.invoke).mockReset().mockResolvedValue(undefined);
    useFileStore.setState(useFileStore.getInitialState());
    useLayoutStore.setState(useLayoutStore.getInitialState());
    useSpaceStore.setState({ ...useSpaceStore.getInitialState(), loaded: true });
  });

  afterEach(() => vi.useRealTimers());

  it('clears file and layout state when restoring an empty panel', async () => {
    vi.mocked(ipc.invoke).mockResolvedValueOnce([fixtureFile('old.txt')]);
    await useFileStore.getState().navigateTo('right', 'D:/old');
    useLayoutStore.getState().setPanelPath('right', 'D:/old');
    await restoreState('right', space('empty', null).right);
    expect(useFileStore.getState().right).toMatchObject({
      path: null,
      entries: [],
      tabs: [],
      loading: false,
    });
    expect(useLayoutStore.getState().layout.right.path).toBeNull();
  });

  it('restores the correct active tab when multiple tabs share a path', async () => {
    const snapshot = space('duplicate', 'D:/same').left;
    snapshot.tabs.push({ ...snapshot.tabs[0], label: 'second' });
    snapshot.activeTabPath = 'D:/same';
    snapshot.activeTabIndex = 0;
    vi.mocked(ipc.invoke).mockResolvedValueOnce([]);
    await restoreState('left', snapshot);
    const panel = useFileStore.getState().left;
    expect(panel.activeTabId).toBe(panel.tabs[0].id);
  });

  it('does not let a slow earlier switch replace either side of a newer workspace', async () => {
    const pending: Array<() => void> = [];
    vi.mocked(ipc.invoke).mockImplementation(((channel: string, payload: any) => {
      if (channel === 'file:readDir') {
        if (payload.path === 'D:/slow')
          return new Promise((resolve) => pending.push(() => resolve([{ name: 'slow.txt' }])));
        return Promise.resolve([{ name: 'fast.txt' }]);
      }
      return Promise.resolve();
    }) as any);
    useSpaceStore.setState({
      spaces: [space('a', null), space('b', 'D:/slow'), space('c', 'D:/fast')],
      activeSpaceId: 'a',
    });
    const older = useSpaceStore.getState().switchSpace('b');
    await useSpaceStore.getState().switchSpace('c');
    for (const resolve of pending) resolve();
    await older;
    expect(useSpaceStore.getState().activeSpaceId).toBe('c');
    for (const side of ['left', 'right'] as const) {
      expect(useFileStore.getState()[side]).toMatchObject({
        path: 'D:/fast',
        entries: [{ name: 'fast.txt' }],
      });
      expect(useLayoutStore.getState().layout[side].path).toBe('D:/fast');
    }
    expect(useSpaceStore.getState().spaces.find((item) => item.id === 'b')?.right.path).toBe('D:/slow');
  });

  it('preserves workspaces and blocks saves after a failed load', async () => {
    const original = space('original', 'D:/saved');
    useSpaceStore.setState({ spaces: [original], activeSpaceId: original.id });
    vi.mocked(ipc.invoke).mockRejectedValueOnce(new Error('unreadable config'));
    await useSpaceStore.getState().loadSpaces();
    await expect(useSpaceStore.getState().saveCurrentSpace()).resolves.toBe(false);
    expect(useSpaceStore.getState().spaces).toEqual([original]);
    expect(useSpaceStore.getState().loadError).toContain('unreadable config');
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
  });

  it('persists the selected workspace even when closing before its directories finish loading', async () => {
    const pending: Array<() => void> = [];
    vi.mocked(ipc.invoke).mockImplementation(((channel: string) => {
      if (channel === 'file:readDir') return new Promise((resolve) => pending.push(() => resolve([])));
      return Promise.resolve();
    }) as any);
    useSpaceStore.setState({ spaces: [space('a', null), space('b', 'D:/slow')], activeSpaceId: 'a' });
    const switching = useSpaceStore.getState().switchSpace('b');
    await useSpaceStore.getState().saveCurrentSpace();
    const payload = vi.mocked(ipc.invoke).mock.calls.find(([channel]) => channel === 'space:save')?.[1] as {
      spaces: Space[];
    };
    expect(payload.spaces[1].lastOpenedAt).toBeGreaterThan(payload.spaces[0].lastOpenedAt ?? 0);
    expect(payload.spaces[1].left.path).toBe('D:/slow');
    for (const finish of pending) finish();
    await switching;
  });

  it('keeps save failures visible and clears them after a successful retry', async () => {
    useSpaceStore.setState({ spaces: [space('saved', null)], activeSpaceId: 'saved' });
    vi.mocked(ipc.invoke).mockRejectedValueOnce(new Error('disk full')).mockResolvedValueOnce(undefined);
    await expect(useSpaceStore.getState().persistSpaces()).resolves.toBe(false);
    expect(useSpaceStore.getState().saveError).toBe('disk full');
    await expect(useSpaceStore.getState().persistSpaces()).resolves.toBe(true);
    expect(useSpaceStore.getState().saveError).toBeNull();
  });

  it('serializes saves so a delayed older snapshot cannot overwrite a newer name', async () => {
    let finish!: () => void;
    vi.mocked(ipc.invoke).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    useSpaceStore.setState({ spaces: [space('saved', null)], activeSpaceId: 'saved' });
    const first = useSpaceStore.getState().persistSpaces();
    await Promise.resolve();
    useSpaceStore.getState().renameSpace('saved', 'new name');
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
    finish();
    await first;
    await useSpaceStore.getState().persistSpaces();
    expect(vi.mocked(ipc.invoke).mock.calls.at(-1)?.[1]).toMatchObject({ spaces: [{ name: 'new name' }] });
  });

  it('does not save selection changes, and releases its subscription on cleanup', async () => {
    vi.useFakeTimers();
    useSpaceStore.setState({ spaces: [space('saved', null)], activeSpaceId: 'saved' });
    const dispose = initAutoSave();
    useFileStore.getState().selectSingle('left', 'D:/file');
    await vi.advanceTimersByTimeAsync(600);
    expect(ipc.invoke).not.toHaveBeenCalled();
    dispose();
    useFileStore.getState().addTab('left', 'D:/folder');
    await vi.advanceTimersByTimeAsync(600);
    expect(ipc.invoke).not.toHaveBeenCalled();
  });

  it('restores an explicitly empty saved workspace without opening a home directory', async () => {
    vi.mocked(ipc.invoke).mockResolvedValueOnce([space('empty', null)]);
    await initializeWorkspaces();
    expect(useSpaceStore.getState().loaded).toBe(true);
    expect(useFileStore.getState().left.path).toBeNull();
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
  });
});
