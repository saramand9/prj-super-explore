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
  'https://github.com/saramand9/prj-super-explore/releases/download/v1.0.2/Explore-Setup-1.0.2-windows-x64.exe';
const baselineHash = '329edcc84bbdfe1593dec18bf4a34f7fc741323bd5f925c79cdbab10d320c81c';

async function downloadBaseline(): Promise<Buffer> {
  const size = 115581856;
  const chunkSize = 1024 * 1024;
  const output = Buffer.alloc(size);
  const deadline = AbortSignal.timeout(360000);
  let next = 0;
  let completed = 0;
  // Use the latest accepted installer, not the obsolete 1.0.1 baseline which
  // crashes on some fresh runners. Retain HTTPS, exact ranges and SHA-256 pinning.
  console.log('Downloading pinned 1.0.2 baseline with at most 8 concurrent ranges');
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (;;) {
        const start = next;
        next += chunkSize;
        if (start >= size) return;
        const end = Math.min(start + chunkSize, size) - 1;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(baselineUrl, {
              headers: { Range: `bytes=${start}-${end}` },
              signal: AbortSignal.any([deadline, AbortSignal.timeout(30000)]),
            });
            if (
              response.status !== 206 ||
              response.headers.get('content-range') !== `bytes ${start}-${end}/${size}`
            ) {
              throw new Error(`Unexpected baseline range response: HTTP ${response.status}`);
            }
            const chunk = Buffer.from(await response.arrayBuffer());
            if (chunk.length !== end - start + 1) throw new Error('Truncated baseline range');
            chunk.copy(output, start);
            completed += chunk.length;
            if (completed % (20 * chunkSize) === 0 || completed === size) {
              console.log(`Baseline download: ${completed}/${size} bytes verified by range`);
            }
            break;
          } catch (error) {
            if (deadline.aborted || attempt === 2) throw error;
            console.log(`Retrying baseline range ${start}-${end} after transient download failure`);
          }
        }
      }
    }),
  );
  expect(createHash('sha256').update(output).digest('hex')).toBe(baselineHash);
  console.log('Baseline SHA-256 verified');
  return output;
}

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

test('installs 1.0.2, upgrades with data preserved, launches securely and uninstalls', async () => {
  // Never register/unregister a test installation in a maintainer's real account.
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_OS !== 'Windows') {
    throw new Error('Installer acceptance is restricted to a disposable Windows GitHub runner');
  }
  const version = JSON.parse(await readFile(join(appRoot, 'package.json'), 'utf8')).version as string;
  const installer = join(appRoot, 'dist-electron', `Explore-Setup-${version}-windows-x64.exe`);
  const root = await mkdtemp(join(tmpdir(), 'explore-installer-'));
  const directory = join(root, 'installed');
  const executable = join(directory, 'Explore.exe');
  const uninstaller = join(directory, 'Uninstall Explore.exe');
  const profile = join(root, 'profile');
  const content = join(root, 'content');
  const config = join(profile, 'config');
  let application: ElectronApplication | undefined;
  try {
    const baseline = await downloadBaseline();
    const oldInstaller = join(root, 'baseline-1.0.2.exe');
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

    console.log('Installing baseline 1.0.2 in the disposable profile');
    await runInstaller(oldInstaller, ['/S', `/D=${directory}`]);
    await expect.poll(() => existsSync(executable), { timeout: 30000 }).toBe(true);
    application = await launchInstalled(executable, profile);
    expect(await application.evaluate(({ app }) => app.getVersion())).toBe('1.0.2');
    await expect((await application.firstWindow()).getByTestId('workspace-menu-trigger')).toContainText(
      'Release fixture',
    );
    await closeTestApp(application);
    application = undefined;

    console.log(`Upgrading to ${version}`);
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
    console.log('Verifying uninstall and retained external fixture data');
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
