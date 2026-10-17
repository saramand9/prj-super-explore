import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  invoke: vi.fn(),
  confirm: vi.fn(),
  alert: vi.fn(),
  notify: vi.fn(),
  layout: {
    id: 'left',
    mode: 'dual',
    left: { pluginId: 'file-explorer' },
    right: { pluginId: 'file-explorer' },
  },
  files: {
    left: { path: 'C:\\source', selected: new Set(['C:\\source\\sample.txt']) },
    right: { path: 'C:\\target', selected: new Set<string>() },
    clearSelection: vi.fn(),
    refresh: vi.fn(),
  },
}));
vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({ ipc: { invoke: fixtures.invoke } }));
vi.mock('../../src/renderer/framework/store/layout-store', () => ({
  useLayoutStore: { getState: () => ({ layout: fixtures.layout }) },
}));
vi.mock('../../src/renderer/plugins/file-explorer/store', () => ({
  useFileStore: { getState: () => fixtures.files },
}));
vi.mock('../../src/renderer/framework/dialogs/app-dialog', () => ({
  appDialog: { confirm: fixtures.confirm, alert: fixtures.alert },
}));
vi.mock('../../src/renderer/framework/plugin-system', () => ({ showNotification: fixtures.notify }));
vi.mock('../../src/renderer/framework/diagnostics', () => ({ reportError: vi.fn() }));
import { createFolder, deleteFiles, transferFiles } from '../../src/renderer/components/file-commands';

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.layout.mode = 'dual';
  fixtures.layout.left.pluginId = 'file-explorer';
  fixtures.confirm.mockResolvedValue(true);
  fixtures.invoke.mockResolvedValue({ success: true });
  fixtures.files.refresh.mockResolvedValue(undefined);
});

describe('shared menu and toolbar safety', () => {
  it('requires two confirmations for permanent deletion and honors cancellation', async () => {
    fixtures.confirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await deleteFiles(true);
    expect(fixtures.confirm).toHaveBeenCalledTimes(2);
    expect(fixtures.invoke).not.toHaveBeenCalled();
  });
  it('keeps ordinary deletion recoverable and permanent deletion explicit', async () => {
    await deleteFiles();
    expect(fixtures.confirm).toHaveBeenCalledTimes(1);
    expect(fixtures.invoke).toHaveBeenCalledWith('file:delete', {
      paths: ['C:\\source\\sample.txt'],
      permanent: false,
    });
    await deleteFiles(true);
    expect(fixtures.invoke).toHaveBeenLastCalledWith('file:delete', {
      paths: ['C:\\source\\sample.txt'],
      permanent: true,
    });
  });
  it('does not transfer from a preview or single-pane layout', async () => {
    fixtures.layout.mode = 'single';
    await transferFiles('copy');
    fixtures.layout.mode = 'dual';
    fixtures.layout.left.pluginId = 'viewer';
    await transferFiles('move');
    expect(fixtures.invoke).not.toHaveBeenCalled();
  });
  it('reports folder creation failure without pretending it succeeded', async () => {
    fixtures.invoke.mockResolvedValue({ success: false, error: 'Synthetic permission denial' });
    await expect(createFolder('sample', 'left', 'C:\\source')).rejects.toThrow('Synthetic permission denial');
    expect(fixtures.files.refresh).not.toHaveBeenCalled();
  });
});
