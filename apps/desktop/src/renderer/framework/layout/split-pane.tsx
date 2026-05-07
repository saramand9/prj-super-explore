import { useCallback, useRef, useState, type MouseEvent, type ReactNode, Children } from 'react';

interface SplitPaneProps {
  direction?: 'horizontal' | 'vertical';
  defaultSplit?: number;
  minSize?: number;
  children: ReactNode;
  className?: string;
}

export function SplitPane({
  direction = 'horizontal',
  defaultSplit = 50,
  minSize = 150,
  children,
  className = '',
}: SplitPaneProps) {
  const [split, setSplit] = useState(defaultSplit);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const childArray = Children.toArray(children);

  const isHorizontal = direction === 'horizontal';

  const handleMouseDown = useCallback((e: MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (ev: globalThis.MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pos = isHorizontal ? ev.clientX - rect.left : ev.clientY - rect.top;
      const size = isHorizontal ? rect.width : rect.height;
      const percent = (pos / size) * 100;
      const minPercent = (minSize / size) * 100;
      setSplit(Math.max(minPercent, Math.min(100 - minPercent, percent)));
    };

    const handleMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [isHorizontal, minSize]);

  return (
    <div
      ref={containerRef}
      className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} h-full w-full ${className}`}
    >
      <div
        style={{ [isHorizontal ? 'width' : 'height']: `${split}%` }}
        className="overflow-hidden"
      >
        {childArray[0]}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className={`flex-shrink-0 ${
          isHorizontal
            ? 'w-[3px] cursor-col-resize hover:w-[5px]'
            : 'h-[3px] cursor-row-resize hover:h-[5px]'
        } bg-[#4a4a6a] hover:bg-accent transition-all`}
      />

      <div
        style={{ [isHorizontal ? 'width' : 'height']: `${100 - split}%` }}
        className="overflow-hidden"
      >
        {childArray[1]}
      </div>
    </div>
  );
}
