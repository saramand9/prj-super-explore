import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchTestApp, removeTestFixture } from '../helpers/electron-app';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test.describe('real NSIS updater transport and application UI', () => {
  let root: string, application: ElectronApplication, page: Page, server: Server;
  let corrupt = false;
  let downloads = 0;

  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explore-update-'));
    corrupt = false;
    downloads = 0;
    // Synthetic bytes are never executed. Only quitAndInstall is replaced; actual check,
    // download, cache and SHA-512 verification run through electron-updater/Electron HTTP.
    const payload = Buffer.alloc(2 * 1024 * 1024, 65);
    const sha512 = createHash('sha512').update(payload).digest('base64');
    const metadata = {
      version: '1.0.3',
      path: 'fixture.exe',
      sha512,
      files: [{ url: 'fixture.exe', sha512, size: payload.length }],
      releaseDate: '2026-10-17T00:00:00.000Z',
    };
    server = createServer((request, response) => {
      if (request.url?.startsWith('/latest.yml')) {
        response.end(JSON.stringify(metadata));
      } else if (request.url?.startsWith('/fixture.exe')) {
        downloads++;
        response.setHeader('Content-Length', payload.length);
        response.end(corrupt ? Buffer.alloc(payload.length, 66) : payload);
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No loopback server port');
    const config = join(root, 'app-update.yml');
    await writeFile(config, JSON.stringify({ updaterCacheDirName: 'cache' }));
    application = await launchTestApp(root, [
      `import { createRequire } from 'node:module';`,
      `const require = createRequire(${JSON.stringify(join(appRoot, 'package.json'))});`,
      `app.setVersion('1.0.2');`,
      `Object.defineProperty(app, 'isPackaged', { value: true });`,
      `const updater = require('electron-updater').autoUpdater;`,
      `updater.updateConfigPath = ${JSON.stringify(config)};`,
      `updater.setFeedURL({ provider: 'generic', url: 'http://127.0.0.1:${address.port}/' });`,
      `Object.defineProperty(updater.app, 'baseCachePath', { get: () => ${JSON.stringify(root)} });`,
      `updater.quitAndInstall = (silent, restart) => { globalThis.__updateInstall = { silent, restart }; };`,
    ]);
    page = await application.firstWindow();
    await expect(page.getByTestId('workspace-menu-trigger')).toBeVisible();
    await page.getByRole('button', { name: '帮助', exact: true }).click();
    await page.getByRole('button', { name: '检查更新...', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Explore 更新' })).toBeVisible();
  });

  test.afterEach(async () => {
    if (application) {
      await application.evaluate(({ app }) => app.exit(0));
      await application.close();
    }
    if (server)
      await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
    await removeTestFixture(root);
  });

  test('requires download and install consent and saves preferences before installer handoff', async () => {
    const dialog = page.getByRole('dialog', { name: 'Explore 更新' });
    await dialog.getByRole('button', { name: '检查更新', exact: true }).click();
    await expect(dialog.getByText('发现新版本', { exact: true })).toBeVisible();
    expect(downloads).toBe(0);
    await dialog.getByRole('button', { name: '下载更新', exact: true }).click();
    await expect(dialog.getByText('更新已下载', { exact: true })).toBeVisible();
    expect(downloads).toBe(1);
    expect(await installed()).toBeUndefined();
    await dialog.getByRole('button', { name: '稍后' }).click();
    await page.getByTitle('主题', { exact: true }).selectOption('linear');
    await page.getByTestId('update-badge').click();
    await dialog.getByRole('button', { name: '重启并安装' }).click();
    await expect.poll(installed).toEqual({ silent: false, restart: true });
    const preferences = JSON.parse(await readFile(join(root, '.profile/config/config.json'), 'utf8'));
    expect(preferences.theme).toBe('linear');
    expect(
      JSON.parse(await readFile(join(root, '.profile/config/spaces.json'), 'utf8')).length,
    ).toBeGreaterThan(0);
  });

  test('rejects corrupted bytes and never exposes an install action', async () => {
    corrupt = true;
    const dialog = page.getByRole('dialog', { name: 'Explore 更新' });
    await dialog.getByRole('button', { name: '检查更新', exact: true }).click();
    await dialog.getByRole('button', { name: '下载更新', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('校验失败的安装包不会被执行');
    await expect(dialog.getByRole('button', { name: '重启并安装' })).toHaveCount(0);
    expect(await installed()).toBeUndefined();
  });

  test('keeps the application running when workspace saving fails', async () => {
    const dialog = page.getByRole('dialog', { name: 'Explore 更新' });
    await dialog.getByRole('button', { name: '检查更新', exact: true }).click();
    await dialog.getByRole('button', { name: '下载更新', exact: true }).click();
    await expect(dialog.getByRole('button', { name: '重启并安装' })).toBeVisible();
    await application.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('space:save');
      ipcMain.handle('space:save', () => {
        throw new Error('Synthetic disk write failure');
      });
    });
    await dialog.getByRole('button', { name: '重启并安装' }).click();
    await expect(dialog.getByRole('alert')).toContainText('已取消安装');
    expect(await installed()).toBeUndefined();
    await dialog.getByRole('button', { name: '稍后' }).click();
    const result = await page.evaluate(
      (directory) => window.explore.requests['file:mkdir']({ parentPath: directory, name: 'after-cancel' }),
      root,
    );
    expect(result.success).toBe(true);
  });

  async function installed(): Promise<unknown> {
    return application.evaluate(() => Reflect.get(globalThis, '__updateInstall'));
  }
});
