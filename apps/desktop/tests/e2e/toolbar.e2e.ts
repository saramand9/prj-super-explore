import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launchTestApp, closeTestApp, removeTestFixture } from '../helpers/electron-app';

test.describe('application command bar', () => {
  let root: string, application: ElectronApplication, page: Page;
  test.beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explore-toolbar-'));
    const source = join(root, 'Sample project');
    const target = join(root, 'Release');
    await mkdir(source);
    await mkdir(target);
    await writeFile(join(source, 'Roadmap.md'), '# Example roadmap');
    await mkdir(join(root, '.profile/config'), { recursive: true });
    await writeFile(
      join(root, '.profile/config/config.json'),
      JSON.stringify({ indexPaths: [], theme: 'linear' }),
    );
    await writeFile(
      join(root, '.profile/config/spaces.json'),
      JSON.stringify([
        {
          id: 'sample',
          name: '产品设计',
          left: { path: source, tabs: [{ path: source, label: 'Sample project' }], activeTabId: null },
          right: { path: target, tabs: [{ path: target, label: 'Release' }], activeTabId: null },
        },
      ]),
    );
    application = await launchTestApp(root);
    page = await application.firstWindow();
    await expect(page.getByTestId('workspace-menu-trigger')).toBeVisible();
  });
  test.afterEach(async () => {
    if (application) await closeTestApp(application);
    if (root) await removeTestFixture(root);
  });

  test('supports keyboard menus, checked views, Escape and outside dismissal', async () => {
    const menus = page.getByRole('menubar', { name: '主菜单' });
    await menus.getByRole('menuitem', { name: '文件', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: '打开文件夹', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(menus.getByRole('menuitem', { name: '编辑', exact: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await page.keyboard.press('Escape');
    await expect(menus.getByRole('menuitem', { name: '编辑', exact: true })).toBeFocused();
    await menus.getByRole('menuitem', { name: '查看', exact: true }).click();
    const hidden = page.getByRole('menuitemcheckbox', { name: '显示隐藏文件', exact: true });
    await expect(hidden).toHaveAttribute('aria-checked', 'false');
    await hidden.click();
    await menus.getByRole('menuitem', { name: '查看', exact: true }).click();
    await expect(page.getByRole('menuitemcheckbox', { name: '显示隐藏文件', exact: true })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByTestId('global-toolbar').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('menu', { name: '查看' })).toBeHidden();
  });

  test('keeps transfer actions and safe folder creation working', async () => {
    const toolbar = page.getByTestId('global-toolbar');
    await expect(toolbar.getByRole('button', { name: '复制到右侧', exact: true })).toBeDisabled();
    await page.locator('[data-panel-side="left"] .file-table-name').filter({ hasText: 'Roadmap.md' }).click();
    await toolbar.getByRole('button', { name: '复制到右侧', exact: true }).click();
    await expect
      .poll(() => readFile(join(root, 'Release/Roadmap.md'), 'utf8').catch(() => ''))
      .toBe('# Example roadmap');
    await toolbar.getByRole('button', { name: '新建文件夹', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新建文件夹', exact: true });
    await dialog.getByRole('textbox', { name: '文件夹名称' }).fill('Design assets');
    await page.keyboard.press('Enter');
    await expect(
      page.locator('[data-panel-side="left"] .file-table-name').filter({ hasText: 'Design assets' }),
    ).toBeVisible();
  });

  test('aligns controls at narrow widths and presents readable grouped menus', async ({}, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const header = page.getByTestId('application-chrome');
    await page.locator('[data-panel-side="left"] .file-table-name').filter({ hasText: 'Roadmap.md' }).click();
    await header.screenshot({ path: info.outputPath('toolbar_overview.png') });
    await page.getByRole('menubar').getByRole('menuitem', { name: '文件', exact: true }).click();
    await expect(page.getByRole('menu', { name: '文件' })).toBeVisible();
    await page.getByRole('menu', { name: '文件' }).screenshot({ path: info.outputPath('toolbar_menu.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('menubar').getByRole('menuitem', { name: '编辑', exact: true }).click();
    await page
      .getByRole('menu', { name: '编辑' })
      .screenshot({ path: info.outputPath('toolbar_edit_menu.png') });
    await page.keyboard.press('Escape');
    for (const width of [900, 800]) {
      await page.setViewportSize({ width, height: 700 });
      expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(
        page.getByTestId('global-toolbar').getByRole('button', { name: '复制到右侧', exact: true }),
      ).toBeVisible();
    }
    await page.getByTitle('字号', { exact: true }).selectOption('200');
    expect(await header.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  });
});
