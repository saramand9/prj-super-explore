import type { PluginModule } from '@explore/shared';
import { SearchPanel } from './components/search-panel';

const manifest = {
  id: 'fulltext-search',
  name: 'Full-text Search',
  version: '0.0.0',
  description: 'Search file contents using ripgrep',
  main: 'index.js',
  engines: { explore: '>=0.0.0' },
  contributes: {
    panels: [
      {
        id: 'search',
        title: 'Full-text Search',
        icon: '🔍',
        defaultSize: { minWidth: 250, minHeight: 200 },
      },
    ],
    commands: [{ id: 'fulltext-search.search', title: 'Search in Files', category: 'Search' }],
    keybindings: [{ command: 'fulltext-search.search', key: 'Ctrl+Shift+F' }],
  },
};

export function createPlugin(): PluginModule {
  return {
    manifest,
    components: { search: SearchPanel },
    async activate(_ctx) {
      console.log('[fulltext-search] activated');
    },
    async deactivate() {
      console.log('[fulltext-search] deactivated');
    },
  };
}

export { useSearchStore } from './store';
