import { _electron as electron, test, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { removeTestFixture } from '../helpers/electron-app';

test('packaged Windows app launches, searches without development tools, and saves on close', async () => {
  const root = await mkdtemp(join(tmpdir(), 'explore-package-'));
  const profile = join(root, '.profile');
  const contentDir = join(root, 'content');
  const configDir = join(profile, 'config');
  await mkdir(configDir, { recursive: true });
  await mkdir(contentDir);
  await writeFile(join(contentDir, 'match.txt'), '中文 literal.* content');
  await writeFile(join(contentDir, '.ignore'), 'ignored.txt\n');
  await writeFile(join(contentDir, 'ignored.txt'), 'literal.* must be ignored');
  await writeFile(join(configDir, 'config.json'), JSON.stringify({ indexPaths: [] }));
  await writeFile(
    join(configDir, 'spaces.json'),
    JSON.stringify([
      {
        id: 'package-smoke',
        name: '安装包验证',
        left: { tabs: [{ path: contentDir, label: 'fixture' }], activeTabId: null, path: contentDir },
        right: { tabs: [], activeTabId: null, path: null },
      },
    ]),
  );

  const env: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  delete env.RG_PATH;
  // Keep Windows system tools available, but exclude Node, pnpm and system-installed ripgrep.
  const windowsDir = env.SystemRoot || 'C:\\Windows';
  for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
  env.PATH = `${join(windowsDir, 'System32')};${windowsDir}`;
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const application = await electron.launch({
    executablePath: join(appRoot, 'dist-electron/win-unpacked/Explore.exe'),
    args: [`--user-data-dir=${profile}`],
    cwd: root,
    env,
  });
  const appProcess = application.process();
  try {
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const updateState = await page.evaluate(() => window.explore.requests['update:getState'](undefined));
    expect(updateState.currentVersion).toBe(await application.evaluate(({ app }) => app.getVersion()));
    expect(updateState.status).not.toBe('disabled');
    expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
    await expect(page.getByTestId('workspace-menu-trigger')).toContainText('安装包验证');
    await expect(page.getByText('match.txt', { exact: true })).toBeVisible();
    const matches = await page.evaluate(
      async (dir) =>
        window.explore.requests['search:fulltext']({
          dir,
          query: 'literal.*',
          searchId: 'packaged-smoke',
          maxResults: 2,
        }),
      contentDir,
    );
    // Native ripgrep honors .ignore; the JS fallback would also return ignored.txt.
    expect(matches).toMatchObject([
      {
        fileName: 'match.txt',
        matchText: 'literal.*',
        lineNumber: 1,
        columnStart: 4,
        columnEnd: 13,
      },
    ]);
    await page.keyboard.press('Control+f');
    await page.getByRole('textbox', { name: '搜索文件和文件夹', exact: true }).fill('match');
    await expect(page.getByTestId('scan-status')).toContainText('已索引 2 项');
    await expect(page.getByText('match.txt', { exact: true })).toHaveCount(2);
    await page.keyboard.press('Escape');
    await page.getByTitle('主题', { exact: true }).selectOption('linear');
    await application.close();
    const settings = JSON.parse(await readFile(join(configDir, 'config.json'), 'utf8'));
    expect(settings.theme).toBe('linear');
  } finally {
    if (appProcess.exitCode === null) {
      await application.evaluate(({ app }) => app.exit(0)).catch(() => {});
      await application.close().catch(() => {});
    }
    await removeTestFixture(root);
  }
});
