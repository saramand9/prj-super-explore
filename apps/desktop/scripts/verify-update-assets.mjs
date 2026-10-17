import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(appRoot, 'package.json'));
const updaterRequire = createRequire(require.resolve('electron-updater'));
const { load } = updaterRequire('js-yaml');

export function verifyUpdateAssets(directory, version) {
  const filename = `Explore-Setup-${version}-windows-x64.exe`;
  const metadata = load(readFileSync(join(directory, 'latest.yml'), 'utf8'));
  const installer = readFileSync(join(directory, filename));
  const sha512 = createHash('sha512').update(installer).digest('base64');
  if (metadata.version !== version || metadata.path !== filename || metadata.sha512 !== sha512)
    throw new Error('Update metadata version, filename or SHA-512 does not match the installer');
  if (!Array.isArray(metadata.files) || metadata.files.length !== 1)
    throw new Error('Expected exactly one installer in the update feed');
  const file = metadata.files[0];
  if (
    file.url !== filename ||
    basename(file.url) !== file.url ||
    file.sha512 !== sha512 ||
    file.size !== installer.length
  )
    throw new Error('Invalid update file path, size or SHA-512');
  if (!statSync(join(directory, `${filename}.blockmap`)).size) throw new Error('Missing installer blockmap');
  const config = load(readFileSync(join(directory, 'win-unpacked/resources/app-update.yml'), 'utf8'));
  if (
    config.provider !== 'github' ||
    config.owner !== 'saramand9' ||
    config.repo !== 'prj-super-explore' ||
    config.private !== false ||
    config.token ||
    config.url ||
    config.host ||
    (config.protocol && config.protocol !== 'https')
  )
    throw new Error('Packaged updater must use the public Explore GitHub repository without credentials');
  console.log(`Verified GitHub updater config, latest.yml, SHA-512, size and blockmap for ${filename}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { version } = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
  verifyUpdateAssets(join(appRoot, 'dist-electron'), version);
}
