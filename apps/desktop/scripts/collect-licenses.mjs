import {
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  existsSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(appRoot, 'out/licenses');
const manifest = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
// Runtime code bundled from devDependencies must retain its licenses as well.
const rendererRoots = [
  'react',
  'react-dom',
  'zustand',
  'lucide-react',
  '@tanstack/react-virtual',
  'clsx',
  'class-variance-authority',
  'tailwind-merge',
  '@electron-toolkit/utils',
];
const visited = new Map();

function resolvePackage(name, parent) {
  const require = createRequire(join(parent, 'package.json'));
  // Read metadata without executing package code or depending on CJS exports.
  for (const searchPath of require.resolve.paths(name) || []) {
    const directory = join(searchPath, name);
    if (existsSync(join(directory, 'package.json'))) return directory;
  }
  throw new Error(`Cannot resolve license metadata: ${name}`);
}

function collect(name, parent) {
  const directory = realpathSync(resolvePackage(name, parent));
  if (visited.has(directory)) return;
  const pkg = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const licenses = readdirSync(directory).filter(
    (file) =>
      /^(licen[sc]e|copying|notice|thirdparty)/i.test(file) && statSync(join(directory, file)).isFile(),
  );
  const fallback =
    pkg.name === 'type-fest'
      ? 'type-fest-MIT.txt'
      : pkg.name === 'lazy-val' && pkg.version === '1.0.5' && pkg.license === 'MIT'
        ? 'lazy-val-1.0.5-NOTICE.txt'
        : null;
  if (!licenses.length && !fallback)
    throw new Error(`Missing upstream license text for ${pkg.name}@${pkg.version}`);
  const key = `${pkg.name.replaceAll('/', '__')}@${pkg.version}`;
  const destination = join(output, key);
  mkdirSync(destination, { recursive: true });
  for (const file of licenses) copyFileSync(join(directory, file), join(destination, file));
  if (fallback) {
    copyFileSync(join(appRoot, 'build/licenses', fallback), join(destination, fallback));
    licenses.push(fallback);
  }
  visited.set(directory, {
    name: pkg.name,
    version: pkg.version,
    license: pkg.license,
    directory: key,
    files: licenses.sort(),
  });
  for (const dependency of Object.keys(pkg.dependencies || {}).sort()) collect(dependency, directory);
}

mkdirSync(output, { recursive: true });
for (const name of [...Object.keys(manifest.dependencies), ...rendererRoots].sort()) collect(name, appRoot);
for (const file of ['ripgrep-15.0.0-MIT.txt', 'PCRE2-10.45-LICENCE.md']) {
  copyFileSync(join(appRoot, 'build/licenses', file), join(output, file));
}
writeFileSync(
  join(output, 'components.json'),
  `${JSON.stringify(
    [...visited.values()].sort((a, b) => a.name.localeCompare(b.name)),
    null,
    2,
  )}\n`,
);
console.log(
  `Collected license/notice texts for ${visited.size} npm components, ripgrep and PCRE2; Electron notices are bundled by electron-builder.`,
);
