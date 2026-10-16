import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { launchTestApp, closeTestApp, removeTestFixture } from '../helpers/electron-app';

test.describe('product usability', () => {
  let root: string;
  let application: ElectronApplication;
  let page: Page;
  let source: string;
  let target: string;

  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explore-product-ux-'));
    source = join(root, '项目文件');
    target = join(root, '发布目录');
    await mkdir(source);
    await mkdir(target);
    await writeFile(join(source, 'README.md'), '# 产品体验优化\n\n保留目录和搜索结果，在另一栏预览文件。\n');
    await writeFile(join(source, 'package.json'), '{"name":"product-ux-fixture"}');
    await writeFile(join(source, 'copy-check.txt'), 'file transfer fixture');
    await writeFile(join(source, 'search-check.txt'), 'first line\nproduct-ux-needle\nlast line');
    for (const modifier of ['default', 'ctrl', 'shift']) {
      await writeFile(join(source, `drag-${modifier}.txt`), modifier);
    }
    application = await launchTestApp(root);
    page = await application.firstWindow();
    await navigate('left', source);
    await expect(page.locator('[data-panel-side="left"] .file-table-name').filter({ hasText: 'README.md' })).toBeVisible();
  });

  test.afterEach(async () => {
    if (application) await closeTestApp(application);
    if (root) await removeTestFixture(root);
  });

  async function navigate(side: 'left' | 'right', path: string) {
    if (await page.getByTestId(`edit-path-${side}`).count() === 0) {
      await application.evaluate(({ ipcMain }, folder) => {
        ipcMain.removeHandler('dialog:openFolder');
        ipcMain.handle('dialog:openFolder', () => folder);
      }, path);
      await page.locator(`[data-panel-side="${side}"]`).getByTitle('打开文件夹 (Ctrl+O)', { exact: true }).click();
      await expect(page.getByTestId(`edit-path-${side}`)).toBeVisible();
      return;
    }
    await page.getByTestId(`edit-path-${side}`).click();
    const input = page.locator('[data-panel-side="' + side + '"] input[spellcheck="false"]');
    await input.fill(path);
    await input.press('Enter');
  }

  test('keeps file names readable at default size and scales columns for narrow panels', async ({}, testInfo) => {
    const left = page.locator('[data-panel-side="left"]');
    for (const name of ['README.md', 'package.json']) {
      const cell = left.locator('.file-table-name').filter({ hasText: name });
      await expect(cell).toBeVisible();
      expect(await cell.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await expect(left.locator('.file-table-type').first()).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath('default-dual-pane.png') });
    await page.getByTitle('切换为单栏', { exact: true }).click();
    await expect(left.locator('.file-table-type').first()).toBeVisible();
    await page.getByTitle('切换为双栏', { exact: true }).click();
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(left.locator('.file-table-date').first()).toBeHidden();
    await expect(left.locator('.file-table-name').filter({ hasText: 'package.json' })).toBeVisible();
  });

  test('uses standard new/close tab keys and reserves workspace switching for Ctrl+Shift+W', async ({}, testInfo) => {
    const left = page.locator('[data-panel-side="left"]');
    const closeButtons = left.getByTitle('关闭标签 (Ctrl+W)', { exact: true });
    const originalCount = await closeButtons.count();
    await page.keyboard.press('Control+t');
    await expect(closeButtons).toHaveCount(originalCount + 1);
    await expect(page.getByPlaceholder('搜索标签页...')).toBeHidden();
    await page.keyboard.press('Control+p');
    await expect(page.getByPlaceholder('搜索标签页...')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByPlaceholder('搜索标签页...')).toBeHidden();
    await page.keyboard.press('Control+w');
    await expect(closeButtons).toHaveCount(originalCount);
    await expect(page.getByTestId('workspace-search')).toBeHidden();
    await page.keyboard.press('Control+Shift+w');
    await expect(page.getByTestId('workspace-search')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('workspace-switcher.png') });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('workspace-search')).toBeHidden();
    for (let i = 0; i < originalCount; i++) {
      await page.keyboard.press('Control+w');
      await expect(closeButtons).toHaveCount(originalCount - i - 1);
    }
    await expect(left.locator('.file-table-name')).toHaveCount(0);
    await expect(left.getByText('打开工作文件夹', { exact: true })).toBeVisible();
  });

  test('previews full-text results on the opposite side and keeps the result list', async ({}, testInfo) => {
    await page.keyboard.press('Control+Shift+f');
    const left = page.locator('[data-panel-side="left"]');
    const input = left.getByRole('textbox', { name: '全文搜索内容', exact: true });
    await input.fill('product-ux-needle');
    await input.press('Enter');
    const match = left.locator('[data-result-index]').filter({ hasText: 'product-ux-needle' });
    await expect(match).toBeVisible();
    await match.click();
    await expect(match).toBeVisible();
    const right = page.locator('[data-panel-side="right"]');
    await expect(right.getByTitle('关闭预览', { exact: true })).toBeVisible();
    await expect(right.getByText('product-ux-needle', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('search-and-preview.png') });
    await right.getByTitle('关闭预览', { exact: true }).click();
    await left.getByTitle('关闭面板', { exact: true }).click();
    await navigate('right', source);
    await page.keyboard.press('Control+Shift+f');
    const rightInput = right.getByRole('textbox', { name: '全文搜索内容', exact: true });
    await rightInput.fill('product-ux-needle');
    await rightInput.press('Enter');
    await right.locator('[data-result-index]').filter({ hasText: 'product-ux-needle' }).click();
    await expect(rightInput).toBeVisible();
    await expect(left.getByTitle('关闭预览', { exact: true })).toBeVisible();
  });

  test('copies to the opposite directory while it is showing a file preview', async () => {
    await navigate('right', target);
    const left = page.locator('[data-panel-side="left"]');
    await left.locator('.file-table-name').filter({ hasText: 'README.md' }).dblclick();
    await expect(page.locator('[data-panel-side="right"] .markdown-body')).toBeVisible();
    await left.locator('.file-table-name').filter({ hasText: 'copy-check.txt' }).click();
    await page.keyboard.press('F5');
    await expect.poll(async () => readFile(join(target, 'copy-check.txt'), 'utf8').catch(() => '')).toBe('file transfer fixture');
    expect(await readFile(join(source, 'copy-check.txt'), 'utf8')).toBe('file transfer fixture');
  });

  test('drag modifiers and destinations agree while the target pane previews another folder', async () => {
    await expect(page.locator('[data-panel-side="left"] .file-table-name').filter({ hasText: 'drag-default.txt' })).toBeVisible();
    await navigate('right', target);
    await page.locator('[data-panel-side="left"] .file-table-name').filter({ hasText: 'README.md' }).dblclick();
    await expect(page.locator('[data-panel-side="right"] .markdown-body')).toBeVisible();
    for (const modifier of ['default', 'ctrl', 'shift']) {
      const file = join(source, `drag-${modifier}.txt`);
      const destination = join(target, `drag-${modifier}.txt`);
      const content = page.getByTestId('panel-content-right');
      const row = page.locator('[data-panel-side="left"] .file-table-row').filter({ hasText: `drag-${modifier}.txt` });
      if (modifier === 'ctrl') await page.keyboard.down('Control');
      try {
        if (modifier === 'shift') {
          // Chromium may interpret Shift held before mousedown as text selection;
          // start the drag first, then change its intent before entering the target.
          const from = await row.boundingBox();
          const to = await content.boundingBox();
          expect(from).not.toBeNull();
          expect(to).not.toBeNull();
          await page.mouse.move(from!.x + 12, from!.y + 15);
          await page.mouse.down();
          await page.mouse.move(from!.x + 30, from!.y + 15, { steps: 3 });
          await page.keyboard.down('Shift');
          await page.mouse.move(to!.x + 180, to!.y + 250, { steps: 5 });
          await page.mouse.move(to!.x + 181, to!.y + 250);
          await page.mouse.up();
        } else {
          await row.dragTo(content, { sourcePosition: { x: 12, y: 15 }, targetPosition: { x: 180, y: 250 } });
        }
      } finally {
        await page.mouse.up();
        await page.keyboard.up('Control');
        await page.keyboard.up('Shift');
      }
      await expect.poll(() => readFile(destination, 'utf8').catch(() => '')).toBe(modifier);
      await expect.poll(() => stat(file).then(() => true, () => false)).toBe(modifier !== 'shift');
    }
  });

  test('searches the displayed preview folder rather than the previous browsing folder', async () => {
    await navigate('right', target);
    const left = page.locator('[data-panel-side="left"]');
    const right = page.locator('[data-panel-side="right"]');
    await left.locator('.file-table-name').filter({ hasText: 'README.md' }).dblclick();
    await right.locator('.markdown-body').click();
    await page.keyboard.press('Control+Shift+f');
    const input = right.getByRole('textbox', { name: '全文搜索内容', exact: true });
    await input.fill('product-ux-needle');
    await input.press('Enter');
    await expect(right.locator('[data-result-index]').filter({ hasText: 'product-ux-needle' })).toBeVisible();
    await right.getByTitle('关闭面板', { exact: true }).click();
    await left.locator('.file-table-name').filter({ hasText: 'README.md' }).dblclick();
    await right.locator('.markdown-body').click();
    await page.keyboard.press('Control+f');
    const quickSearch = right.getByRole('textbox', { name: '搜索文件和文件夹', exact: true });
    await quickSearch.fill('package.json');
    await expect(right.getByText('package.json', { exact: true }).last()).toBeVisible();
  });

  test('keyboard sorting does not open files or type into the file filter', async () => {
    const left = page.locator('[data-panel-side="left"]');
    const sortButton = left.getByTitle('按名称降序排序', { exact: true });
    await sortButton.focus();
    await page.keyboard.press('Enter');
    await expect(left.getByTitle('按名称升序排序', { exact: true })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(left.getByTitle('按名称降序排序', { exact: true })).toBeVisible();
    await expect(left.locator('.file-table-row .file-table-name')).toHaveCount(7);
    await expect(page.getByTitle('关闭预览', { exact: true })).toHaveCount(0);
  });
});
