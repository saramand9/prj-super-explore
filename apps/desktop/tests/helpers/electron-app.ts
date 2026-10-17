import { _electron as electron, type ElectronApplication } from '@playwright/test';
import { mkdir, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { once } from 'events';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function assertFixture(root: string): void {
  if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.split(/[/\\]/).pop()?.startsWith('explore-')) {
    throw new Error(`Refusing to use an unexpected fixture directory: ${root}`);
  }
}

/** Explicit Electron paths prevent tests from reading or replacing the real user's workspaces. */
export async function launchTestApp(root: string, beforeImport: string[] = []): Promise<ElectronApplication> {
  assertFixture(root);
  const userData = join(root, '.profile');
  await mkdir(userData, { recursive: true });
  const bootstrap = join(root, '.launch-explore.mjs');
  await writeFile(
    bootstrap,
    [
      "import { app } from 'electron';",
      `app.setPath('userData', ${JSON.stringify(userData)});`,
      ...['home', 'desktop', 'documents', 'downloads', 'appData', 'sessionData'].map(
        (key) =>
          `app.setPath(${JSON.stringify(key)}, ${JSON.stringify(key === 'sessionData' ? userData : root)});`,
      ),
      ...beforeImport,
      `await import(${JSON.stringify(pathToFileURL(join(appRoot, 'out/main/index.js')).href)});`,
    ].join('\n'),
    'utf8',
  );
  const application = await electron.launch({
    args: [bootstrap],
    cwd: appRoot,
    env: Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    ),
  });
  const child = application.process();
  children.set(application, child);
  let startupOutput = '';
  const capture = (data: Buffer) => {
    startupOutput = `${startupOutput}${data}`.slice(-8000);
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  let actualUserData: string;
  try {
    // Wait for bootstrap and the renderer to exist before querying the main execution context.
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    actualUserData = await application.evaluate(({ app }) => app.getPath('userData'));
  } catch (error) {
    throw new Error(`Electron startup failed: ${startupOutput}`, { cause: error });
  } finally {
    child.stdout?.off('data', capture);
    child.stderr?.off('data', capture);
  }
  if (resolve(actualUserData) !== resolve(userData)) {
    await application.close();
    throw new Error('Electron did not use the isolated test profile');
  }
  return application;
}

export async function removeTestFixture(root: string): Promise<void> {
  assertFixture(root);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

/** Playwright's browser disconnect can precede the OS releasing the profile lock. */
export async function closeTestApp(application: ElectronApplication): Promise<void> {
  const child = children.get(application) ?? application.process();
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  await application.close();
  await exited;
}

const children = new WeakMap<ElectronApplication, ReturnType<ElectronApplication['process']>>();
