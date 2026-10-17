import { ArrowRight, ArrowRightLeft, Copy, FolderOpen, FolderPlus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { SpaceDropdown } from '../plugins/file-explorer/components/space-dropdown';
import { deleteFiles, openFolder, runCommand, transferFiles, useFileCommandContext } from './file-commands';
import { useFolderDialog } from './folder-name-dialog';

export function Toolbar() {
  const context = useFileCommandContext();
  const folder = useFolderDialog();
  const targetName =
    context.targetPath
      ?.replace(/[/\\]+$/, '')
      .split(/[/\\]/)
      .pop() || context.targetPath;
  return (
    <>
      <div data-testid="global-toolbar" role="toolbar" aria-label="文件操作" className="command-toolbar">
        <div className="command-toolbar__workspace">
          <SpaceDropdown />
        </div>
        <div className="command-toolbar__group" role="group" aria-label="打开与创建">
          <ToolbarButton
            icon={FolderOpen}
            label="打开"
            title="打开文件夹 (Ctrl+O)"
            primary
            action={openFolder}
          />
          <ToolbarButton
            icon={FolderPlus}
            label="新建文件夹"
            title="新建文件夹 (F7)"
            disabled={!context.canCreate}
            action={folder.open}
          />
        </div>
        <div className="command-toolbar__group" role="group" aria-label="跨栏整理">
          <ToolbarButton
            icon={Copy}
            label={`复制到${context.targetLabel}`}
            title={context.transferReason ?? `复制到${context.targetLabel}：${context.targetPath} (F5)`}
            disabled={!!context.transferReason}
            action={() => transferFiles('copy')}
          />
          <ToolbarButton
            icon={ArrowRightLeft}
            label={`移动到${context.targetLabel}`}
            title={context.transferReason ?? `移动到${context.targetLabel}：${context.targetPath} (F6)`}
            disabled={!!context.transferReason}
            action={() => transferFiles('move')}
          />
          {context.mode === 'dual' && (
            <span
              data-testid="transfer-destination"
              className="command-toolbar__destination"
              title={context.targetPath ?? '尚未打开目标目录'}
            >
              <ArrowRight size={12} />
              {targetName ?? '选择目标目录'}
            </span>
          )}
        </div>
        <div className="command-toolbar__group" role="group" aria-label="移除">
          <ToolbarButton
            icon={Trash2}
            label="删除"
            title="移到回收站 (F8)"
            disabled={!context.canDelete}
            action={() => deleteFiles()}
            danger
          />
        </div>
        <span className="command-toolbar__context" aria-live="polite">
          <span className="command-toolbar__panel">{context.side === 'left' ? '左侧' : '右侧'}</span>
          {context.selected
            ? `已选 ${context.selected} 项`
            : !context.isFilePanel
              ? '工具面板'
              : context.path
                ? '未选择项目'
                : '未打开目录'}
        </span>
      </div>
      {folder.dialog}
    </>
  );
}

function ToolbarButton({
  icon: Icon,
  label,
  title,
  action,
  disabled,
  primary,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  action: () => void | Promise<void>;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={`command-button${primary ? ' command-button--primary' : ''}${danger ? ' command-button--danger' : ''}`}
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={() => void runCommand(action)}
    >
      <Icon size={16} strokeWidth={1.7} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
