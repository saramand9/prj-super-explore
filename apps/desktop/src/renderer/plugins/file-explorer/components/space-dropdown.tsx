import { useRef, useState } from 'react';
import { ChevronDown, Layers } from 'lucide-react';
import { useSpaceStore } from '../space-store';
import { getSpaceOverview } from '../utils/space-display';
import { getWorkspaceDisplayName, WorkspaceSwitcher } from './workspace-switcher';

export function SpaceDropdown() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const spaces = useSpaceStore((state) => state.spaces);
  const activeSpaceId = useSpaceStore((state) => state.activeSpaceId);
  const activeSpace = spaces.find((space) => space.id === activeSpaceId);
  const overview = activeSpace ? getSpaceOverview(activeSpace) : null;

  const title = activeSpace
    ? `工作区：${getWorkspaceDisplayName(activeSpace)}\n左侧：${overview?.leftPath ?? '未打开'}\n右侧：${overview?.rightPath ?? '未打开'}\n搜索工作区 (Ctrl+Shift+W)`
    : '切换工作区 (Ctrl+Shift+W)';

  return (
    <>
      <button
        ref={buttonRef}
        data-testid="workspace-menu-trigger"
        className="mr-1 flex h-7 flex-shrink-0 items-center gap-1.5 rounded border border-border bg-surface px-2 text-xs text-text-primary transition-colors hover:border-accent/40 hover:bg-surface-lighter"
        onClick={() => setOpen((value) => !value)}
        title={title}
        aria-expanded={open}
        aria-label={`切换工作区：${activeSpace ? getWorkspaceDisplayName(activeSpace) : '默认工作区'}`}
        aria-haspopup="dialog"
      >
        <Layers className="h-3.5 w-3.5 flex-shrink-0 text-accent" />
        <span className="max-w-[160px] truncate font-medium">{activeSpace ? getWorkspaceDisplayName(activeSpace) : '默认工作区'}</span>
        {overview && (
          <span className="hidden rounded-sm bg-surface-lighter px-1 text-[0.6875rem] tabular-nums text-text-secondary lg:inline" aria-label={`${overview.pathCount} 个目录`}>
            {overview.pathCount}
          </span>
        )}
        <ChevronDown className="h-3 w-3 flex-shrink-0 text-text-muted" />
      </button>

      <WorkspaceSwitcher
        open={open}
        onClose={() => setOpen(false)}
        variant="anchored"
        anchorRef={buttonRef}
      />
    </>
  );
}
