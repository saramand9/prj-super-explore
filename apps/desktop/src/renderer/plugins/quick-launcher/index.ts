import type { PluginModule } from '@explore/shared';

const manifest = {
  id: 'quick-launcher',
  name: 'Quick Launcher',
  version: '0.0.0',
  description: 'Global file and program launcher (Alt+Space)',
  main: 'index.js',
  engines: { explore: '>=0.0.0' },
  contributes: {
    commands: [
      { id: 'quick-launcher.toggle', title: 'Toggle Launcher', category: 'Window' },
      { id: 'quick-launcher.search', title: 'Quick Search', category: 'Search' },
    ],
    keybindings: [{ command: 'quick-launcher.toggle', key: 'Alt+Space' }],
  },
};

export function createPlugin(): PluginModule {
  return {
    manifest,

    async activate(_ctx) {
      console.log('[quick-launcher] activated');
    },

    async deactivate() {
      console.log('[quick-launcher] deactivated');
    },
  };
}

export { Launcher } from './components/launcher';
export { useLauncherStore } from './store';
