import { _electron as electron, expect, test } from '@playwright/test';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeTestFixture } from '../helpers/electron-app';

test('packaged IPC works from Windows temporary installation paths', async () => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), 'explore-packaged-path-'));
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const installed = join(root, 'installed');
  const profile = join(root, 'profile');
  await cp(join(appRoot, 'dist-electron/win-unpacked'), installed, { recursive: true });
  await mkdir(join(profile, 'config'), { recursive: true });
  await writeFile(join(profile, 'config/config.json'), JSON.stringify({ indexPaths: [] }));
  const application = await electron.launch({
    executablePath: join(installed, 'Explore.exe'),
    args: [`--user-data-dir=${profile}`],
  });
  try {
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    console.log(
      'Packaged path diagnostics',
      await application.evaluate(({ app, BrowserWindow }) => ({
        appPath: app.getAppPath(),
        urls: BrowserWindow.getAllWindows().map((window) => window.webContents.getURL()),
      })),
    );
    const version = await application.evaluate(({ app }) => app.getVersion());
    expect(await page.evaluate(() => window.explore.requests['app:getVersion'](undefined))).toBe(version);
  } finally {
    await application
      .evaluate(({ app }) => app.exit(0))
      .catch(() => {
        /* Expected transport closure after immediate diagnostic shutdown. */
      });
    await application.close().catch(() => {
      /* App already exited. */
    });
    await removeTestFixture(root);
  }
});
