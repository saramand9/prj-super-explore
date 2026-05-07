import { memo, useCallback } from 'react';
import type { FileEntry } from '@explore/shared';

interface FileRowProps {
  entry: FileEntry;
  isSelected: boolean;
  isActive: boolean;
  highlight?: string;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/** 分割文件名，匹配部分单独标记 */
function splitMatch(name: string, pattern: string): { text: string; match: boolean }[] {
  if (!pattern) return [{ text: name, match: false }];

  const result: { text: string; match: boolean }[] = [];
  const lowerName = name.toLowerCase();
  const lowerPattern = pattern.toLowerCase();
  let cursor = 0;

  while (cursor < name.length) {
    const idx = lowerName.indexOf(lowerPattern, cursor);
    if (idx === -1) {
      result.push({ text: name.slice(cursor), match: false });
      break;
    }
    if (idx > cursor) {
      result.push({ text: name.slice(cursor, idx), match: false });
    }
    result.push({ text: name.slice(idx, idx + pattern.length), match: true });
    cursor = idx + pattern.length;
  }

  return result;
}

export const FileRow = memo(function FileRow({
  entry,
  isSelected,
  isActive,
  highlight,
  onClick,
  onDoubleClick,
  onContextMenu,
}: FileRowProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(e);
    },
    [onClick],
  );

  const icon = entry.isDirectory ? '📁' : getFileIcon(entry.name);
  const sizeStr = formatSize(entry.size);
  const segments = splitMatch(entry.name, highlight ?? '');

  return (
    <div
      className={`flex items-center h-7 px-2 text-sm cursor-pointer select-none ${
        isSelected
          ? 'bg-accent/40 text-white'
          : isActive
            ? 'bg-accent/20'
            : 'hover:bg-surface-lighter'
      }`}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      role="row"
      tabIndex={0}
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
