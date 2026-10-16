import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeTestApp, launchTestApp, removeTestFixture } from '../helpers/electron-app';

test.describe('Electron security boundary', () => {
  let root: string, application: ElectronApplication, page: Page;
  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explore-security-'));
    application = await launchTestApp(root);
    page = await application.firstWindow();
    await expect(page.getByTestId('workspace-menu-trigger')).toBeVisible();
  });
  test.afterEach(async () => {
    if (application) await closeTestApp(application);
    await removeTestFixture(root);
  });
  test('uses isolated sandboxed renderers and fixed bridge capabilities', async () => {
    expect(await page.evaluate(() => window.explore.runtime)).toEqual({
      sandboxed: true,
      contextIsolated: true,
    });
    expect(
      await page.evaluate(() => ({
        node: typeof (window as unknown as { require?: unknown }).require,
        arbitraryInvoke: 'invoke' in window.explore,
        version: typeof window.explore.requests['app:getVersion'],
      })),
    ).toEqual({ node: 'undefined', arbitraryInvoke: false, version: 'function' });
    const version = await application.evaluate(({ app }) => app.getVersion());
    await expect(page.evaluate(() => window.explore.requests['app:getVersion'](undefined))).resolves.toBe(
      version,
    );
  });
  test('rejects malformed destructive requests without changing files', async () => {
    const marker = join(root, 'keep.txt');
    await writeFile(marker, 'keep');
    const rejected = await page.evaluate(async (file) => {
      try {
        // Deliberately cross the JS boundary with a payload that violates the TS contract.
        await (window.explore.requests['file:delete'] as (payload: unknown) => Promise<unknown>)({
          paths: [file],
          permanent: 'true',
        });
        return '';
      } catch (error) {
        return String(error);
      }
    }, marker);
    expect(decodeError(rejected).code).toBe('INVALID_REQUEST');
    expect(await readFile(marker, 'utf8')).toBe('keep');
  });
  test('rejects a different WebContents even when it has the preload bridge', async () => {
    const preloadPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../out/preload/index.cjs');
    const denied = await application.evaluate(async ({ BrowserWindow }, preload) => {
      const untrusted = new BrowserWindow({
        show: false,
        webPreferences: { preload, sandbox: true, contextIsolation: true, nodeIntegration: false },
      });
      try {
        await untrusted.loadURL('data:text/html,<h1>Untrusted test page</h1>');
        return await untrusted.webContents.executeJavaScript(
          `window.explore.requests['app:getHomeDir']().then(() => '', error => String(error))`,
        );
      } finally {
        untrusted.destroy();
      }
    }, preloadPath);
    expect(decodeError(denied).code).toBe('PERMISSION_DENIED');
  });
  test('blocks inline script injection, new windows and remote navigation', async () => {
    const before = page.url();
    expect(
      await page.evaluate(() => {
        const marker = document.createElement('script');
        marker.textContent = 'window.__unsafeInlineExecuted = true';
        document.body.append(marker);
        return (window as unknown as { __unsafeInlineExecuted?: boolean }).__unsafeInlineExecuted === true;
      }),
    ).toBe(false);
    expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true);
    expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    await application.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      contents.once('will-frame-navigate', (event) =>
        Reflect.set(contents, '__testNavigationPrevented', event.defaultPrevented),
      );
    });
    await page.evaluate(() => {
      window.location.assign('https://example.com');
    });
    await expect
      .poll(() =>
        application.evaluate(({ BrowserWindow }) =>
          Reflect.get(BrowserWindow.getAllWindows()[0].webContents, '__testNavigationPrevented'),
        ),
      )
      .toBe(true);
    expect(page.url()).toBe(before);
  });
});

function decodeError(message: string): { code: string } {
  const encoded = message.split('__EXPLORE_IPC_ERROR__b64:')[1];
  expect(encoded).toBeTruthy();
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
}
