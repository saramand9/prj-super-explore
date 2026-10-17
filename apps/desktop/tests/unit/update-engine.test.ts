import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdater } from 'electron-updater';
import { createUpdateEngine } from '../../src/main/updates/update-engine';

describe('electron-updater adapter policy', () => {
  it('disables automatic downloads/quit installation/prereleases/downgrades without disabling signature verification', async () => {
    const updater = Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '1.0.3' } })),
      downloadUpdate: vi.fn(async () => ['private-cache-path']),
      quitAndInstall: vi.fn(),
      verifyUpdateCodeSignature: vi.fn(),
      setFeedURL: vi.fn(),
    });
    const signatureVerifier = updater.verifyUpdateCodeSignature;
    const engine = createUpdateEngine(updater as unknown as AppUpdater, vi.fn());
    expect(updater).toMatchObject({
      autoDownload: false,
      autoInstallOnAppQuit: false,
      allowPrerelease: false,
      allowDowngrade: false,
      disableWebInstaller: true,
      disableDifferentialDownload: true,
    });
    expect(updater.verifyUpdateCodeSignature).toBe(signatureVerifier);
    expect(updater.setFeedURL).not.toHaveBeenCalled();
    const events = {
      available: vi.fn(),
      notAvailable: vi.fn(),
      progress: vi.fn(),
      downloaded: vi.fn(),
      error: vi.fn(),
    };
    const dispose = engine.subscribe(events);
    updater.emit('update-available', { version: '1.0.3', releaseNotes: '<script>ignored</script>' });
    expect(events.available).toHaveBeenCalledWith('1.0.3');
    await engine.check();
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    await engine.download();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    engine.install();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    dispose();
    expect(() => updater.emit('error', new Error('shutdown'))).not.toThrow();
  });
});
