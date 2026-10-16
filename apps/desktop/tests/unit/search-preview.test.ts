import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipc } from '../../src/renderer/framework/bridge/ipc-client';
import { pluginManager } from '../../src/renderer/framework/plugin-system';
import { useLayoutStore } from '../../src/renderer/framework/store/layout-store';
import { useSearchStore } from '../../src/renderer/plugins/fulltext-search/store';
import { previewSearchResult } from '../../src/renderer/plugins/fulltext-search/utils/preview-search-result';
import { useViewerStore } from '../../src/renderer/plugins/viewer/store';

vi.mock('../../src/renderer/framework/bridge/ipc-client', () => ({
  ipc: { invoke: vi.fn(), on: vi.fn(() => () => {}) },
  getIpcErrorMessage: (error: Error) => error.message,
}));

vi.mock('../../src/renderer/framework/plugin-system', () => ({
  pluginManager: { getFileHandlerForExtension: vi.fn() },
}));

const match = {
  filePath: 'D:/project/Makefile',
  fileName: 'Makefile',
  lineNumber: 9,
  lineContent: 'build: app',
  matchText: 'build',
  columnStart: 1,
  columnEnd: 6,
};

describe('search result preview', () => {
  beforeEach(() => {
    vi.mocked(ipc.invoke).mockReset().mockResolvedValue(undefined);
    vi.mocked(pluginManager.getFileHandlerForExtension).mockReset().mockReturnValue(null);
    useLayoutStore.setState(useLayoutStore.getInitialState());
    useViewerStore.setState(useViewerStore.getInitialState());
    useSearchStore.setState(useSearchStore.getInitialState());
  });

  it.each(['left', 'right'] as const)(
    'keeps the %s search panel and previews opposite it regardless of the active panel',
    async (side) => {
      const target = side === 'left' ? 'right' : 'left';
      useLayoutStore.getState().setPanelPlugin(side, 'fulltext-search', 'search');
      useLayoutStore.getState().setPanelPath(side, 'D:/project');
      useLayoutStore.getState().setActivePanel(target);
      useSearchStore.setState({ results: [match], query: 'build', error: '部分目录读取失败' });

      await useSearchStore.getState().openFile(match, side);

      expect(useLayoutStore.getState().layout[side]).toMatchObject({
        pluginId: 'fulltext-search',
        path: 'D:/project',
      });
      expect(useLayoutStore.getState().layout[target]).toMatchObject({
        pluginId: 'viewer',
        panelId: 'text-viewer',
        path: match.filePath,
      });
      expect(useViewerStore.getState()[target].searchHighlight).toEqual({
        filePath: match.filePath,
        lineNumber: 9,
        columnStart: 1,
        columnEnd: 6,
        text: 'build',
      });
      expect(useSearchStore.getState()).toMatchObject({ results: [match], error: '部分目录读取失败' });
      expect(ipc.invoke).not.toHaveBeenCalledWith('file:open', expect.anything());
    },
  );

  it('makes the opposite preview visible when starting from a single panel', async () => {
    useLayoutStore.setState((state) => ({ layout: { ...state.layout, mode: 'single' } }));
    await previewSearchResult('left', match.filePath, { lineNumber: 9, text: 'build' });
    expect(useLayoutStore.getState().layout.mode).toBe('dual');
    expect(useLayoutStore.getState().layout.right.path).toBe(match.filePath);
  });

  it('keeps filename-only fallback failures visible to the caller', async () => {
    vi.mocked(ipc.invoke).mockRejectedValueOnce(new Error('无法找到默认打开程序'));
    await expect(previewSearchResult('left', 'D:/project/picture.png')).rejects.toThrow(
      '无法找到默认打开程序',
    );
    expect(useLayoutStore.getState().layout.right.pluginId).toBe('file-explorer');
  });

  it('clears an old content highlight when previewing a filename-only result', async () => {
    vi.mocked(pluginManager.getFileHandlerForExtension).mockReturnValue({
      pluginId: 'viewer',
      panelId: 'text-viewer',
    });
    useViewerStore
      .getState()
      .setSearchHighlight('right', { filePath: 'D:/project/readme.md', lineNumber: 2, text: 'old' });
    await previewSearchResult('left', 'D:/project/readme.md');
    expect(useLayoutStore.getState().layout.right.path).toBe('D:/project/readme.md');
    expect(useViewerStore.getState().right.searchHighlight).toBeNull();
    expect(ipc.invoke).not.toHaveBeenCalledWith('file:open', expect.anything());
  });
});
