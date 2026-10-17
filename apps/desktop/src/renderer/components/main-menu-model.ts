import type { LucideIcon } from 'lucide-react';
import {
  ArrowRightLeft,
  BookOpen,
  CheckSquare,
  Columns2,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Info,
  ListChecks,
  LogOut,
  PanelLeft,
  PanelRight,
  Plug,
  RefreshCw,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { useFileStore } from '../plugins/file-explorer/store';
import { useLayoutStore } from '../framework/store/layout-store';
import { useAppStore } from '../framework/store/app-store';
import { useUpdateStore } from '../framework/store/update-store';
import { ipc } from '../framework/bridge/ipc-client';
import { appDialog } from '../framework/dialogs/app-dialog';
import {
  activeSide,
  deleteFiles,
  openFolder,
  transferFiles,
  type useFileCommandContext,
} from './file-commands';

export interface CommandItem {
  id: string;
  label: string;
  icon: LucideIcon;
  action: () => void | Promise<void>;
  shortcut?: string;
  disabled?: boolean;
  description?: string;
  checked?: boolean;
  danger?: boolean;
}
export interface CommandGroup {
  label: string;
  items: CommandItem[];
}
export interface MainMenu {
  id: string;
  label: string;
  groups: CommandGroup[];
}
type Context = ReturnType<typeof useFileCommandContext>;

export function fileMenu(context: Context, newFolder: () => void): MainMenu {
  return {
    id: 'file',
    label: '文件',
    groups: [
      {
        label: '打开与标签',
        items: [
          { id: 'open', label: '打开文件夹', icon: FolderOpen, shortcut: 'Ctrl+O', action: openFolder },
          {
            id: 'new-tab',
            label: '新建标签',
            icon: FilePlus2,
            shortcut: 'Ctrl+T',
            action: () => {
              window.dispatchEvent(new CustomEvent('explore:new-tab'));
            },
          },
          {
            id: 'close-tab',
            label: '关闭当前标签',
            icon: X,
            shortcut: 'Ctrl+W',
            action: () => {
              window.dispatchEvent(new CustomEvent('explore:close-tab'));
            },
          },
        ],
      },
      {
        label: '创建',
        items: [
          {
            id: 'new-folder',
            label: '新建文件夹',
            icon: FolderPlus,
            shortcut: 'F7',
            action: newFolder,
            disabled: !context.canCreate,
            description: context.canCreate ? undefined : '请先在文件面板中打开目录',
          },
        ],
      },
      { label: '应用', items: [{ id: 'quit', label: '退出', icon: LogOut, action: () => window.close() }] },
    ],
  };
}

export function editMenu(context: Context): MainMenu {
  return {
    id: 'edit',
    label: '编辑',
    groups: [
      {
        label: '跨栏整理',
        items: [
          {
            id: 'copy',
            label: `复制到${context.targetLabel}`,
            icon: Copy,
            shortcut: 'F5',
            action: () => transferFiles('copy'),
            disabled: !!context.transferReason,
            description: context.transferReason,
          },
          {
            id: 'move',
            label: `移动到${context.targetLabel}`,
            icon: ArrowRightLeft,
            shortcut: 'F6',
            action: () => transferFiles('move'),
            disabled: !!context.transferReason,
            description: context.transferReason,
          },
        ],
      },
      {
        label: '选择',
        items: [
          {
            id: 'select-all',
            label: '全选',
            icon: CheckSquare,
            shortcut: 'Ctrl+A',
            disabled: !context.isFilePanel,
            action: () => useFileStore.getState().selectAll(activeSide()),
          },
        ],
      },
      {
        label: '移除项目',
        items: [
          {
            id: 'delete',
            label: '删除',
            icon: Trash2,
            shortcut: 'F8',
            disabled: !context.canDelete,
            description: '移到回收站，可恢复',
            action: () => deleteFiles(),
          },
          {
            id: 'permanent-delete',
            label: '永久删除',
            icon: Trash2,
            shortcut: 'Shift+F8',
            disabled: !context.canDelete,
            danger: true,
            description: '不可从回收站恢复，需二次确认',
            action: () => deleteFiles(true),
          },
        ],
      },
    ],
  };
}

export function viewMenu(context: Context): MainMenu {
  const layout = useLayoutStore.getState();
  return {
    id: 'view',
    label: '查看',
    groups: [
      {
        label: '目录显示',
        items: [
          {
            id: 'hidden',
            label: '显示隐藏文件',
            icon: Eye,
            shortcut: 'Ctrl+H',
            checked: context.showHidden,
            disabled: !context.isFilePanel,
            action: () => useFileStore.getState().toggleHidden(activeSide()),
          },
          {
            id: 'refresh',
            label: '刷新',
            icon: RefreshCw,
            shortcut: 'Ctrl+R',
            disabled: !context.isFilePanel || !context.path,
            action: () => useFileStore.getState().refresh(activeSide()),
          },
        ],
      },
      {
        label: '面板布局',
        items: [
          {
            id: 'dual',
            label: '双栏布局',
            icon: Columns2,
            checked: context.mode === 'dual',
            action: () => layout.setMode(context.mode === 'dual' ? 'single' : 'dual'),
          },
          {
            id: 'focus-left',
            label: '聚焦左侧面板',
            icon: PanelLeft,
            action: () => layout.setActivePanel('left'),
          },
          {
            id: 'focus-right',
            label: '聚焦右侧面板',
            icon: PanelRight,
            disabled: context.mode !== 'dual',
            action: () => layout.setActivePanel('right'),
          },
        ],
      },
      {
        label: '扩展',
        items: [
          {
            id: 'plugins',
            label: '管理插件...',
            icon: Plug,
            action: () => useAppStore.getState().setShowPluginManager(true),
          },
        ],
      },
    ],
  };
}

export function helpMenu(): MainMenu {
  return {
    id: 'help',
    label: '帮助',
    groups: [
      {
        label: '使用 Explore',
        items: [
          {
            id: 'shortcuts',
            label: '快捷键与操作说明',
            icon: BookOpen,
            action: () =>
              appDialog.alert({
                title: '快捷键与操作说明',
                message:
                  'Ctrl+O  打开文件夹\nCtrl+T  新建标签\nCtrl+W  关闭当前预览或标签\nCtrl+P  搜索标签\nCtrl+Shift+W  搜索工作区\nCtrl+F  搜索文件或内容\nCtrl+Shift+F  全文搜索\n\nF5 / F6  复制 / 移动到另一侧的文件夹\nF7  新建文件夹\nF8  移到回收站\n\n拖拽默认为复制，按住 Shift 拖拽为移动，Ctrl 拖拽保持复制。',
              }),
          },
          {
            id: 'update',
            label: '检查更新...',
            icon: Download,
            action: () => useUpdateStore.getState().setOpen(true),
          },
        ],
      },
      {
        label: '诊断与支持',
        items: [
          {
            id: 'diagnostics',
            label: '复制诊断信息',
            icon: ListChecks,
            description: '分享前请检查其中的本机路径',
            action: async () => {
              await ipc.invoke('app:copyDiagnostics', {});
              await appDialog.alert({ message: '诊断信息已复制，包含版本、近期错误和相关本机路径。' });
            },
          },
          {
            id: 'logs',
            label: '打开日志目录',
            icon: Terminal,
            action: () => ipc.invoke('app:openLogs', undefined),
          },
        ],
      },
      {
        label: '应用信息',
        items: [
          {
            id: 'about',
            label: '关于 Explore',
            icon: Info,
            action: async () => {
              const version = await ipc.invoke('app:getVersion', undefined);
              await appDialog.alert({ title: '关于', message: `Explore v${version}\n双栏文件管理器` });
            },
          },
        ],
      },
    ],
  };
}
