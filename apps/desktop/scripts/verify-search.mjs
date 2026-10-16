import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(appRoot, 'package.json'));
const packaged = process.argv.includes('--packaged');
const executable = process.platform === 'win32' ? 'rg.exe' : 'rg';
const binary = packaged
  ? join(appRoot, 'dist-electron/win-unpacked/resources/app.asar.unpacked/node_modules/@lvce-editor/ripgrep/bin/rg.exe')
  : join(dirname(require.resolve('@lvce-editor/ripgrep/package.json')), 'bin', executable);

if (!existsSync(binary)) {
  console.error(`Missing bundled search executable: ${binary}`);
  console.error(packaged
    ? 'Check electron-builder files and asarUnpack before distributing this build.'
    : 'Run: pnpm --filter @explore/desktop rebuild @lvce-editor/ripgrep');
  process.exit(1);
}

const result = spawnSync(binary, ['--version'], { encoding: 'utf8', windowsHide: true });
if (result.error || result.status !== 0 || !result.stdout.startsWith('ripgrep ')) {
  console.error(`Search executable failed to start: ${result.error?.message || result.stderr}`);
  process.exit(1);
}
console.log(`${packaged ? 'Packaged' : 'Installed'} search verified: ${result.stdout.split(/\r?\n/)[0]}`);
