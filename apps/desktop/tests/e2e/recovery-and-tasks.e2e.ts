import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { once } from 'events';
import { createFixture } from '../helpers/fixture';
import { launchTestApp, removeTestFixture } from '../helpers/electron-app';

test.describe('task progress and recovery', () => {
  let root: string;
  let application: ElectronApplication;
  let child: ChildProcess;
  let page: Page;

  const launch = async () => {
    application = await launchTestApp(root);
    child = application.process();
    page = await application.firstWindow();
    await expect(page.getByTestId('workspace-menu-trigger')).toBeVisible();
  };
  test.beforeEach(async () => { root = await createFixture('recovery'); });
  test.afterEach(async () => {
    if (child && child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await exited;
    }
    await removeTestFixture(root);
  });

  test('searches the first scan batch, stops, and can scan again', async () => {
    await launch();
    // Hold the IPC response to model a slow drive without depending on disk speed.
    await application.evaluate(({ ipcMain }) => {
      let pending: { scanId: string; resolve: (value: unknown) => void } | undefined;
      const summary = { scanned: 1, directories: 1, skipped: 0, cancelled: false, truncated: false, warnings: [] };
      ipcMain.removeHandler('file:scan');
      ipcMain.handle('file:scan', (event, { path, scanId }) => new Promise((resolve) => {
        pending = { scanId, resolve };
        event.sender.send('file:scanProgress', { ...summary, scanId, entries: [{
          path: `${path}/streamed-fixture.txt`, name: 'streamed-fixture.txt', isDirectory: false, isSymlink: false, size: 0, modifiedAt: 0,
        }] });
      }));
      ipcMain.removeHandler('file:cancelScan');
      ipcMain.handle('file:cancelScan', (_event, { scanId }) => {
        if (pending?.scanId === scanId) { pending.resolve({ ...summary, cancelled: true }); pending = undefined; }
      });
    });
    await page.keyboard.press('Control+f');
    const input = page.getByRole('textbox', { name: '搜索文件和文件夹', exact: true });
    await input.fill('streamed');
    await expect(page.getByText('streamed-fixture.txt', { exact: true })).toBeVisible();
    await expect(page.getByText('正在扫描，已索引 1 项', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '停止扫描', exact: true }).click();
    await expect(page.getByText('已停止扫描，保留已索引内容', { exact: true })).toBeVisible();
    await expect(page.getByText('streamed-fixture.txt', { exact: true })).toBeVisible();
    await input.fill('missing');
    await expect(page.getByText('streamed-fixture.txt', { exact: true })).toHaveCount(0);
    await input.fill('streamed');
    await expect(page.getByText('streamed-fixture.txt', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '重新扫描', exact: true }).click();
    await expect(page.getByText('正在扫描，已索引 1 项', { exact: true })).toBeVisible();
    await expect(page.getByText('streamed-fixture.txt', { exact: true })).toBeVisible();
  });

  test('keeps full-text matches when a Windows file is locked', async () => {
    await writeFile(join(root, 'readable.txt'), 'recovery-search-needle');
    await launch();
    // Chromium locks files inside the isolated .profile; ripgrep reports these alongside valid matches.
    await page.getByTitle('Full-text Search', { exact: true }).click();
    const input = page.getByPlaceholder('搜索文件内容（普通文本）...');
    await input.fill('recovery-search-needle');
    await input.press('Enter');
    await expect(page.getByText('recovery-search-needle', { exact: true })).toBeVisible();
    await expect(page.getByTestId('task-warnings')).toBeVisible();
    await page.getByTestId('task-warnings').locator('summary').click();
    await expect(page.getByTestId('task-warnings')).toContainText('.profile');
  });

  test('recovers a failed plugin panel and copies its diagnostics', async () => {
    const pluginDir = join(root, '.profile/plugins/recovery-fixture');
    await mkdir(pluginDir, { recursive: true });
    const manifest = {
      id: 'recovery-fixture', name: 'Recovery fixture', version: '1.0.0', main: 'main.js', engines: { explore: '*' },
      contributes: { panels: [{ id: 'panel', title: 'Recovery fixture', icon: 'folder' }] },
    };
    await writeFile(join(pluginDir, 'manifest.json'), JSON.stringify(manifest));
    await writeFile(join(pluginDir, 'main.js'), `
      export function createPlugin() {
        return { manifest: ${JSON.stringify(manifest)}, activate() {}, components: { panel() {
          if (!window.__recoveryReady) throw new Error('recovery-fixture-crash');
          return window.__EXPLORE__.React.createElement('div', null, 'Recovered fixture');
        } } };
      }
    `);
    await launch();
    await page.getByTitle('Recovery fixture', { exact: true }).click();
    const boundary = page.getByTestId('panel-error');
    await expect(boundary).toBeVisible();
    await boundary.getByRole('button', { name: '复制诊断信息', exact: true }).click();
    await expect(boundary).toContainText('已复制诊断信息');
    expect(await application.evaluate(({ clipboard }) => clipboard.readText())).toContain('recovery-fixture-crash');
    expect(await readFile(join(root, '.profile/logs/app.log'), 'utf8')).toContain('recovery-fixture-crash');
    await page.evaluate(() => { (window as any).__recoveryReady = true; });
    await boundary.getByRole('button', { name: '重新加载', exact: true }).click();
    await expect(page.getByText('Recovered fixture', { exact: true })).toBeVisible();
    await expect(boundary).toHaveCount(0);
  });

  test('stays open after a close timeout and ignores a late save completion', async () => {
    await launch();
    await expect.poll(() => readFile(join(root, '.profile/config/spaces.json'), 'utf8').catch(() => '')).toContain('Default');
    await application.evaluate(({ ipcMain, dialog }) => {
      ipcMain.removeHandler('space:save');
      ipcMain.handle('space:save', () => new Promise((resolve) => { (globalThis as any).__finishSave = resolve; }));
      dialog.showMessageBox = (async (_window: unknown, options: unknown) => {
        (globalThis as any).__timeoutOptions = options;
        return { response: 0, checkboxChecked: false };
      }) as typeof dialog.showMessageBox;
    });
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect.poll(() => application.evaluate(() => (globalThis as any).__timeoutOptions?.title), { timeout: 12_000 }).toBe('保存仍未完成');
    await application.evaluate(() => { (globalThis as any).__finishSave(); });
    // A round trip through the renderer and main process confirms it remains usable after the late reply.
    await page.getByTitle('主题', { exact: true }).selectOption('linear');
    await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    expect(await readFile(join(root, '.profile/logs/app.log'), 'utf8')).toContain('close-timeout');
  });

  test('a second process restores the existing window and exits', async () => {
    await launch();
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize());
    const executable = await application.evaluate(() => process.execPath);
    const env: NodeJS.ProcessEnv = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
    delete env.ELECTRON_RUN_AS_NODE;
    const second = spawn(executable, [join(root, '.launch-explore.mjs')], {
      cwd: process.cwd(), windowsHide: true, stdio: 'ignore',
      env,
    });
    try {
      const [code] = await once(second, 'exit');
      expect(code).toBe(0);
      await expect.poll(() => application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(false);
      await expect(page.getByTestId('workspace-menu-trigger')).toBeVisible();
    } finally { if (second.exitCode === null) second.kill(); }
  });
});
