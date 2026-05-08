import { useEffect, useRef } from 'react';
import { useViewerStore } from '../store';
import { useLayoutStore } from '../../../framework/store/layout-store';

export function TextViewer({ side }: { side: 'left' | 'right' }) {
  const containerRef = useRef<HTMLPreElement>(null);
  const filePath = useLayoutStore((s) => s.layout[side].path);
  const content = useViewerStore((s) => s.content);
  const loading = useViewerStore((s) => s.loading);
  const error = useViewerStore((s) => s.error);
  const loadFile = useViewerStore((s) => s.loadFile);

  useEffect(() => {
    if (filePath) {
      loadFile(filePath);
    }
  }, [filePath, loadFile]);

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        No file selected
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-red-400 text-sm px-4 text-center">
        {error}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#1e1e2e]">
      <div className="flex-shrink-0 px-3 py-1 border-b border-border text-xs text-text-muted truncate">
        {filePath}
      </div>
      <pre
        ref={containerRef}
        className="flex-1 overflow-auto p-4 text-sm text-text-primary font-mono whitespace-pre-wrap break-words select-text"
      >
        {content}
      </pre>
    </div>
  );
}
