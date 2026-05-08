import type { PluginModule } from '@explore/shared';
import { TextViewer } from './components/text-viewer';

const manifest = {
  id: 'viewer',
  name: 'File Viewer',
  version: '0.0.0',
  description: 'Built-in text file viewer',
  main: 'index.js',
  engines: { explore: '>=0.0.0' },
  contributes: {
    panels: [
      {
        id: 'text-viewer',
        title: 'Text Viewer',
        icon: '📄',
      },
    ],
    commands: [
      { id: 'viewer.open', title: 'Open with Viewer', category: 'View' },
    ],
    fileHandlers: [
      {
        extensions: [
          '.txt', '.md', '.log', '.csv', '.json', '.xml', '.yaml', '.yml',
          '.toml', '.ini', '.cfg', '.conf', '.env', '.gitignore',
          '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java',
          '.html', '.css', '.scss', '.less',
        ],
        name: 'Text Viewer',
        handler: 'text',
      },
    ],
    keybindings: [
      { command: 'viewer.open', key: 'Ctrl+Shift+V' },
    ],
  },
};

export function createPlugin(): PluginModule {
  return {
    manifest,
    components: { 'text-viewer': TextViewer },
    async activate(_ctx) {
      console.log('[viewer] activated');
    },
    async deactivate() {
      console.log('[viewer] deactivated');
    },
  };
}
