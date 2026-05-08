import { pluginManager } from '../framework/plugin-system';
import { ipc } from '../framework/bridge/ipc-client';
import { createPlugin as createFileExplorer } from './file-explorer';
import { createPlugin as createSearch } from './fulltext-search';
import { createPlugin as createBookmarks } from './bookmarks';
import { createPlugin as createQuickLauncher } from './quick-launcher';
import { createPlugin as createViewer } from './viewer';

export async function bootstrapPlugins(): Promise<void> {
  console.log('[bootstrap] Starting...');

  // 1. 内置插件
  pluginManager.registerPlugin(createFileExplorer());
  pluginManager.registerPlugin(createSearch());
  pluginManager.registerPlugin(createBookmarks());
  pluginManager.registerPlugin(createQuickLauncher());
  pluginManager.registerPlugin(createViewer());
  console.log('[bootstrap] Built-in plugins registered');

  // 2. 扫描外部插件
  try {
    const externals = await ipc.invoke('plugin:scanExternal', undefined);
    console.log('[bootstrap] External plugins found:', externals);
    for (const ext of externals) {
      try {
        const jsContent = await ipc.invoke('plugin:readFile', {
          pluginId: ext.pluginId,
          file: 'main.js',
        });
        const blob = new Blob([jsContent], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const mod = await import(/* @vite-ignore */ url);
        URL.revokeObjectURL(url);
        if (typeof mod.createPlugin === 'function') {
          pluginManager.registerPlugin(mod.createPlugin());
        } else {
          console.warn(`[bootstrap] Plugin "${ext.pluginId}" missing createPlugin export`);
        }
      } catch (err) {
        console.error(`[bootstrap] Failed to load plugin "${ext.pluginId}":`, err);
      }
    }
  } catch (err) {
    console.warn('[bootstrap] Failed to scan external plugins:', err);
  }

  // 3. 激活全部
  for (const reg of pluginManager.getPlugins()) {
    try {
      await pluginManager.activatePlugin(reg.manifest.id);
    } catch (err) {
      console.error(`[bootstrap] Failed to activate "${reg.manifest.id}":`, err);
    }
  }
}
