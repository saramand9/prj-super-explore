import { app, BrowserWindow, dialog } from 'electron';
import { cp, mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, relative } from 'node:path';
import type { IpcRegistrar } from './ipc-registrar';
import { validatePluginId } from './request-validation';

function assertInside(root: string, target: string): void {
  const rel = relative(root, target);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..\\') || rel.startsWith('../')) {
    throw Object.assign(new Error('Plugin path escapes its directory'), { code: 'PERMISSION_DENIED' });
  }
}

export function registerPluginHandlers(ipc: IpcRegistrar): void {
  const pluginsDir = join(app.getPath('userData'), 'plugins');
  ipc.handle('plugin:scanExternal', async () => {
    await mkdir(pluginsDir, { recursive: true });
    const result: { pluginId: string; pluginPath: string }[] = [];
    for (const entry of await readdir(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      try {
        validatePluginId(entry.name);
        const pluginPath = join(pluginsDir, entry.name);
        const manifestPath = await realpath(join(pluginPath, 'manifest.json'));
        assertInside(await realpath(pluginPath), manifestPath);
        const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
        if (manifest.id && manifest.id !== entry.name) continue;
        result.push({ pluginId: entry.name, pluginPath });
      } catch {
        /* Ignore malformed or out-of-directory third-party plugins. */
      }
    }
    return result;
  });
  ipc.handle('plugin:readFile', async (_event, payload) => {
    const root = await realpath(pluginsDir);
    const plugin = await realpath(join(root, payload.pluginId));
    assertInside(root, plugin);
    const file = await realpath(join(plugin, payload.file));
    assertInside(plugin, file);
    return readFile(file, 'utf8');
  });
  ipc.handle('plugin:install', async (event, payload) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner) throw new Error('Plugin installation requires an application window');
    const choice = await dialog.showMessageBox(owner, {
      type: 'warning',
      title: '安装受信任插件',
      message: '插件能够通过应用访问本机文件，请仅安装你信任的代码。',
      detail: `来源：${payload.sourcePath}\n同名插件可能被覆盖。`,
      buttons: ['取消', '信任并安装'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (choice.response !== 1) return { success: false, error: 'Plugin installation cancelled' };
    await mkdir(pluginsDir, { recursive: true });
    const source = await realpath(payload.sourcePath);
    const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
    const pluginId = manifest.id || basename(source);
    validatePluginId(pluginId);
    const root = await realpath(pluginsDir);
    const target = join(root, pluginId);
    assertInside(root, target);
    // Refuse an existing junction/symlink and recursive source/destination copies.
    const existing = await realpath(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return target;
      throw error;
    });
    if (existing !== target) throw new Error('Plugin destination must not be a symbolic link');
    const nested = relative(source, target);
    if (!nested || (!nested.startsWith('..') && !isAbsolute(nested)))
      throw new Error('Plugin destination is inside its source');
    await cp(source, target, { recursive: true, dereference: false });
    return { success: true, pluginId };
  });
}
