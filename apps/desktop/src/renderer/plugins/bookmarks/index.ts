import type { PluginModule } from '@explore/shared';
import { BookmarkPanel } from './components/bookmark-panel';

const manifest = {
  id: 'bookmarks',
  name: 'Bookmarks',
  version: '0.0.0',
  description: 'Quick access to favorite directories',
  main: 'index.js',
  engines: { explore: '>=0.0.0' },
  contributes: {
    panels: [
      {
        id: 'list',
        title: 'Bookmarks',
        icon: '⭐',
        defaultSize: { minWidth: 180, minHeight: 200 },
      },
    ],
    commands: [
      { id: 'bookmarks.add', title: 'Add Bookmark', category: 'Bookmarks' },
      { id: 'bookmarks.openPanel', title: 'Show Bookmarks', category: 'Bookmarks' },
    ],
    keybindings: [{ command: 'bookmarks.openPanel', key: 'Ctrl+B' }],
  },
};

export function createPlugin(): PluginModule {
  return {
    manifest,
    components: { list: BookmarkPanel },
    async activate(_ctx) {
      console.log('[bookmarks] activated');
    },
    async deactivate() {
      console.log('[bookmarks] deactivated');
    },
  };
}
