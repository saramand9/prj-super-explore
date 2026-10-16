import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipc } from '../../src/renderer/framework/bridge/ipc-client';
import { useLayoutStore } from '../../src/renderer/framework/store/layout-store';

vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({
  ipc: { invoke: vi.fn() },
  getIpcErrorMessage: (error: Error) => error.message,
}));

describe('appearance persistence', () => {
  beforeEach(() => {
    vi.mocked(ipc.invoke).mockReset().mockResolvedValue(undefined);
    useLayoutStore.setState(useLayoutStore.getInitialState());
  });

  it('loads the saved appearance without writing defaults back', async () => {
    vi.mocked(ipc.invoke).mockResolvedValueOnce({ theme: 'linear', fontScale: 160, layoutMode: 'single' });
    await useLayoutStore.getState().loadPreferences();
    expect(useLayoutStore.getState()).toMatchObject({
      theme: 'linear',
      fontScale: 160,
      layout: { mode: 'single' },
    });
    expect(ipc.invoke).toHaveBeenCalledTimes(1);
  });

  it('keeps the latest combination when settings change rapidly', async () => {
    useLayoutStore.getState().setTheme('linear');
    useLayoutStore.getState().setFontScale(160);
    useLayoutStore.getState().setMode('single');
    await useLayoutStore.getState().savePreferences();
    expect(vi.mocked(ipc.invoke).mock.calls.at(-1)).toEqual([
      'settings:saveAppearance',
      { theme: 'linear', fontScale: 160, layoutMode: 'single' },
    ]);
    expect(useLayoutStore.getState().preferencesDirty).toBe(false);
  });

  it('retains failed changes and reports them until a retry succeeds', async () => {
    vi.mocked(ipc.invoke).mockRejectedValue(new Error('disk full'));
    useLayoutStore.getState().setFontScale(180);
    await expect(useLayoutStore.getState().savePreferences()).resolves.toBe(false);
    expect(useLayoutStore.getState()).toMatchObject({
      fontScale: 180,
      preferencesDirty: true,
      preferenceError: 'disk full',
    });
    vi.mocked(ipc.invoke).mockResolvedValue(undefined);
    await expect(useLayoutStore.getState().savePreferences()).resolves.toBe(true);
    expect(useLayoutStore.getState()).toMatchObject({ preferencesDirty: false, preferenceError: null });
  });
});
