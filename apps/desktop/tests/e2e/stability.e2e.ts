import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, mkdtemp, readFile, rename, rmdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { launchTestApp, closeTestApp, removeTestFixture } from '../helpers/electron-app';

test.describe('data safety and persistence', () => {
  let root: string;
  let application: ElectronApplication | undefined;
  let page: Page;

  const launch = async () => {
    application = await launchTestApp(root);
    page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('workspace-menu-trigger')).toBeVisible();
  };

  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explore-stability-'));
    await mkdir(join(root, 'child-dir'));
    await writeFile(join(root, 'source.txt'), 'source content');
    await writeFile(join(root, 'existing.txt'), 'existing content');
    await writeFile(join(root, 'child-dir', 'inside.txt'), 'inside');
  });

  test.afterEach(async () => {
    // Bypass the save prompt only for teardown, including a failed fault-injection test.
    if (application && application.process().exitCode === null) {
      await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await application.close().catch(() => {});
    }
    application = undefined;
    await removeTestFixture(root);
  });

  test('rejects a rename collision visibly and preserves both files', async () => {
    await launch();
    await page.getByText('source.txt', { exact: true }).click({ button: 'right' });
    await page.getByRole('button', { name: '重命名', exact: true }).click();
    await expect(page.getByText('新名称：', { exact: true })).toBeVisible();
    const input = page.locator('input').filter({ visible: true }).last();
    await input.fill('existing.txt');
    await input.press('Enter');
    await expect(page.getByText('重命名失败：目标名称已存在，请使用其他名称', { exact: true })).toBeVisible();
    expect(await readFile(join(root, 'source.txt'), 'utf8')).toBe('source content');
    expect(await readFile(join(root, 'existing.txt'), 'utf8')).toBe('existing content');
  });

  test('restores appearance and the current directory after an immediate close', async () => {
    await launch();
    await page.getByTitle('主题', { exact: true }).selectOption('linear');
    await page.getByTitle('字号', { exact: true }).selectOption('160');
    await page.getByTitle('切换为单栏', { exact: true }).click();
    await page.getByText('child-dir', { exact: true }).dblclick();
    // Do not wait for the 500 ms autosave debounce: closing must flush the latest state.
    await closeTestApp(application!);
    application = undefined;

    const saved = JSON.parse(await readFile(join(root, '.profile/config/spaces.json'), 'utf8'));
    expect(saved[0].left.path).toBe(join(root, 'child-dir'));
    await launch();
    await expect(page.getByTitle('主题', { exact: true })).toHaveValue('linear');
    await expect(page.getByTitle('字号', { exact: true })).toHaveValue('160');
    await expect(page.getByTitle('切换为双栏', { exact: true })).toBeVisible();
    await expect(page.getByText('inside.txt', { exact: true })).toBeVisible();
  });

  test('preserves unreadable workspaces and restores them after repair and retry', async () => {
    const spacesPath = join(root, '.profile/config/spaces.json');
    await mkdir(join(root, '.profile/config'), { recursive: true });
    await writeFile(spacesPath, '{broken');
    await launch();
    const banner = page.getByTestId('persistence-error');
    await expect(banner).toContainText('自动保存已暂停');
    expect(await readFile(spacesPath, 'utf8')).toBe('{broken');

    await writeFile(
      spacesPath,
      JSON.stringify([
        {
          id: 'repaired',
          name: '恢复的工作区',
          left: { tabs: [{ path: root, label: 'root' }], activeTabId: null, path: root },
          right: { tabs: [], activeTabId: null, path: null },
        },
      ]),
    );
    await banner.getByRole('button', { name: '重试', exact: true }).click();
    await expect(banner).toBeHidden();
    await expect(page.getByTestId('workspace-menu-trigger')).toContainText('恢复的工作区');
    await expect(page.getByText('source.txt', { exact: true })).toBeVisible();
  });

  test('keeps the window open on a failed save and retries after the disk is writable', async () => {
    await launch();
    const spacesPath = join(root, '.profile/config/spaces.json');
    const savedPath = join(root, '.profile/config/spaces.saved.json');
    await expect.poll(async () => readFile(spacesPath, 'utf8').catch(() => '')).toContain('Default');
    // Both paths are under the isolated fixture verified by launchTestApp.
    await rename(spacesPath, savedPath);
    await mkdir(spacesPath);
    await page.getByText('child-dir', { exact: true }).dblclick();
    const banner = page.getByTestId('persistence-error');
    await expect(banner).toContainText('工作空间尚未保存');

    await application!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await expect(page.getByText('有更改尚未保存', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回并重试', exact: true }).click();
    await expect(page.getByText('有更改尚未保存', { exact: true })).toBeHidden();
    expect(page.isClosed()).toBe(false);

    await rmdir(spacesPath);
    await rename(savedPath, spacesPath);
    await banner.getByRole('button', { name: '重试', exact: true }).click();
    await expect(banner).toBeHidden();
    await closeTestApp(application!);
    application = undefined;
    const saved = JSON.parse(await readFile(spacesPath, 'utf8'));
    expect(saved[0].left.path).toBe(join(root, 'child-dir'));
  });
});
