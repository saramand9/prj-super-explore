import { globalShortcut } from 'electron';
import type { Service, ServiceContainer } from '../service-container';
import type { ConfigService } from './config.service';
import type { WindowService } from './window.service';

export class HotkeyService implements Service {
  private registered: Map<string, () => void> = new Map();

  constructor(private container: ServiceContainer) {}

  init(): void {
    const config = this.container.get<ConfigService>('config');
    const hotkey = config.getSettings().launcherHotkey;
    this.registerLauncher(hotkey);
  }

  registerLauncher(hotkey: string): void {
    this.unregister(hotkey);

    const ok = globalShortcut.register(hotkey, () => {
      const windowSvc = this.container.get<WindowService>('window');
      windowSvc.toggleLauncher();
    });

    if (ok) {
      this.registered.set(hotkey, () => globalShortcut.unregister(hotkey));
    }
  }

  updateLauncherHotkey(newHotkey: string): void {
    for (const [, unregister] of this.registered) {
      unregister();
    }
    this.registered.clear();
    this.registerLauncher(newHotkey);
  }

  dispose(): void {
    for (const [, unregister] of this.registered) {
      unregister();
    }
    this.registered.clear();
  }

  private unregister(hotkey: string): void {
    const unreg = this.registered.get(hotkey);
    if (unreg) {
      unreg();
      this.registered.delete(hotkey);
    }
  }
}
