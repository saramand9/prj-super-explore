import type { ComponentType } from 'react';
import type { PluginManifest, PluginModule, PluginContext, CommandContribution, PanelContribution, KeybindingContribution } from '@explore/shared';

export type { PluginManifest, PluginModule, PluginContext, CommandContribution, PanelContribution, KeybindingContribution };

/** 插件注册信息（运行时） */
export interface PluginRegistration {
  manifest: PluginManifest;
  module: PluginModule;
  activated: boolean;
  enabled: boolean;
}

/** 命令执行器 */
export type CommandHandler = (...args: any[]) => any;

/** 面板渲染器 */
export type PanelRenderer = ComponentType<{ pluginId: string }>;
