import { memo, useCallback } from 'react';
import type { FileEntry } from '@explore/shared';
import { highlightMatches } from '../store';

interface FileRowProps {
  entry: FileEntry;
  isSelected: boolean;
  isActive: boolean;
  disableHover?: boolean;
  highlight?: string;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent, entry: FileEntry) => void;
}

export const FileRow = memo(function FileRow({
  entry,
  isSelected,
  isActive,
  disableHover,
  highlight,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
}: FileRowProps) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.effectAllowed = 'copyMove';
      onDragStart(e, entry);
    },
    [entry, onDragStart],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(e);
    },
    [onClick],
  );

  const icon = entry.isDirectory ? '📁' : getFileIcon(entry.name);
  const sizeStr = formatSize(entry.size);
  const segments = highlightMatches(entry.name, highlight ?? '');

  return (
    <div
      className={`flex items-center h-7 px-2 text-sm cursor-pointer select-none outline-none focus-visible:outline-none ${
        isSelected
          ? 'bg-accent/40 text-white'
          : isActive
            ? 'bg-accent/20'
            : disableHover
              ? ''
              : 'hover:bg-surface-lighter'
      }`}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={handleDragStart}
      draggable
      role="row"
    >
      <span className="w-5 text-center flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate ml-1" title={entry.name}>
        {segments.map((seg, i) =>
          seg.match ? (
            <span key={i} className="text-yellow-400 font-bold">
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>
      {!entry.isDirectory && (
        <span className="w-20 text-right text-text-muted flex-shrink-0 ml-2">
          {sizeStr}
        </span>
      )}
      <span className="w-36 text-right text-text-muted flex-shrink-0 ml-2">
        {formatDate(entry.modifiedAt)}
      </span>
    </div>
  );
});

// ── helpers ──

const FILE_ICONS: Record<string, string> = {
  '.ts': '🔷',
  '.tsx': '⚛️',
  '.js': '🟨',
  '.jsx': '⚛️',
  '.json': '📋',
  '.md': '📝',
  '.css': '🎨',
  '.html': '🌐',
  '.png': '🖼️',
  '.jpg': '🖼️',
  '.jpeg': '🖼️',
  '.gif': '🖼️',
  '.svg': '🖼️',
  '.pdf': '📄',
  '.zip': '📦',
  '.gz': '📦',
  '.tar': '📦',
  '.exe': '⚙️',
  '.dll': '🔧',
  '.py': '🐍',
  '.rs': '🦀',
  '.go': '🔵',
  '.java': '☕',
  '.gitignore': '🙈',
  '.env': '🔒',
};

function getFileIcon(name: string): string {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return FILE_ICONS[ext] ?? '📄';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
