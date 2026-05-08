import type { PluginManifest, PluginModule, PluginContext } from '@explore/shared';
import type { PluginRegistration, CommandHandler, PanelRenderer } from './types';
import { createPluginContext } from './plugin-context';

interface PanelEntry {
  pluginId: string;
  panelId: string;
  title: string;
  icon?: string;
  renderer: PanelRenderer;
}

interface CommandEntry {
  handler: CommandHandler;
  title: string;
  category?: string;
}

interface FileHandlerEntry {
  pluginId: string;
  panelId: string;
  handlerName: string;
}

export class PluginManager {
  private plugins = new Map<string, PluginRegistration>();
  private commands = new Map<string, CommandEntry>();
  private panels = new Map<string, PanelEntry>();
  private keybindings = new Map<string, string>();
  private fileHandlers = new Map<string, FileHandlerEntry>();

  registerPlugin(module: PluginModule): void {
    const manifest = module.manifest;

    if (this.plugins.has(manifest.id)) {
      console.warn(`Plugin "${manifest.id}" already registered`);
      return;
    }

    this.plugins.set(manifest.id, {
      manifest,
      module,
      activated: false,
      enabled: true,
    });

    this.registerContributions(manifest);

    // Patch panel renderers from module.components
    if (module.components && manifest.contributes.panels) {
      for (const panel of manifest.contributes.panels) {
        const key = `${manifest.id}:${panel.id}`;
        const entry = this.panels.get(key);
        if (entry && module.components[panel.id]) {
          entry.renderer = module.components[panel.id];
        }
      }
    }

    // Patch command handlers from module.commandHandlers
    if (module.commandHandlers) {
      for (const [id, handler] of Object.entries(module.commandHandlers)) {
        const cmd = this.commands.get(id);
        if (cmd) cmd.handler = handler;
      }
    }

    // Register file handlers
    if (manifest.contributes.fileHandlers) {
      this.registerFileHandlers(manifest);
    }
  }

  async activatePlugin(pluginId: string): Promise<void> {
    const reg = this.plugins.get(pluginId);
    if (!reg) throw new Error(`Plugin "${pluginId}" not registered`);
    if (reg.activated) return;

    const ctx = createPluginContext();
    await reg.module.activate(ctx);
    reg.activated = true;
  }

  async deactivatePlugin(pluginId: string): Promise<void> {
    const reg = this.plugins.get(pluginId);
    if (!reg || !reg.activated) return;

    await reg.module.deactivate?.();
    reg.activated = false;
  }

  // ── Contributions ──

  private registerContributions(manifest: PluginManifest): void {
    const c = manifest.contributes;

    if (c.commands) {
      for (const cmd of c.commands) {
        this.commands.set(cmd.id, {
          handler: () => {},
          title: cmd.title,
          category: cmd.category,
        });
      }
    }

    if (c.panels) {
      for (const panel of c.panels) {
        this.panels.set(`${manifest.id}:${panel.id}`, {
          pluginId: manifest.id,
          panelId: panel.id,
          title: panel.title,
          icon: panel.icon,
          renderer: (() => null) as PanelRenderer,
        });
      }
    }

    if (c.keybindings) {
      for (const kb of c.keybindings) {
        this.keybindings.set(kb.command, kb.key);
      }
    }
  }

  private registerFileHandlers(manifest: PluginManifest): void {
    const panels = manifest.contributes.panels ?? [];
    const defaultPanelId = panels[0]?.id ?? 'default';

    for (const fh of manifest.contributes.fileHandlers!) {
      for (const ext of fh.extensions) {
        const normalized = ext.toLowerCase();
        if (!this.fileHandlers.has(normalized)) {
          this.fileHandlers.set(normalized, {
            pluginId: manifest.id,
            panelId: defaultPanelId,
            handlerName: fh.handler,
          });
        }
      }
    }
  }

  // ── Queries ──

  getCommand(id: string) {
    return this.commands.get(id);
  }

  getAllCommands() {
    return Array.from(this.commands.entries()).map(([id, info]) => ({
      id,
      title: info.title,
      category: info.category,
    }));
  }

  getPanel(panelCompositeId: string): PanelEntry | undefined {
    return this.panels.get(panelCompositeId);
  }

  getAllPanels() {
    return Array.from(this.panels.entries()).map(([id, info]) => ({
      id,
      pluginId: info.pluginId,
      panelId: info.panelId,
      title: info.title,
      icon: info.icon,
    }));
  }

  getActivityBarPanels() {
    return this.getAllPanels().filter((p) => p.icon);
  }

  getKeybinding(commandId: string): string | undefined {
    return this.keybindings.get(commandId);
  }

  getFileHandlerForExtension(ext: string): { pluginId: string; panelId: string } | null {
    return this.fileHandlers.get(ext.toLowerCase()) ?? null;
  }

  getPlugins(): PluginRegistration[] {
    return Array.from(this.plugins.values());
  }

  // ── Commands ──

  registerCommandHandler(id: string, handler: CommandHandler): void {
    const cmd = this.commands.get(id);
    if (cmd) cmd.handler = handler;
  }

  async executeCommand<T>(id: string, ...args: any[]): Promise<T> {
    const cmd = this.commands.get(id);
    if (!cmd) throw new Error(`Command "${id}" not found`);
    return cmd.handler(...args) as T;
  }

  // ── Lifecycle ──

  dispose(): void {
    for (const [id] of this.plugins) {
      this.deactivatePlugin(id);
    }
    this.plugins.clear();
    this.commands.clear();
    this.panels.clear();
    this.keybindings.clear();
    this.fileHandlers.clear();
  }
}

export const pluginManager = new PluginManager();
