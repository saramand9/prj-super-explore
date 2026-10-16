import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateRequest } from '../../src/main/ipc/request-validation';
import { isTrustedRendererUrl } from '../../src/main/security/renderer-policy';

describe('IPC request validation', () => {
  it('rejects missing payloads, unknown fields and relative/protocol paths', () => {
    for (const value of [
      undefined,
      null,
      {},
      { path: '../secret' },
      { path: 'https://example.com' },
      { path: 'C:\\demo', extra: true },
    ]) {
      expect(() => validateRequest('file:readDir', value)).toThrow();
    }
    expect(() => validateRequest('file:readDir', { path: 'C:\\demo' })).not.toThrow();
  });
  it('rejects traversal leaf names and invalid destructive options', () => {
    for (const name of ['..', '../outside', 'a/b', 'a\\b', 'CON', 'bad\0name']) {
      expect(() => validateRequest('file:mkdir', { parentPath: 'C:\\demo', name })).toThrow();
    }
    expect(() => validateRequest('file:delete', { paths: ['C:\\demo'], permanent: 'true' })).toThrow();
    expect(() => validateRequest('file:copy', { sources: [], destDir: 'C:\\demo' })).toThrow();
  });
  it('rejects invalid plugin names and out-of-bounds requests', () => {
    expect(() => validateRequest('plugin:readFile', { pluginId: '../other', file: 'main.js' })).toThrow();
    expect(() => validateRequest('plugin:readFile', { pluginId: 'demo', file: '../../secret' })).toThrow();
    expect(() => validateRequest('file:scan', { path: 'C:\\demo', scanId: 'id', maxDepth: -1 })).toThrow();
    expect(() =>
      validateRequest('search:run', { dir: 'C:\\demo', query: 'x', searchId: 'id', maxResults: Infinity }),
    ).toThrow();
  });
  it('allows void calls, valid searches, settings and diagnostics', () => {
    expect(() => validateRequest('app:getVersion', undefined)).not.toThrow();
    expect(() => validateRequest('app:copyDiagnostics', {})).not.toThrow();
    expect(() => validateRequest('search:run', { dir: 'C:\\demo', query: '', searchId: 'id' })).not.toThrow();
    expect(() =>
      validateRequest('settings:saveAppearance', { theme: 'grafana', fontScale: 130, layoutMode: 'dual' }),
    ).not.toThrow();
  });
});

describe('renderer URL trust policy', () => {
  const file = 'file:///C:/Explore/out/renderer/index.html';
  it('trusts only the exact application page, allowing its hash router', () => {
    expect(isTrustedRendererUrl(file + '#/launcher', file)).toBe(true);
    for (const url of [
      'file:///C:/secret.html',
      'file://untrusted.example/share/index.html',
      file + '?other=1',
      'https://example.com',
      'about:blank',
    ]) {
      expect(isTrustedRendererUrl(url, file)).toBe(false);
    }
  });
  it('does not trust same-origin development pages or lookalike hosts', () => {
    const dev = 'http://localhost:5173/';
    expect(isTrustedRendererUrl(dev + '#/launcher', dev)).toBe(true);
    expect(isTrustedRendererUrl(dev + 'evil.html', dev)).toBe(false);
    expect(isTrustedRendererUrl('http://localhost.evil:5173/', dev)).toBe(false);
    expect(isTrustedRendererUrl('http://user@localhost:5173/', dev)).toBe(false);
  });
  it('accepts canonical installation aliases without trusting sibling files', () => {
    const root = mkdtempSync(join(tmpdir(), 'explore-url-policy-'));
    try {
      const directory = join(root, 'actual');
      const alias = join(root, 'alias');
      mkdirSync(directory);
      writeFileSync(join(directory, 'index.html'), 'trusted');
      writeFileSync(join(directory, 'other.html'), 'not trusted');
      symlinkSync(directory, alias, 'junction');
      const entry = pathToFileURL(join(directory, 'index.html')).href;
      expect(isTrustedRendererUrl(pathToFileURL(join(alias, 'index.html')).href + '#/launcher', entry)).toBe(
        true,
      );
      expect(isTrustedRendererUrl(pathToFileURL(join(alias, 'other.html')).href, entry)).toBe(false);
      expect(isTrustedRendererUrl(pathToFileURL(join(alias, 'index.html')).href + '?other=1', entry)).toBe(
        false,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
