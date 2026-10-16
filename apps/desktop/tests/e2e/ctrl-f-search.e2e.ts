import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchTestApp, removeTestFixture } from '../helpers/electron-app';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

test.describe('Ctrl+F file search', () => {
  let fixtureRoot: string;
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    fixtureRoot = join(tmpdir(), `explore-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await createFixture(fixtureRoot);

    electronApp = await launchTestApp(fixtureRoot);
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await navigateLeftPanelToFixture(page, fixtureRoot);
  });

  test.afterEach(async () => {
    await electronApp?.close();
    await removeTestFixture(fixtureRoot);
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

  test('sanitizes raw HTML in Markdown preview', async () => {
    await page.evaluate(() => {
      (window as Window & { __exploreMarkdownExecuted?: boolean }).__exploreMarkdownExecuted = false;
    });

    await page.getByText('unsafe-preview.md', { exact: true }).dblclick();
    const preview = page.locator('.markdown-body');
    await expect(preview).toContainText('Safe heading');
    await expect(preview.locator('script, form, [onerror], [onfocus], [autofocus], [formaction], [style]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(
      () => (window as Window & { __exploreMarkdownExecuted?: boolean }).__exploreMarkdownExecuted,
    )).toBe(false);
  });
});

async function navigateLeftPanelToFixture(page: Page, targetPath: string): Promise<void> {
  await page.getByTestId('edit-path-left').click();
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
  await writeFile(
    join(root, 'unsafe-preview.md'),
    [
      '# Safe heading',
      '<img src="missing://image" onerror="window.__exploreMarkdownExecuted = true">',
      '<script>window.__exploreMarkdownExecuted = true</script>',
      '<form><input autofocus onfocus="window.__exploreMarkdownExecuted = true"></form>',
      '<div style="position: fixed; inset: 0">Styled content</div>',
    ].join('\n'),
    'utf8',
  );
  await writeFile(join(root, 'space dir', 'target file.txt'), 'target', 'utf8');
  await writeFile(join(root, 'level-1', 'level-2', 'level-3', 'level-4', 'level-5', 'level-6', 'deep-target.txt'), 'deep', 'utf8');
  await writeFile(join(root, 'node_modules', 'pkg', 'excluded.txt'), 'excluded', 'utf8');

  for (let i = 0; i < 60; i++) {
    await writeFile(join(root, 'many files', `entry-${String(i).padStart(2, '0')}.txt`), `entry ${i}`, 'utf8');
  }
}
