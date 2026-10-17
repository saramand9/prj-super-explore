import type { AppUpdater } from 'electron-updater';
import type { UpdateEngine, UpdateEvents } from './update-controller';

export function createUpdateEngine(
  updater: AppUpdater,
  report: (source: string, error: unknown) => void,
): UpdateEngine {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.autoRunAppAfterInstall = true;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.disableWebInstaller = true;
  // Start with full installers: reliable even when a prior release has no blockmap.
  updater.disableDifferentialDownload = true;
  updater.logger = {
    info: (message) => report('updater', message),
    warn: (message) => report('updater-warning', message),
    error: (message) => report('updater-error', message),
  };

  return {
    subscribe(events: UpdateEvents) {
      const available = (info: { version: string }) => events.available(info.version);
      const notAvailable = () => events.notAvailable();
      const progress = (info: { percent: number }) => events.progress(info.percent);
      const downloaded = (info: { version: string }) => events.downloaded(info.version);
      const error = (failure: Error) => {
        report('updater-error', failure);
        events.error(failure);
      };
      updater.on('update-available', available);
      updater.on('update-not-available', notAvailable);
      updater.on('download-progress', progress);
      updater.on('update-downloaded', downloaded);
      updater.on('error', error);
      return () => {
        updater.off('update-available', available);
        updater.off('update-not-available', notAvailable);
        updater.off('download-progress', progress);
        updater.off('update-downloaded', downloaded);
        // Keep an error sink while in-flight Electron HTTP requests finish during shutdown.
        updater.off('error', error);
        updater.on('error', (failure) => report('updater-shutdown', failure));
      };
    },
    async check() {
      if (!(await updater.checkForUpdates())) throw new Error('Updater is not available in this build');
    },
    async download() {
      await updater.downloadUpdate();
    },
    install() {
      updater.quitAndInstall(false, true);
    },
  };
}
