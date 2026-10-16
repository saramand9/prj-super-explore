import { ipc } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { useFileStore } from '../store';

/** Shared by the tab bar, menu, and keyboard so closing a tab has one behavior. */
export async function closeExplorerTab(side: 'left' | 'right', tabId: string): Promise<void> {
  const tab = useFileStore.getState()[side].tabs.find((item) => item.id === tabId);
  if (!tab) return;
  if (tab.pinned) {
    const confirmed = await ipc.invoke('dialog:confirm', {
      message: `确定要关闭固定标签“${tab.label}”吗？\n\n该标签会先取消固定，然后关闭。`,
    });
    if (!confirmed) return;
  }

  const store = useFileStore.getState();
  if (!store[side].tabs.some((item) => item.id === tabId)) return;
  const wasActive = store[side].activeTabId === tabId;
  store.closeTab(side, tabId);
  store.persistPinnedTabs(side);
  const remaining = useFileStore.getState()[side];
  const isExplorer = useLayoutStore.getState().layout[side].pluginId === 'file-explorer';
  if (remaining.tabs.length === 0) {
    store.resetPanel(side);
    if (isExplorer) useLayoutStore.getState().setPanelPath(side, null);
  } else if (wasActive) {
    const next = remaining.tabs.find((item) => item.id === remaining.activeTabId);
    if (next) {
      if (isExplorer) useLayoutStore.getState().setPanelPath(side, next.path);
      await store.navigateTo(side, next.path, false);
    }
  }
}
