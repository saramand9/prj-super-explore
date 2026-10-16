import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipc } from '../../src/renderer/framework/bridge/ipc-client';
import { useLayoutStore } from '../../src/renderer/framework/store/layout-store';
import { useFileStore } from '../../src/renderer/plugins/file-explorer/store';
import { closeExplorerTab } from '../../src/renderer/plugins/file-explorer/utils/tab-actions';

vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({
  ipc: { invoke: vi.fn() },
  IpcClientError: class extends Error {},
  getIpcErrorMessage: (error: Error) => error.message,
}));

describe('shared tab closing', () => {
  beforeEach(() => {
    vi.mocked(ipc.invoke).mockReset().mockResolvedValue([]);
    useFileStore.setState(useFileStore.getInitialState());
    useLayoutStore.setState(useLayoutStore.getInitialState());
  });

  async function open(path: string) {
    const store = useFileStore.getState();
    store.addTab('left', path);
    await store.navigateTo('left', path);
    useLayoutStore.getState().setPanelPath('left', path);
    return useFileStore.getState().left.activeTabId!;
  }

  it('clears the last directory and selection when the final tab closes', async () => {
    const tab = await open('D:/documents');
    useFileStore.getState().selectSingle('left', 'D:/documents/test.txt');
    await closeExplorerTab('left', tab);
    expect(useFileStore.getState().left).toMatchObject({ path: null, tabs: [], entries: [], activeTabId: null });
    expect(useFileStore.getState().left.selected.size).toBe(0);
    expect(useLayoutStore.getState().layout.left.path).toBeNull();
  });

  it('navigates to the remaining active tab without adding closed directories to history', async () => {
    const first = await open('D:/first');
    const second = await open('D:/second');
    await closeExplorerTab('left', second);
    expect(useFileStore.getState().left).toMatchObject({ path: 'D:/first', activeTabId: first });
    expect(useLayoutStore.getState().layout.left.path).toBe('D:/first');
  });

  it('leaves a pinned tab untouched if its confirmation is cancelled', async () => {
    const tab = await open('D:/pinned');
    useFileStore.getState().pinTab('left', tab);
    vi.mocked(ipc.invoke).mockResolvedValueOnce(false);
    await closeExplorerTab('left', tab);
    expect(useFileStore.getState().left.tabs).toHaveLength(1);
    expect(useFileStore.getState().left.tabs[0].pinned).toBe(true);
  });

  it('closes a pinned tab after confirmation', async () => {
    const tab = await open('D:/pinned');
    useFileStore.getState().pinTab('left', tab);
    vi.mocked(ipc.invoke).mockResolvedValueOnce(true);
    await closeExplorerTab('left', tab);
    expect(useFileStore.getState().left.tabs).toHaveLength(0);
  });

  it('keeps the preview path when closing its underlying directory tab', async () => {
    const tab = await open('D:/documents');
    useLayoutStore.getState().setPanelPlugin('left', 'viewer', 'preview');
    useLayoutStore.getState().setPanelPath('left', 'D:/documents/test.txt');
    await closeExplorerTab('left', tab);
    expect(useLayoutStore.getState().layout.left.path).toBe('D:/documents/test.txt');
  });
});
