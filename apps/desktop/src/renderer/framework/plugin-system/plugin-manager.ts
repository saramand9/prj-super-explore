import type { PluginManifest, PluginModule, PluginContext } from '@explore/shared';
import type { PluginRegistration, CommandHandler, PanelRenderer } from './types';
import { createPluginContext } from './plugin-context';

/** 插件管理器：控制插件生命周期 */
export class PluginManager {
  private plugins = new Map<string, PluginRegistration>();
  private commands = new Map<string, { handler: CommandHandler; title: string; category?: string }>();
  private panels = new Map<string, { pluginId: string; title: string; renderer: PanelRenderer }>();
  private keybindings = new Map<string, string>(); // commandId → key

  // ── 插件注册 ──

  async registerPlugin(manifest: PluginManifest, moduleLoader: () => Promise<PluginModule>): Promise<void> {
    if (this.plugins.has(manifest.id)) {
      console.warn(`Plugin "${manifest.id}" already registered`);
      return;
    }

    this.plugins.set(manifest.id, {
      manifest,
      module: {} as PluginModule, // placeholder
      activated: false,
      enabled: true,
    });

    // 注册 contributions（同步部分）
    this.registerContributions(manifest);
  }

  // ── 插件激活 ──

  async activatePlugin(pluginId: string): Promise<void> {
    const reg = this.plugins.get(pluginId);
    if (!reg) throw new Error(`Plugin "${pluginId}" not registered`);
    if (reg.activated) return;

    const ctx = createPluginContext();
    await reg.module.activate(ctx);
    reg.activated = true;
  }

  // ── 插件停用 ──

  async deactivatePlugin(pluginId: string): Promise<void> {
    const reg = this.plugins.get(pluginId);
    if (!reg || !reg.activated) return;

    await reg.module.deactivate?.();
    reg.activated = false;
  }

  // ── Contributions ──

  private registerContributions(manifest: PluginManifest): void {
    const c = manifest.contributes;

    // 命令
    if (c.commands) {
      for (const cmd of c.commands) {
        this.commands.set(cmd.id, {
          handler: () => {}, // 由 activate 时填充
          title: cmd.title,
          category: cmd.category,
        });
      }
    }

    // 面板
    if (c.panels) {
      for (const panel of c.panels) {
        this.panels.set(`${manifest.id}:${panel.id}`, {
          pluginId: manifest.id,
          title: panel.title,
          renderer: (() => null) as PanelRenderer, // 由 activate 时填充
        });
      }
    }

    // 快捷键
    if (c.keybindings) {
      for (const kb of c.keybindings) {
        this.keybindings.set(kb.command, kb.key);
      }
    }
  }

  // ── 查询 ──

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

  getPanel(panelId: string) {
    return this.panels.get(panelId);
  }

  getAllPanels() {
    return Array.from(this.panels.entries()).map(([id, info]) => ({
      id,
      pluginId: info.pluginId,
      title: info.title,
    }));
  }

  getKeybinding(commandId: string): string | undefined {
    return this.keybindings.get(commandId);
  }

  getPlugins(): PluginRegistration[] {
    return Array.from(this.plugins.values());
  }

  // ── 生命周期 ──

  dispose(): void {
    for (const [id] of this.plugins) {
      this.deactivatePlugin(id);
    }
    this.plugins.clear();
    this.commands.clear();
    this.panels.clear();
    this.keybindings.clear();
  }
}
