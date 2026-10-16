import { useState, useCallback, useEffect, useRef } from 'react';
import { useLayoutStore } from '../framework/layout';
import { useFileStore } from '../plugins/file-explorer/store';
import { useAppStore } from '../framework/store/app-store';
import { themes } from '../framework/themes';
import { ipc } from '../framework/bridge/ipc-client';
import { appDialog } from '../framework/dialogs/app-dialog';
import { showNotification } from '../framework/plugin-system';
import {
  getFileOpToastType,
  resolveCopyConflictStrategyWithChoice,
  summarizeFileOpResult,
  summarizeFileOpToast,
} from '../plugins/file-explorer/utils/file-op-result';
import type { FileOpResult } from '@explore/shared';

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  title?: string;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [inlinePrompt, setInlinePrompt] = useState<{
    message: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const layout = useLayoutStore((state) => state.layout);
  const sourceSide = layout.id === 'right' ? 'right' : 'left';
  const targetSide = sourceSide === 'left' ? 'right' : 'left';
  const selectedCount = useFileStore((state) => state[sourceSide].selected.size);
  const sourcePath = useFileStore((state) => state[sourceSide].path);
  const targetDirectory = useFileStore((state) => state[targetSide].path);
  const isFilePanel = layout[sourceSide].pluginId === 'file-explorer';
  const targetLabel = targetSide === 'right' ? '右侧' : '左侧';
  const transferDisabledReason = !isFilePanel
    ? '请先在文件列表中选择要操作的项目'
    : layout.mode !== 'dual'
      ? '请先切换为双栏，再选择目标文件夹'
      : !targetDirectory
        ? `请先在${targetLabel}打开目标文件夹`
        : selectedCount === 0
          ? '请先选择文件或文件夹'
          : undefined;

  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [openMenu]);

  const activeSide = useCallback(() => {
    const side = useLayoutStore.getState().layout.id;
    return side === 'left' || side === 'right' ? side : 'left';
  }, []);

  const showPrompt = useCallback(
    (message: string, defaultValue: string): Promise<string | null> =>
      new Promise((resolve) => {
        setInlinePrompt({ message, defaultValue, resolve });
      }),
    [],
  );

  const reportFileOperationResult = useCallback(async (action: string, result: FileOpResult) => {
    const summary = summarizeFileOpResult(action, result);
    if (summary) {
      await appDialog.alert({
        message: summary,
        type: getFileOpToastType(result) === 'error' ? 'error' : 'warning',
      });
      return;
    }
    showNotification(summarizeFileOpToast(action, result), getFileOpToastType(result));
  }, []);

  const menus: MenuDef[] = [
    {
      label: '文件',
      items: [
        {
          label: '打开文件夹',
          shortcut: 'Ctrl+O',
          action: async () => {
            const side = activeSide();
            const state = useFileStore.getState()[side as 'left' | 'right'];
            const result = await ipc.invoke('dialog:openFolder', { defaultPath: state.path ?? undefined });
            if (result) {
              useFileStore.getState().addTab(side as 'left' | 'right', result);
              useFileStore.getState().navigateTo(side as 'left' | 'right', result, true);
              useLayoutStore.getState().setPanelPlugin(side, 'file-explorer', 'browser');
              useLayoutStore.getState().setPanelPath(side as 'left' | 'right', result);
            }
          },
        },
        {
          label: '新建标签',
          shortcut: 'Ctrl+T',
          action: () => window.dispatchEvent(new CustomEvent('explore:new-tab')),
        },
        {
          label: '关闭当前标签',
          shortcut: 'Ctrl+W',
          action: () => window.dispatchEvent(new CustomEvent('explore:close-tab')),
        },
        { separator: true },
        {
          label: '新建文件夹',
          shortcut: 'F7',
          disabled: !isFilePanel || !sourcePath,
          action: async () => {
            const side = activeSide();
            const state = useFileStore.getState()[side as 'left' | 'right'];
            if (!state.path) return;
            const name = await showPrompt('文件夹名称：', '新建文件夹');
            if (name?.trim()) {
              await ipc.invoke('file:mkdir', { parentPath: state.path, name: name.trim() });
              useFileStore.getState().refresh(side as 'left' | 'right');
            }
          },
        },
        { separator: true },
        {
          label: '退出',
          action: () => window.close(),
        },
      ],
    },
    {
      label: '编辑',
      items: [
        {
          label: `复制到${targetLabel}`,
          shortcut: 'F5',
          disabled: Boolean(transferDisabledReason),
          title: transferDisabledReason ?? `目标文件夹：${targetDirectory}`,
          action: async () => {
            const side = activeSide() as 'left' | 'right';
            const target = side === 'left' ? 'right' : 'left';
            const state = useFileStore.getState()[side];
            const currentLayout = useLayoutStore.getState().layout;
            if (currentLayout.mode !== 'dual' || currentLayout[side].pluginId !== 'file-explorer') return;
            const targetPath = useFileStore.getState()[target].path;
            if (targetPath && state.selected.size > 0) {
              const sources = [...state.selected];
              const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
                sources,
                targetPath,
                (p) => ipc.invoke('file:readDir', { path: p }),
                (message, buttons) =>
                  appDialog.choice({
                    title: '同名冲突',
                    message,
                    buttons,
                    defaultId: 'rename',
                    cancelId: 'cancel',
                  }),
              );
              if (!conflictStrategy) return;
              const result = await ipc.invoke('file:copy', {
                sources,
                destDir: targetPath,
                conflictStrategy,
              });
              await reportFileOperationResult('Copy', result);
              if (result.success) useFileStore.getState().clearSelection(side);
              useFileStore.getState().refresh(side);
              useFileStore.getState().refresh(target);
            }
          },
        },
        {
          label: `移动到${targetLabel}`,
          shortcut: 'F6',
          disabled: Boolean(transferDisabledReason),
          title: transferDisabledReason ?? `目标文件夹：${targetDirectory}`,
          action: async () => {
            const side = activeSide() as 'left' | 'right';
            const target = side === 'left' ? 'right' : 'left';
            const state = useFileStore.getState()[side];
            const currentLayout = useLayoutStore.getState().layout;
            if (currentLayout.mode !== 'dual' || currentLayout[side].pluginId !== 'file-explorer') return;
            const targetPath = useFileStore.getState()[target].path;
            if (targetPath && state.selected.size > 0) {
              const sources = [...state.selected];
              const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
                sources,
                targetPath,
                (p) => ipc.invoke('file:readDir', { path: p }),
                (message, buttons) =>
                  appDialog.choice({
                    title: '同名冲突',
                    message,
                    buttons,
                    defaultId: 'rename',
                    cancelId: 'cancel',
                  }),
              );
              if (!conflictStrategy) return;
              const result = await ipc.invoke('file:move', {
                sources,
                destDir: targetPath,
                conflictStrategy,
              });
              await reportFileOperationResult('Move', result);
              if (result.success) useFileStore.getState().clearSelection(side);
              useFileStore.getState().refresh(side);
              useFileStore.getState().refresh(target);
            }
          },
        },
        {
          label: '删除',
          shortcut: 'F8',
          disabled: !isFilePanel || selectedCount === 0,
          title: '移到回收站',
          action: async () => {
            const side = activeSide() as 'left' | 'right';
            const state = useFileStore.getState()[side];
            if (state.selected.size === 0) return;
            const names = [...state.selected].map((p) => p.split(/[/\\]/).pop()).join(', ');
            if (await appDialog.confirm({ message: `确定要移到回收站吗？\n${names}` })) {
              const result = await ipc.invoke('file:delete', { paths: [...state.selected] });
              await reportFileOperationResult('Delete', result);
              useFileStore.getState().clearSelection(side);
              useFileStore.getState().refresh(side);
            }
          },
        },
        {
          label: '永久删除',
          shortcut: 'Shift+F8',
          disabled: !isFilePanel || selectedCount === 0,
          action: async () => {
            const side = activeSide() as 'left' | 'right';
            const state = useFileStore.getState()[side];
            if (state.selected.size === 0) return;
            const paths = [...state.selected];
            const names = paths.map((p) => p.split(/[/\\]/).pop()).join(', ');
            const first = await appDialog.confirm({
              title: '永久删除',
              message: `确定要永久删除 ${paths.length} 个项目吗？\n这些项目不会进入回收站。\n${names}`,
            });
            if (!first) return;
            const second = await appDialog.confirm({
              title: '再次确认永久删除',
              message: '再次确认：永久删除无法从回收站恢复。是否继续？',
            });
            if (!second) return;
            const result = await ipc.invoke('file:delete', { paths, permanent: true });
            await reportFileOperationResult('PermanentDelete', result);
            useFileStore.getState().clearSelection(side);
            useFileStore.getState().refresh(side);
          },
        },
        { separator: true },
        {
          label: '全选',
          shortcut: 'Ctrl+A',
          disabled: !isFilePanel,
          action: () => {
            const side = activeSide() as 'left' | 'right';
            useFileStore.getState().selectAll(side);
          },
        },
      ],
    },
    {
      label: '查看',
      items: [
        {
          label: '显示/隐藏隐藏文件',
          shortcut: 'Ctrl+H',
          action: () => {
            const side = activeSide() as 'left' | 'right';
            useFileStore.getState().toggleHidden(side);
          },
        },
        {
          label: '刷新',
          shortcut: 'Ctrl+R',
          action: () => {
            const side = activeSide() as 'left' | 'right';
            useFileStore.getState().refresh(side);
          },
        },
        { separator: true },
        {
          label: '管理插件...',
          action: () => {
            useAppStore.getState().setShowPluginManager(true);
          },
        },
        { separator: true },
        {
          label: '聚焦左侧面板',
          shortcut: 'Left',
          action: () => useLayoutStore.getState().setActivePanel('left'),
        },
        {
          label: '聚焦右侧面板',
          shortcut: 'Right',
          action: () => useLayoutStore.getState().setActivePanel('right'),
        },
      ],
    },
    {
      label: '帮助',
      items: [
        {
          label: '快捷键与操作说明',
          action: () =>
            appDialog.alert({
              title: '快捷键与操作说明',
              message:
                'Ctrl+O  打开文件夹\nCtrl+T  新建标签\nCtrl+W  关闭当前预览或标签\nCtrl+P  搜索标签\nCtrl+Shift+W  搜索工作区\nCtrl+F  搜索文件或内容\nCtrl+Shift+F  全文搜索\n\nF5 / F6  复制 / 移动到另一侧的文件夹\nF7  新建文件夹\nF8  移到回收站\n\n拖拽默认为复制，按住 Shift 拖拽为移动，Ctrl 拖拽保持复制。',
            }),
        },
        { separator: true },
        {
          label: '复制诊断信息',
          action: async () => {
            await ipc.invoke('app:copyDiagnostics', {});
            await appDialog.alert({ message: '诊断信息已复制，包含版本、近期错误和相关本机路径。' });
          },
        },
        { label: '打开日志目录', action: () => ipc.invoke('app:openLogs', undefined) },
        {
          label: '关于 Explore',
          action: async () => {
            const version = await ipc.invoke('app:getVersion', undefined);
            await appDialog.alert({
              title: '关于',
              message: `Explore v${version}\n双栏文件管理器`,
            });
          },
        },
      ],
    },
  ];

  return (
    <>
      <div
        ref={menuRef}
        className="flex items-center h-7 bg-surface-light border-b border-border px-1 flex-shrink-0 select-none"
      >
        {menus.map((menu) => (
          <div key={menu.label} className="relative">
            <button
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                openMenu === menu.label
                  ? 'bg-accent/20 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-lighter'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenMenu(openMenu === menu.label ? null : menu.label);
              }}
            >
              {menu.label}
            </button>
            {openMenu === menu.label && (
              <div className="absolute left-0 top-full mt-0.5 z-50 bg-surface-light border border-border rounded shadow-lg py-1 min-w-[200px] text-xs">
                {menu.items.map((item, i) =>
                  item.separator ? (
                    <div key={`sep-${i}`} className="border-t border-border/50 my-0.5" />
                  ) : (
                    <button
                      key={item.label}
                      className="w-full text-left px-3 py-1 flex items-center justify-between hover:bg-accent/20 text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                      disabled={item.disabled}
                      title={item.title}
                      onClick={() => {
                        item.action?.();
                        setOpenMenu(null);
                      }}
                    >
                      <span>{item.label}</span>
                      {item.shortcut && (
                        <span className="text-text-secondary text-xs ml-4">{item.shortcut}</span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
        <span className="flex-1" />
        <ThemeDropdown />
        <span className="w-1" />
        <FontScaleDropdown />
        <LayoutModeToggle />
      </div>
      {inlinePrompt && (
        <div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/50"
          onClick={() => {
            inlinePrompt.resolve(null);
            setInlinePrompt(null);
          }}
        >
          <div
            className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[320px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm text-text-primary mb-3">{inlinePrompt.message}</div>
            <input
              autoFocus
              id="menu-inline-prompt-input"
              className="w-full bg-surface-lighter border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
              defaultValue={inlinePrompt.defaultValue}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  inlinePrompt.resolve((e.target as HTMLInputElement).value);
                  setInlinePrompt(null);
                }
                if (e.key === 'Escape') {
                  inlinePrompt.resolve(null);
                  setInlinePrompt(null);
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                className="px-3 py-1 text-xs text-text-muted hover:text-text-primary"
                onClick={() => {
                  inlinePrompt.resolve(null);
                  setInlinePrompt(null);
                }}
              >
                取消
              </button>
              <button
                className="px-3 py-1 text-xs bg-accent text-white rounded"
                onClick={() => {
                  const el = document.getElementById('menu-inline-prompt-input') as HTMLInputElement;
                  inlinePrompt.resolve(el?.value || '');
                  setInlinePrompt(null);
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ThemeDropdown() {
  const theme = useLayoutStore((s) => s.theme);
  const setTheme = useLayoutStore((s) => s.setTheme);
  const entries = Object.entries(themes);

  return (
    <select
      className="px-1 py-0.5 text-xs rounded bg-transparent border border-transparent hover:border-border text-text-secondary hover:text-text-primary cursor-pointer outline-none"
      value={theme}
      onChange={(e) => setTheme(e.target.value)}
      title="主题"
    >
      {entries.map(([key, t]) => (
        <option key={key} value={key} className="bg-surface-light text-text-primary">
          {t.label}
        </option>
      ))}
    </select>
  );
}

function FontScaleDropdown() {
  const fontScale = useLayoutStore((s) => s.fontScale);
  const setFontScale = useLayoutStore((s) => s.setFontScale);
  const scales = [...new Set([100, 120, 130, 140, 160, 180, 200, fontScale])].sort((a, b) => a - b);

  return (
    <select
      className="px-1 py-0.5 text-xs rounded bg-transparent border border-transparent hover:border-border text-text-secondary hover:text-text-primary cursor-pointer outline-none"
      value={fontScale}
      onChange={(e) => setFontScale(Number(e.target.value))}
      title="字号"
    >
      {scales.map((s) => (
        <option key={s} value={s} className="bg-surface-light text-text-primary">
          {s}%
        </option>
      ))}
    </select>
  );
}

function LayoutModeToggle() {
  const mode = useLayoutStore((s) => s.layout.mode);
  const setMode = useLayoutStore((s) => s.setMode);

  return (
    <button
      className="px-1.5 py-0.5 text-base rounded text-text-secondary hover:text-text-primary hover:bg-surface-lighter transition-colors"
      title={mode === 'dual' ? '切换为单栏' : '切换为双栏'}
      onClick={() => setMode(mode === 'dual' ? 'single' : 'dual')}
    >
      {mode === 'dual' ? '◫' : '▣'}
    </button>
  );
}
