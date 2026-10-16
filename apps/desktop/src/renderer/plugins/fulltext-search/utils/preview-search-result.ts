import { ipc } from '../../../framework/bridge/ipc-client';
import { pluginManager } from '../../../framework/plugin-system';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { useViewerStore, type SearchHighlight } from '../../viewer/store';

export type SearchSide = 'left' | 'right';
export type SearchResultHighlight = Omit<SearchHighlight, 'filePath'>;

/** Content matches are text, including files without a registered extension. */
export async function previewSearchResult(
  sourceSide: SearchSide,
  filePath: string,
  highlight?: SearchResultHighlight,
): Promise<void> {
  const targetSide = sourceSide === 'left' ? 'right' : 'left';
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;
  const dot = fileName.lastIndexOf('.');
  const handler = highlight
    ? { pluginId: 'viewer', panelId: 'text-viewer' }
    : pluginManager.getFileHandlerForExtension(dot < 0 ? '' : fileName.slice(dot).toLowerCase());

  if (!handler) {
    await ipc.invoke('file:open', { path: filePath });
    return;
  }

  const layout = useLayoutStore.getState();
  if (layout.layout.mode === 'single') layout.setMode('dual');
  useViewerStore.getState().setSearchHighlight(
    targetSide,
    highlight ? { filePath, ...highlight } : null,
  );
  layout.setPanelPath(targetSide, filePath);
  layout.setPanelPlugin(targetSide, handler.pluginId, handler.panelId);
}
