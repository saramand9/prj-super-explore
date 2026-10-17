import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyUpdateAssets } from '../../apps/desktop/scripts/verify-update-assets.mjs';

test('update artifacts must match the installer and the fixed public GitHub source', () => {
  const root = mkdtempSync(join(tmpdir(), 'explore-update-assets-'));
  try {
    const version = '1.2.3';
    const filename = `Explore-Setup-${version}-windows-x64.exe`;
    const installer = Buffer.from('synthetic installer fixture');
    const sha512 = createHash('sha512').update(installer).digest('base64');
    const metadata = {
      version,
      path: filename,
      sha512,
      files: [{ url: filename, sha512, size: installer.length }],
    };
    const configDir = join(root, 'win-unpacked/resources');
    mkdirSync(configDir, { recursive: true });
    const config = { provider: 'github', owner: 'saramand9', repo: 'prj-super-explore', private: false };
    writeFileSync(join(configDir, 'app-update.yml'), JSON.stringify(config));
    writeFileSync(join(root, filename), installer);
    writeFileSync(join(root, `${filename}.blockmap`), 'fixture blockmap');
    const feed = join(root, 'latest.yml');
    writeFileSync(feed, JSON.stringify(metadata));
    assert.doesNotThrow(() => verifyUpdateAssets(root, version));
    for (const patch of [
      { version: '9.0.0' },
      { sha512: 'wrong' },
      { path: '../outside.exe' },
      { files: [{ ...metadata.files[0], url: 'https://evil.example/setup.exe' }] },
      { files: [{ ...metadata.files[0], size: 1 }] },
      { files: [] },
    ]) {
      writeFileSync(feed, JSON.stringify({ ...metadata, ...patch }));
      assert.throws(() => verifyUpdateAssets(root, version));
    }
    writeFileSync(feed, JSON.stringify(metadata));
    for (const patch of [{ owner: 'other' }, { private: true }, { token: 'fixture-not-a-real-token' }]) {
      writeFileSync(join(configDir, 'app-update.yml'), JSON.stringify({ ...config, ...patch }));
      assert.throws(() => verifyUpdateAssets(root, version));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('release drafts include the feed and blockmap and packaging never publishes implicitly', () => {
  const app = JSON.parse(readFileSync(new URL('../../apps/desktop/package.json', import.meta.url), 'utf8'));
  const workflow = readFileSync(new URL('../../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(app.scripts.pack, /--publish never/);
  assert.match(app.scripts.pack, /verify-update-assets\.mjs/);
  assert.match(workflow, /dist-electron\/latest\.yml/);
  assert.match(workflow, /dist-electron\/\*\.blockmap/);
  assert.match(workflow, /--draft/);
});
