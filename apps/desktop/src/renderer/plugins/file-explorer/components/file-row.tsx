import { memo, useCallback, useMemo } from 'react';
import type { FileEntry, DirSizeResult } from '@explore/shared';
import { highlightMatches } from '../store';
import { getFileTypeLabel } from '../utils/file-entry-type';
import { getFileDropEffect } from '../utils/file-drag';
import {
  Folder,
  File,
  FileCode,
  FileJson,
  FileText,
  FileImage,
  FileArchive,
  Cog,
  Palette,
  Globe,
  EyeOff,
  Lock,
} from 'lucide-react';

interface FileRowProps {
  entry: FileEntry;
  index: number;
  isSelected: boolean;
  isActive: boolean;
  disableHover?: boolean;
  highlight?: string;
  dirSize?: DirSizeResult;
  onClick: (entry: FileEntry, index: number, e: React.MouseEvent) => void;
  onDoubleClick: (entry: FileEntry, index: number) => void;
  onContextMenu: (entry: FileEntry, index: number, e: React.MouseEvent) => void;
  onDragStart: (entry: FileEntry, index: number, e: React.DragEvent) => void;
  onDrop: (entry: FileEntry, index: number, e: React.DragEvent) => void;
  onDragEnterRow?: (entry: FileEntry, index: number) => void;
  onDragLeaveRow?: () => void;
  dragOver?: boolean;
  dropFlash?: boolean;
}

export const FileRow = memo(function FileRow({
  entry,
  index,
  isSelected,
  isActive,
  disableHover,
  highlight,
  dirSize,
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
      onDragStart(entry, index, e);
    },
    [entry, index, onDragStart],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      onClick(entry, index, e);
    },
    [entry, index, onClick],
  );

  const Icon = entry.isDirectory ? Folder : getFileIcon(entry.name);
  const iconColor = entry.isDirectory ? 'text-accent/70' : 'text-text-muted';
  const sz = entry.isDirectory ? (dirSize?.size ?? 0) : entry.size;
  const sizeStr = useMemo(() => formatSize(sz), [sz]);
  const segments = useMemo(
    () => (highlight ? highlightMatches(entry.name, highlight) : null),
    [entry.name, highlight],
  );
  const typeLabel = useMemo(() => getFileTypeLabel(entry), [entry]);
  const typeSegments = useMemo(
    () => (highlight ? highlightMatches(typeLabel, highlight) : null),
    [typeLabel, highlight],
  );
  const modifiedAt = useMemo(() => formatDate(entry.modifiedAt), [entry.modifiedAt]);

  return (
    <div
      className={`file-table-row file-table-columns h-full items-center py-0.5 px-2 text-sm cursor-pointer select-none outline-none focus-visible:outline-none ${
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
      onDoubleClick={() => onDoubleClick(entry, index)}
      onContextMenu={(e) => onContextMenu(entry, index, e)}
      onDragStart={handleDragStart}
      onDragOver={
        entry.isDirectory
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = getFileDropEffect(e);
            }
          : undefined
      }
      onDragEnter={
        entry.isDirectory
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragEnterRow?.(entry, index);
            }
          : undefined
      }
      onDragLeave={
        entry.isDirectory
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onDragLeaveRow?.();
            }
          : undefined
      }
      onDrop={
        entry.isDirectory
          ? (e) => {
              e.stopPropagation();
              e.preventDefault();
              onDrop(entry, index, e);
            }
          : undefined
      }
      draggable
      role="row"
      style={{ contain: 'layout paint style' }}
    >
      <span className="text-center">
        <Icon className={`w-4 h-4 inline-block ${iconColor}`} />
      </span>
      <span className="file-table-name min-w-0 truncate" title={entry.name}>
        {segments
          ? segments.map((seg, i) =>
              seg.match ? (
                <span key={i} className="text-green font-bold">
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )
          : entry.name}
      </span>
      <span className="file-table-type min-w-0 truncate text-text-secondary" title={typeLabel}>
        {typeSegments
          ? typeSegments.map((seg, i) =>
              seg.match ? (
                <span key={i} className="text-green font-bold">
                  {seg.text}
                </span>
              ) : (
                <span key={i}>{seg.text}</span>
              ),
            )
          : typeLabel}
      </span>
      <span className="file-table-size text-right text-text-secondary tabular-nums">
        {entry.isDirectory ? (
          dirSize === undefined ? (
            <span className="text-text-muted/40">...</span>
          ) : (
            <span title={dirSize.partial ? '目录大小仍在后台统计中' : undefined}>
              {dirSize.partial ? `~${sizeStr}` : sizeStr}
            </span>
          )
        ) : (
          sizeStr
        )}
      </span>
      <span className="file-table-date text-right text-text-secondary tabular-nums" title={modifiedAt}>
        <span className="file-table-date-full">{modifiedAt}</span>
        <span className="file-table-date-short">{modifiedAt.slice(0, 10)}</span>
      </span>
    </div>
  );
});

const FILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  '.ts': FileCode,
  '.tsx': FileCode,
  '.js': FileCode,
  '.jsx': FileCode,
  '.json': FileJson,
  '.md': FileText,
  '.css': Palette,
  '.html': Globe,
  '.htm': Globe,
  '.png': FileImage,
  '.jpg': FileImage,
  '.jpeg': FileImage,
  '.gif': FileImage,
  '.svg': FileImage,
  '.webp': FileImage,
  '.pdf': FileText,
  '.zip': FileArchive,
  '.gz': FileArchive,
  '.tar': FileArchive,
  '.rar': FileArchive,
  '.7z': FileArchive,
  '.exe': Cog,
  '.dll': Cog,
  '.so': Cog,
  '.py': FileCode,
  '.rs': FileCode,
  '.go': FileCode,
  '.java': FileCode,
  '.rb': FileCode,
  '.php': FileCode,
  '.gitignore': EyeOff,
  '.env': Lock,
};

function getFileIcon(name: string): React.ComponentType<{ className?: string }> {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return FILE_ICONS[ext] ?? File;
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
