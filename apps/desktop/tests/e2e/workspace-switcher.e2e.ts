import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { launchTestApp, closeTestApp, removeTestFixture } from '../helpers/electron-app';
import type { Space } from '@explore/shared';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

test.describe('workspace switcher at scale', () => {
  let fixtureRoot: string;
  let userDataPath: string;
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    fixtureRoot = join(tmpdir(), `explore-workspaces-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await createFixture(fixtureRoot);

    ({ electronApp, page } = await launchApp(fixtureRoot));
    await expect(page.getByTestId('workspace-menu-trigger')).toBeVisible({ timeout: 15000 });
    userDataPath = await electronApp.evaluate(({ app }) => app.getPath('userData'));
    await closeTestApp(electronApp);

    await mkdir(join(userDataPath, 'config'), { recursive: true });
    await writeFile(
      join(userDataPath, 'config', 'spaces.json'),
      JSON.stringify(createWorkspaces(fixtureRoot), null, 2),
      'utf8',
    );
    ({ electronApp, page } = await launchApp(fixtureRoot));
    await expect(page.getByTestId('workspace-menu-trigger')).toContainText('主工作区', { timeout: 15000 });
  });

  test.afterEach(async () => {
    if (electronApp) await closeTestApp(electronApp);
    await removeTestFixture(fixtureRoot);
  });

  test('identifies, searches, pins, switches, and persists forty workspaces', async () => {
    const trigger = page.getByTestId('workspace-menu-trigger');
    await trigger.click();

    const dropdown = page.getByTestId('workspace-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.getByTestId('workspace-dropdown-item')).toHaveCount(40);
    await expect(dropdown.getByTestId('workspace-preview')).toBeVisible();
    await expect(dropdown.getByTestId('workspace-section-current').getByTestId('workspace-dropdown-item')).toHaveCount(1);
    await expect(dropdown.getByTestId('workspace-section-pinned').getByTestId('workspace-dropdown-item')).toHaveCount(3);
    await expect(dropdown.getByTestId('workspace-section-recent').getByTestId('workspace-dropdown-item')).toHaveCount(5);
    await expect(dropdown.getByTestId('workspace-section-other').getByTestId('workspace-dropdown-item')).toHaveCount(31);

    const rowHeights = await dropdown.getByTestId('workspace-dropdown-item').evaluateAll((rows) =>
      rows.slice(0, 12).map((row) => row.getBoundingClientRect().height),
    );
    expect(rowHeights).toHaveLength(12);
    expect(rowHeights[0]).toBeGreaterThanOrEqual(48);
    expect(rowHeights).toEqual(new Array(12).fill(rowHeights[0]));

    const archiveRow = dropdown
      .getByTestId('workspace-dropdown-item')
      .filter({ hasText: 'Archive' });
    await archiveRow.hover();
    await expect(dropdown.getByTestId('workspace-preview')).toContainText('Archive');

    const dropdownSearch = dropdown.getByTestId('workspace-dropdown-search');
    await dropdownSearch.fill('archive');
    await expect(dropdown.getByTestId('workspace-dropdown-item')).toHaveCount(1);
    await dropdown.getByTestId('workspace-pin-toggle').click();
    await expect(dropdownSearch).toHaveValue('archive');
    await expect(dropdown.getByTestId('workspace-pin-toggle')).toHaveAttribute('title', '取消固定');

    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+Shift+w');

    const modal = page.getByTestId('workspace-search');
    await expect(modal).toBeVisible();
    await expect(modal.getByTestId('workspace-search-result')).toHaveCount(40);
    await expect(modal.getByTestId('workspace-preview')).toBeVisible();

    const modalSearch = modal.getByTestId('workspace-search-input');
    await modalSearch.fill('khzl');
    await expect(modal.getByTestId('workspace-search-result')).toHaveCount(1);
    await expect(modal.getByTestId('workspace-preview')).toContainText('客户资料');

    await modalSearch.fill('customer-ledger');
    await expect(modal.getByTestId('workspace-search-result')).toHaveCount(1);
    await expect(modal.getByTestId('workspace-preview')).toContainText('customer-ledger');
    await modalSearch.press('Enter');

    await expect(modal).toBeHidden();
    await expect(trigger).toContainText('客户资料', { timeout: 15000 });

    await page.keyboard.press('Control+Shift+w');
    const currentModal = page.getByTestId('workspace-search');
    await expect(currentModal.getByTestId('workspace-section-current')).toContainText('客户资料');
    await currentModal.getByTitle('删除工作区').click();
    await expect(page.getByText(/这不会删除磁盘上的文件/)).toBeVisible();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await expect(trigger).toContainText('主工作区', { timeout: 15000 });
    await expect(currentModal.getByTestId('workspace-search-result')).toHaveCount(39);
    await page.keyboard.press('Escape');

    await closeTestApp(electronApp);
    ({ electronApp, page } = await launchApp(fixtureRoot));
    await expect(page.getByTestId('workspace-menu-trigger')).toContainText('主工作区', { timeout: 15000 });
    await page.getByTestId('workspace-menu-trigger').click();
    const reopened = page.getByTestId('workspace-dropdown');
    await expect(reopened.getByTestId('workspace-section-pinned')).toContainText('Archive');
  });
});

async function launchApp(root: string): Promise<{ electronApp: ElectronApplication; page: Page }> {
  const electronApp = await launchTestApp(root);
  const page = await electronApp.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { electronApp, page };
}

function createWorkspaces(root: string): Space[] {
  const names = ['主工作区', '客户资料', '发布版本', 'Archive'];
  while (names.length < 40) names.push(`Project ${names.length - 3}`);

  return names.map((name, index) => {
    const identity = index === 1 ? 'customer-ledger' : `workspace-${String(index + 1).padStart(2, '0')}`;
    const leftPath = root;
    const identityPath = join(root, 'saved', identity);
    const rightPath = index % 2 === 0 ? null : join(root, 'child-dir');
    const pinned = [1, 2, 7].includes(index);
    const hasRecentTimestamp = index >= 3 && index <= 12;

    return {
      id: `workspace-${String(index).padStart(2, '0')}`,
      name,
      pinned,
      lastOpenedAt: index === 0 ? 10_000 : hasRecentTimestamp ? 9_000 - index : undefined,
      left: {
        tabs: [
          { path: leftPath, label: 'root', initialPath: leftPath, pinned: false },
          { path: identityPath, label: identity, initialPath: identityPath, pinned: false },
        ],
        activeTabId: null,
        activeTabPath: leftPath,
        path: leftPath,
      },
      right: {
        tabs: rightPath
          ? [{ path: rightPath, label: 'child-dir', initialPath: rightPath, pinned: false }]
          : [],
        activeTabId: null,
        activeTabPath: rightPath,
        path: rightPath,
      },
    };
  });
}

async function createFixture(root: string): Promise<void> {
  await mkdir(join(root, 'AppData', 'Roaming'), { recursive: true });
  await mkdir(join(root, 'AppData', 'Local'), { recursive: true });
  await mkdir(join(root, 'child-dir'), { recursive: true });
  await writeFile(join(root, 'root.txt'), 'root', 'utf8');
  await writeFile(join(root, 'child-dir', 'inside.txt'), 'inside', 'utf8');
}
