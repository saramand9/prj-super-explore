import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeTestApp, removeTestFixture } from '../helpers/electron-app';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const baselineUrl =
  'https://dl.10yyds.cloud/explore/releases/1.0.1/windows-x64/Explore-Setup-1.0.1-windows-x64.exe';
const baselineHash = '18b358ecbe9e52d14b54258b67caef345e04e441782d78a6c5df66def8258e49';

async function runInstaller(executable: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const process = spawn(executable, args, { windowsHide: true, timeout: 120000, stdio: 'ignore' });
    process.once('error', reject);
    process.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Installer failed: exit ${code}`)),
    );
  });
}

async function launchInstalled(executable: string, profile: string): Promise<ElectronApplication> {
  const application = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${profile}`],
  });
  const page = await application.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  expect(await application.evaluate(({ app }) => app.getPath('userData'))).toBe(profile);
  expect(await application.evaluate(({ app }) => app.isPackaged)).toBe(true);
  return application;
}

test('installs 1.0.1, upgrades with data preserved, launches securely and uninstalls', async () => {
  // Never register/unregister a test installation in a maintainer's real account.
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows') {
    throw new Error('Installer acceptance is restricted to a disposable Windows GitHub runner');
  }
  const version = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8')).version as string;
  const installer = join(appRoot, 'dist-electron', `Explore Setup ${version}.exe`);
  const root = await mkdtemp(join(tmpdir(), 'explore-installer-'));
  const directory = join(root, 'installed');
  const executable = join(directory, 'Explore.exe');
  const uninstaller = join(directory, 'Uninstall Explore.exe');
  const profile = join(root, 'profile');
  const content = join(root, 'content');
  const config = join(profile, 'config');
  let application: ElectronApplication | undefined;
  try {
    const response = await fetch(baselineUrl, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`Baseline installer download failed: HTTP ${response.status}`);
    const baseline = Buffer.from(await response.arrayBuffer());
    expect(createHash('sha256').update(baseline).digest('hex')).toBe(baselineHash);
    const oldInstaller = join(root, 'baseline-1.0.1.exe');
    await writeFile(oldInstaller, baseline);
    await mkdir(config, { recursive: true });
    await mkdir(content);
    await writeFile(join(content, 'release-example.txt'), 'release acceptance literal.*');
    await writeFile(join(config, 'config.json'), JSON.stringify({ indexPaths: [], theme: 'linear' }));
    await writeFile(
      join(config, 'spaces.json'),
      JSON.stringify([
        {
          id: 'upgrade-fixture',
          name: 'Release fixture',
          left: { tabs: [{ path: content, label: 'sample' }], activeTabId: null, path: content },
          right: { tabs: [], activeTabId: null, path: null },
        },
      ]),
    );

    await runInstaller(oldInstaller, ['/S', `/D=${directory}`]);
    await expect.poll(() => existsSync(executable), { timeout: 30000 }).toBe(true);
    application = await launchInstalled(executable, profile);
    expect(await application.evaluate(({ app }) => app.getVersion())).toBe('1.0.1');
    await expect((await application.firstWindow()).getByTestId('workspace-menu-trigger')).toContainText(
      'Release fixture',
    );
    await closeTestApp(application);
    application = undefined;

    await runInstaller(installer, ['/S', `/D=${directory}`]);
    application = await launchInstalled(executable, profile);
    expect(await application.evaluate(({ app }) => app.getVersion())).toBe(version);
    const page = await application.firstWindow();
    await expect(page.getByTestId('workspace-menu-trigger')).toContainText('Release fixture');
    await expect(page.getByTitle('主题', { exact: true })).toHaveValue('linear');
    expect(await page.evaluate(() => window.explore.runtime)).toEqual({
      sandboxed: true,
      contextIsolated: true,
    });
    const matches = await page.evaluate(
      async (dir) =>
        window.explore.requests['search:fulltext']({
          dir,
          query: 'literal.*',
          searchId: 'installer-acceptance',
          maxResults: 2,
        }),
      content,
    );
    expect(matches).toMatchObject([{ fileName: 'release-example.txt', matchText: 'literal.*' }]);
    for (const file of [
      'Explore-MIT-LICENSE.txt',
      'components/components.json',
      'components/ripgrep-15.0.0-MIT.txt',
      'components/PCRE2-10.45-LICENCE.md',
    ]) {
      expect(existsSync(join(directory, 'resources/licenses', file))).toBe(true);
    }
    expect(existsSync(join(directory, 'LICENSE.electron.txt'))).toBe(true);
    expect(existsSync(join(directory, 'LICENSES.chromium.html'))).toBe(true);
    await closeTestApp(application);
    application = undefined;
    await runInstaller(uninstaller, ['/S']);
    await expect.poll(() => existsSync(executable), { timeout: 30000 }).toBe(false);
    expect(JSON.parse(await readFile(join(config, 'config.json'), 'utf8')).theme).toBe('linear');
    expect(await readFile(join(content, 'release-example.txt'), 'utf8')).toBe('release acceptance literal.*');
  } finally {
    if (application) await closeTestApp(application);
    if (existsSync(uninstaller)) {
      await runInstaller(uninstaller, ['/S']);
      await expect.poll(() => existsSync(executable), { timeout: 30000 }).toBe(false);
    }
    await removeTestFixture(root);
  }
});
