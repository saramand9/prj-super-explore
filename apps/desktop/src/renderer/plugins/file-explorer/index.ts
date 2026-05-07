import type { PluginModule } from '@explore/shared';

const manifest = {
  id: 'file-explorer',
  name: 'File Explorer',
  version: '0.0.0',
  description: 'Dual-pane file browser with quick filter',
  main: 'index.js',
  engines: { explore: '>=0.0.0' },
  contributes: {
    panels: [
      {
        id: 'browser',
        title: 'File Browser',
        icon: 'folder',
        defaultSize: { minWidth: 200, minHeight: 300 },
      },
    ],
    commands: [
      { id: 'file-explorer.openFolder', title: 'Open Folder', category: 'File' },
      { id: 'file-explorer.goUp', title: 'Go to Parent Directory', category: 'File' },
      { id: 'file-explorer.refresh', title: 'Refresh', category: 'File' },
      { id: 'file-explorer.newFolder', title: 'New Folder', category: 'File' },
      { id: 'file-explorer.toggleHidden', title: 'Toggle Hidden Files', category: 'View' },
    ],
    keybindings: [
      { command: 'file-explorer.goUp', key: 'Backspace' },
      { command: 'file-explorer.refresh', key: 'Ctrl+R' },
      { command: 'file-explorer.newFolder', key: 'F7' },
      { command: 'file-explorer.toggleHidden', key: 'Ctrl+H' },
    ],
  },
};

/** File Explorer 插件入口 */
export function createPlugin(): PluginModule {
  return {
    manifest,

    async activate(_ctx) {
      // PluginContext 已注入，文件操作通过 ctx.fs 完成
      console.log('[file-explorer] activated');
    },

    async deactivate() {
      console.log('[file-explorer] deactivated');
    },
  };
}

export { FileList } from './components/file-list';
export { AddressBar } from './components/address-bar';
export { TabBar } from './components/tab-bar';
export { useFileStore, useFilteredEntries } from './store';
