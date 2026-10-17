import { describe, expect, it } from 'vitest';
import { selectInstallerBaseline } from '../helpers/installer-baseline';

describe('public release installer baseline', () => {
  it('uses the built installer for initial release reinstallation', () => {
    expect(selectInstallerBaseline('1.0.0')).toEqual({ mode: 'reinstall', version: '1.0.0' });
  });

  it('blocks a later release until the published baseline is hash-pinned', () => {
    expect(() => selectInstallerBaseline('1.0.1')).toThrow('Pin the published');
  });

  it('uses only the retained public release for later upgrade acceptance', () => {
    expect(selectInstallerBaseline('1.0.1', { version: '1.0.0', size: 123, sha256: 'a'.repeat(64) })).toEqual(
      {
        mode: 'upgrade',
        version: '1.0.0',
        size: 123,
        sha256: 'a'.repeat(64),
        url: 'https://github.com/saramand9/prj-super-explore/releases/download/v1.0.0/Explore-Setup-1.0.0-windows-x64.exe',
      },
    );
  });

  it('rejects malformed versions, incomplete pins and downgrade baselines', () => {
    const pin = { version: '1.0.0', size: 123, sha256: 'a'.repeat(64) };
    expect(() => selectInstallerBaseline('../1.0.1', pin)).toThrow();
    expect(() => selectInstallerBaseline('0.9.0', pin)).toThrow();
    expect(() => selectInstallerBaseline('1.0.1', { ...pin, size: 0 })).toThrow();
    expect(() => selectInstallerBaseline('1.0.1', { ...pin, sha256: 'invalid' })).toThrow();
  });
});
