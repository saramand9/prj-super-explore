import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipc } from '../../src/renderer/framework/bridge/ipc-client';
import { useSearchStore } from '../../src/renderer/plugins/fulltext-search/store';

const listeners = vi.hoisted(() => new Set<(value: any) => void>());
const result = (matches: any[]) => ({ matches, warnings: [], cancelled: false, truncated: false });

vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({
  ipc: { invoke: vi.fn(), on: vi.fn((_channel, callback) => { listeners.add(callback); return () => listeners.delete(callback); }) },
  getIpcErrorMessage: (error: Error) => error.message,
}));

describe('fulltext search state', () => {
  beforeEach(() => {
    vi.mocked(ipc.invoke).mockReset().mockResolvedValue(undefined);
    listeners.clear();
    useSearchStore.setState({ ...useSearchStore.getInitialState(), query: 'old', searchDir: 'D:/repo' });
  });

  it('ignores an older result after changing the query and searching again', async () => {
    let finish!: (value: any) => void;
    vi.mocked(ipc.invoke).mockImplementationOnce(() => new Promise<any>((resolve) => { finish = resolve; }));
    const older = useSearchStore.getState().search();
    useSearchStore.getState().setQuery('new');
    vi.mocked(ipc.invoke).mockResolvedValueOnce(result([{ fileName: 'new.txt' }]));
    await useSearchStore.getState().search();
    finish(result([{ fileName: 'old.txt' }]));
    await older;
    expect(useSearchStore.getState().results).toEqual([{ fileName: 'new.txt' }]);
  });

  it('cancels pending work and prevents a cleared search from repopulating', async () => {
    let finish!: (value: any) => void;
    vi.mocked(ipc.invoke).mockImplementationOnce(() => new Promise<any>((resolve) => { finish = resolve; }));
    const pending = useSearchStore.getState().search();
    useSearchStore.getState().clearResults();
    finish(result([{ fileName: 'late.txt' }]));
    await pending;
    expect(useSearchStore.getState()).toMatchObject({ results: [], query: '', searching: false });
    expect(ipc.invoke).toHaveBeenCalledWith('search:cancel', { searchId: expect.stringContaining('fulltext-panel:') });
  });

  it('streams only the current request and keeps its partial results when stopped', async () => {
    let finish!: (value: any) => void;
    vi.mocked(ipc.invoke).mockImplementationOnce(() => new Promise<any>((resolve) => { finish = resolve; }));
    const pending = useSearchStore.getState().search();
    const request = vi.mocked(ipc.invoke).mock.calls.find(([channel]) => channel === 'search:run')![1] as any;
    const emit = (searchId: string) => listeners.forEach((listener) => listener({ searchId, total: 1, matches: [{ fileName: 'partial.txt' }] }));
    emit('obsolete');
    expect(useSearchStore.getState().results).toEqual([]);
    emit(request.searchId);
    useSearchStore.getState().cancelSearch();
    emit(request.searchId);
    finish(result([]));
    await pending;
    expect(useSearchStore.getState()).toMatchObject({ results: [{ fileName: 'partial.txt' }], searching: false, cancelled: true });
    expect(listeners.size).toBe(0);
  });
});
