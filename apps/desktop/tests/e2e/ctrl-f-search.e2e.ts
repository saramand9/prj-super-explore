import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test.describe('Ctrl+F file search', () => {
  let fixtureRoot: string;
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    fixtureRoot = join(tmpdir(), `explore-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await createFixture(fixtureRoot);

    electronApp = await electron.launch({
      args: [appRoot],
      cwd: appRoot,
      env: {
        ...process.env,
        HOME: fixtureRoot,
        USERPROFILE: fixtureRoot,
        APPDATA: join(fixtureRoot, 'AppData', 'Roaming'),
        LOCALAPPDATA: join(fixtureRoot, 'AppData', 'Local'),
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      },
    });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await navigateLeftPanelToFixture(page, fixtureRoot);
  });

  test.afterEach(async () => {
    await electronApp?.close();
    await rm(fixtureRoot, { recursive: true, force: true });
  });

  test('opens search, finds Chinese and space paths, and excludes node_modules', async () => {
    await expect(page.getByText('中文 文件.txt', { exact: true })).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Control+F');
    const searchInput = page.locator('input[placeholder*="搜索文件"]').first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill('中文');
    await expect(page.getByText('中文 文件.txt', { exact: true }).last()).toBeVisible();

    await searchInput.fill('target');
    await expect(page.getByText('target file.txt', { exact: true })).toBeVisible();
    await expect(page.getByText('space dir', { exact: true })).toBeVisible();

    await searchInput.fill('deep-target');
    await expect(page.getByText('deep-target.txt', { exact: true })).toBeVisible();

    await searchInput.fill('excluded');
    await expect(page.getByText('未找到文件')).toBeVisible();
    await expect(page.getByText('excluded.txt', { exact: true })).toHaveCount(0);
  });
});

async function navigateLeftPanelToFixture(page: Page, targetPath: string): Promise<void> {
  await page.locator('[title="Click to edit path"]').first().click();
  const pathInput = page.locator('input[spellcheck="false"]').first();
  await expect(pathInput).toBeVisible();
  await pathInput.fill(targetPath);
  await pathInput.press('Enter');
}

async function createFixture(root: string): Promise<void> {
  await mkdir(join(root, 'AppData', 'Roaming'), { recursive: true });
  await mkdir(join(root, 'AppData', 'Local'), { recursive: true });
  await mkdir(join(root, 'space dir'), { recursive: true });
  await mkdir(join(root, 'node_modules', 'pkg'), { recursive: true });
  await mkdir(join(root, 'empty dir'), { recursive: true });
  await mkdir(join(root, 'many files'), { recursive: true });
  await mkdir(join(root, 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6'), { recursive: true });

  await writeFile(join(root, '中文 文件.txt'), 'hello 中文', 'utf8');
  await writeFile(join(root, 'space dir', 'target file.txt'), 'target', 'utf8');
  await writeFile(join(root, 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'deep-target.txt'), 'deep', 'utf8');
  await writeFile(join(root, 'node_modules', 'pkg', 'excluded.txt'), 'excluded', 'utf8');

  for (let i = 0; i < 60; i++) {
    await writeFile(join(root, 'many files', `entry-${String(i).padStart(2, '0')}.txt`), `entry ${i}`, 'utf8');
  }
}
