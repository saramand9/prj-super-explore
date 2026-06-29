import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test.describe('right button navigation gesture', () => {
  let fixtureRoot: string;
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeEach(async () => {
    fixtureRoot = join(tmpdir(), `explore-gesture-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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

  test('right-button horizontal swipes navigate backward and forward', async () => {
    await expect(page.getByText('child-dir', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByText('child-dir', { exact: true }).dblclick();
    await expect(page.getByText('inside.txt', { exact: true })).toBeVisible();

    await rightButtonSwipe(page, 'left', -90);

    await expect(page.getByText('child-dir', { exact: true })).toBeVisible();
    await expect(page.getByText('inside.txt', { exact: true })).toHaveCount(0);

    await rightButtonSwipe(page, 'left', 90);

    await expect(page.getByText('inside.txt', { exact: true })).toBeVisible();
    await page.getByText('inside.txt', { exact: true }).click({ button: 'right' });
    await expect(page.getByText('打开文件', { exact: true })).toBeVisible();
  });

  test('right-button swipe still works when contextmenu fires before mouseup', async () => {
    await expect(page.getByText('child-dir', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByText('child-dir', { exact: true }).dblclick();
    await expect(page.getByText('inside.txt', { exact: true })).toBeVisible();

    await rightButtonSwipe(page, 'left', -90, { contextMenuBeforeMove: true });

    await expect(page.getByText('child-dir', { exact: true })).toBeVisible();
    await expect(page.getByText('inside.txt', { exact: true })).toHaveCount(0);
  });

  test('plain right click still opens file row context menu', async () => {
    await expect(page.getByText('child-dir', { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByText('child-dir', { exact: true }).click({ button: 'right' });

    await expect(page.getByText('在另一侧打开', { exact: true })).toBeVisible();
  });
  test('selection action bar is delayed and suppressed during double click navigation', async () => {
    await expect(page.getByText('root.txt', { exact: true })).toBeVisible({ timeout: 15000 });

    await page.getByText('root.txt', { exact: true }).click();
    await expect(page.getByText(/项已选中/)).toHaveCount(0);
    await expect(page.getByText('1 项已选中', { exact: true })).toBeVisible({ timeout: 1000 });

    await page.locator('[title="清除选择"]').click();
    await expect(page.getByText(/项已选中/)).toHaveCount(0);

    await page.getByText('child-dir', { exact: true }).dblclick();
    await expect(page.getByText('inside.txt', { exact: true })).toBeVisible();
    await expect(page.getByText(/项已选中/)).toHaveCount(0);
  });
  test('right-button drag renders gesture trail before release', async () => {
    await expect(page.getByText('child-dir', { exact: true })).toBeVisible({ timeout: 15000 });

    const point = await getPanelPoint(page, 'left');
    await page.mouse.move(point.x, point.y);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(point.x - 42, point.y + 2, { steps: 4 });

    await expect(page.getByTestId('mouse-gesture-trail')).toBeVisible();

    await page.mouse.up({ button: 'right' });
  });
  test('mouse back side button navigates back', async () => {
    await enterChildDirectory(page);

    await dispatchMouseButton(page, 'left', 3);

    await expect(page.getByText('child-dir', { exact: true })).toBeVisible();
    await expect(page.getByText('inside.txt', { exact: true })).toHaveCount(0);
  });

  test('horizontal wheel gesture navigates back', async () => {
    await enterChildDirectory(page);

    await wheelOnPanel(page, 'left', -120);

    await expect(page.getByText('child-dir', { exact: true })).toBeVisible();
    await expect(page.getByText('inside.txt', { exact: true })).toHaveCount(0);
  });
});

async function enterChildDirectory(page: Page): Promise<void> {
  await expect(page.getByText('child-dir', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByText('child-dir', { exact: true }).dblclick();
  await expect(page.getByText('inside.txt', { exact: true })).toBeVisible();
}

async function getPanelPoint(page: Page, side: 'left' | 'right'): Promise<{ x: number; y: number }> {
  const panel = page.locator(`[data-panel-side="${side}"]`).first();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return { x: 0, y: 0 };
  return {
    x: box.x + box.width * 0.62,
    y: box.y + box.height * 0.48,
  };
}

async function dispatchMouseButton(page: Page, side: 'left' | 'right', button: number): Promise<void> {
  const point = await getPanelPoint(page, side);
  await page.evaluate(({ x, y, button }) => {
    const target = document.elementFromPoint(x, y) ?? document.body;
    target.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button,
      buttons: 0,
      clientX: x,
      clientY: y,
    }));
  }, { ...point, button });
}

async function wheelOnPanel(page: Page, side: 'left' | 'right', deltaX: number): Promise<void> {
  const point = await getPanelPoint(page, side);
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(deltaX, 0);
}
interface RightButtonSwipeOptions {
  contextMenuBeforeMove?: boolean;
}

async function rightButtonSwipe(
  page: Page,
  side: 'left' | 'right',
  deltaX: number,
  options: RightButtonSwipeOptions = {},
): Promise<void> {
  const panel = page.locator(`[data-panel-side="${side}"]`).first();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;

  const startX = box.x + box.width * 0.62;
  const startY = box.y + box.height * 0.48;
  await page.mouse.move(startX, startY);
  await page.mouse.down({ button: 'right' });
  if (options.contextMenuBeforeMove) {
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y) ?? document.body;
      target.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: x,
        clientY: y,
      }));
    }, { x: startX, y: startY });
  }
  await page.mouse.move(startX + deltaX, startY + 2, { steps: 8 });
  await page.mouse.up({ button: 'right' });
}

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
  await mkdir(join(root, 'child-dir'), { recursive: true });
  await writeFile(join(root, 'root.txt'), 'root', 'utf8');
  await writeFile(join(root, 'child-dir', 'inside.txt'), 'inside', 'utf8');
}
