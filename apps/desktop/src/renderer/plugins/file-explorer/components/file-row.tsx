import { memo, useCallback } from 'react';
import type { FileEntry } from '@explore/shared';
import { highlightMatches } from '../store';
import {
  Folder, File, FileCode, FileJson, FileText, FileImage,
  FileArchive, Cog, Palette, Globe, EyeOff, Lock,
} from 'lucide-react';

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
  onDrop: (e: React.DragEvent, entry: FileEntry) => void;
  onDragEnterRow?: (entry: FileEntry) => void;
  onDragLeaveRow?: () => void;
  dragOver?: boolean;
  dropFlash?: boolean;
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
  onDrop,
  onDragEnterRow,
  onDragLeaveRow,
  dragOver,
  dropFlash,
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

  const Icon = entry.isDirectory ? Folder : getFileIcon(entry.name);
  const iconColor = entry.isDirectory ? 'text-accent/70' : 'text-text-muted';
  const sizeStr = formatSize(entry.size);
  const segments = highlightMatches(entry.name, highlight ?? '');

  return (
    <div
      className={`flex items-center py-0.5 px-2 text-sm cursor-pointer select-none outline-none focus-visible:outline-none transition-colors ${
        isSelected
          ? 'bg-accent/40 text-white'
          : isActive
            ? 'bg-accent/20'
            : dragOver
              ? 'bg-green/30 ring-1 ring-accent/50'
              : dropFlash
                ? 'bg-green/50'
                : disableHover
                  ? ''
                  : 'hover:bg-surface-lighter'
      }`}
      onClick={handleClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={handleDragStart}
      onDragOver={entry.isDirectory ? (e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; } : undefined}
      onDragEnter={entry.isDirectory ? (e) => { e.preventDefault(); e.stopPropagation(); onDragEnterRow?.(entry); } : undefined}
      onDragLeave={entry.isDirectory ? (e) => { e.preventDefault(); e.stopPropagation(); onDragLeaveRow?.(); } : undefined}
      onDrop={entry.isDirectory ? (e) => { e.stopPropagation(); e.preventDefault(); onDrop(e, entry); } : undefined}
      draggable
      role="row"
    >
      <span className="w-5 text-center flex-shrink-0">
        <Icon className={`w-4 h-4 inline-block ${iconColor}`} />
      </span>
      <span className="flex-1 truncate ml-1" title={entry.name}>
        {segments.map((seg, i) =>
          seg.match ? (
            <span key={i} className="text-green font-bold">
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

const FILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '.ts': FileCode, '.tsx': FileCode, '.js': FileCode, '.jsx': FileCode,
  '.json': FileJson,
  '.md': FileText,
  '.css': Palette,
  '.html': Globe, '.htm': Globe,
  '.png': FileImage, '.jpg': FileImage, '.jpeg': FileImage,
  '.gif': FileImage, '.svg': FileImage, '.webp': FileImage,
  '.pdf': FileText,
  '.zip': FileArchive, '.gz': FileArchive, '.tar': FileArchive,
  '.rar': FileArchive, '.7z': FileArchive,
  '.exe': Cog, '.dll': Cog, '.so': Cog,
  '.py': FileCode, '.rs': FileCode, '.go': FileCode,
  '.java': FileCode, '.rb': FileCode, '.php': FileCode,
  '.gitignore': EyeOff, '.env': Lock,
};

function getFileIcon(name: string): React.ComponentType<{ className?: string }> {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return FILE_ICONS[ext] ?? File;
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
