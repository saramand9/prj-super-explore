import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  invoke: vi.fn(),
  report: vi.fn(),
  spaces: { loaded: true, restoring: false, saveCurrentSpace: vi.fn() },
  preferences: { preferencesLoaded: true, savePreferences: vi.fn() },
}));
vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({ ipc: { invoke: fixtures.invoke } }));
vi.mock('../../src/renderer/framework/diagnostics', () => ({ reportError: fixtures.report }));
vi.mock('../../src/renderer/plugins/file-explorer/space-store', () => ({
  useSpaceStore: { getState: () => fixtures.spaces },
}));
vi.mock('../../src/renderer/framework/store/layout-store', () => ({
  useLayoutStore: { getState: () => fixtures.preferences },
}));
import { saveBeforeUpdate } from '../../src/renderer/components/update-persistence';

beforeEach(() => {
  vi.clearAllMocks();
  fixtures.spaces.loaded = true;
  fixtures.spaces.restoring = false;
  fixtures.preferences.preferencesLoaded = true;
  fixtures.spaces.saveCurrentSpace.mockResolvedValue(true);
  fixtures.preferences.savePreferences.mockResolvedValue(true);
  fixtures.invoke.mockResolvedValue(undefined);
});

describe('renderer persistence before update', () => {
  it('saves both workspace and preferences before authorizing installation', async () => {
    await saveBeforeUpdate(7);
    expect(fixtures.spaces.saveCurrentSpace).toHaveBeenCalledTimes(1);
    expect(fixtures.preferences.savePreferences).toHaveBeenCalledTimes(1);
    expect(fixtures.invoke).toHaveBeenCalledWith('update:resolveSave', { requestId: 7, allow: true });
  });
  it('rejects a failed preference save without offering a discard action', async () => {
    fixtures.preferences.savePreferences.mockResolvedValue(false);
    await saveBeforeUpdate(7);
    expect(fixtures.invoke).toHaveBeenCalledWith('update:resolveSave', { requestId: 7, allow: false });
  });
  it('rejects unloaded or restoring workspaces without overwriting persisted state', async () => {
    fixtures.spaces.loaded = false;
    await saveBeforeUpdate(7);
    fixtures.spaces.loaded = true;
    fixtures.spaces.restoring = true;
    await saveBeforeUpdate(8);
    expect(fixtures.spaces.saveCurrentSpace).not.toHaveBeenCalled();
    expect(fixtures.invoke).toHaveBeenLastCalledWith('update:resolveSave', { requestId: 8, allow: false });
  });
  it('reports a thrown save error and acknowledges cancellation instead of hanging', async () => {
    fixtures.spaces.saveCurrentSpace.mockRejectedValue(new Error('Synthetic write failure'));
    await saveBeforeUpdate(7);
    expect(fixtures.report).toHaveBeenCalled();
    expect(fixtures.invoke).toHaveBeenCalledWith('update:resolveSave', { requestId: 7, allow: false });
  });
});
