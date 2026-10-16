import { useCallback } from 'react';
import { useFileStore } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';

interface BreadcrumbBarProps {
  side: 'left' | 'right';
}

/** 路径面包屑：点击每一级目录跳转 + 后退/前进 */
export function BreadcrumbBar({ side }: BreadcrumbBarProps) {
  const path = useFileStore((s) => s[side].path);
  const backStack = useFileStore((s) => s[side].backStack);
  const forwardStack = useFileStore((s) => s[side].forwardStack);
  const navigateTo = useFileStore((s) => s.navigateTo);
  const goBackFn = useFileStore((s) => s.goBack);
  const goForwardFn = useFileStore((s) => s.goForward);

  const syncLayout = useCallback(
    (newPath: string) => {
      useLayoutStore.getState().setPanelPath(side, newPath);
    },
    [side],
  );

  const handleBack = useCallback(async () => {
    await goBackFn(side);
    // goBack 之后 path 已更新，从 store 读最新 path 同步到 layout
    const newPath = useFileStore.getState()[side].path;
    if (newPath) syncLayout(newPath);
  }, [side, goBackFn, syncLayout]);

  const handleForward = useCallback(async () => {
    await goForwardFn(side);
    const newPath = useFileStore.getState()[side].path;
    if (newPath) syncLayout(newPath);
  }, [side, goForwardFn, syncLayout]);

  const handleClick = useCallback(
    (fullPath: string) => {
      navigateTo(side, fullPath);
      syncLayout(fullPath);
    },
    [side, navigateTo, syncLayout],
  );

  if (!path) return null;

  const sep = path.includes('\\') ? '\\' : '/';
  const segments = path.split(sep).filter(Boolean);

  // 构建面包屑片段
  const parts: { label: string; fullPath: string }[] = [];
  if (/^[A-Za-z]:$/.test(segments[0])) {
    parts.push({ label: segments[0] + sep, fullPath: segments[0] + sep });
    for (let i = 1; i < segments.length; i++) {
      const fullPath = parts[parts.length - 1].fullPath + segments[i] + sep;
      parts.push({ label: segments[i], fullPath });
    }
  } else {
    let accumulated = '';
    for (const seg of segments) {
      accumulated += sep + seg;
      parts.push({ label: seg, fullPath: accumulated });
    }
  }

  return (
    <div className="flex items-center gap-0.5 text-xs overflow-x-auto whitespace-nowrap scrollbar-none">
      {/* 后退 */}
      <button
        className={`px-0.5 cursor-pointer ${
          backStack.length > 0 ? 'text-text-secondary hover:text-accent' : 'text-text-muted/30 cursor-default'
        }`}
        onClick={backStack.length > 0 ? handleBack : undefined}
        title="Back (Backspace when no filter)"
        disabled={backStack.length === 0}
      >
        ◀
      </button>

      {/* 前进 */}
      <button
        className={`px-0.5 cursor-pointer mr-1 ${
          forwardStack.length > 0
            ? 'text-text-secondary hover:text-accent'
            : 'text-text-muted/30 cursor-default'
        }`}
        onClick={forwardStack.length > 0 ? handleForward : undefined}
        title="Forward"
        disabled={forwardStack.length === 0}
      >
        ▶
      </button>

      {/* 面包屑 */}
      {parts.map((part, i) => (
        <span key={part.fullPath} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-text-muted/50">{sep}</span>}
          <button
            className={`hover:text-accent cursor-pointer truncate max-w-[200px] ${
              i === parts.length - 1 ? 'text-text-primary font-medium' : 'text-text-secondary'
            }`}
            onClick={() => handleClick(part.fullPath)}
            title={part.fullPath}
          >
            {part.label}
          </button>
        </span>
      ))}
    </div>
  );
}
