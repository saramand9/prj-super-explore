import type { FileEntry } from '@explore/shared';

const SPECIAL_DOTFILE_TYPES = new Map<string, string>([
  ['.env', 'ENV'],
  ['.gitignore', 'GITIGNORE'],
]);

export function getFileTypeLabel(entry: Pick<FileEntry, 'name' | 'isDirectory'>): string {
  if (entry.isDirectory) return '文件夹';

  const type = getFileTypeToken(entry.name);
  return type ? `${type} 文件` : '文件';
}

export function getFileTypeSearchText(entry: Pick<FileEntry, 'name' | 'isDirectory'>): string {
  const label = getFileTypeLabel(entry).toLowerCase();
  const type = getFileTypeToken(entry.name).toLowerCase();
  return type ? `${label} ${type} .${type}` : label;
}

function getFileTypeToken(name: string): string {
  const lower = name.toLowerCase();
  const specialType = SPECIAL_DOTFILE_TYPES.get(lower);
  if (specialType) return specialType;

  const dotIndex = name.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === name.length - 1) return '';
  return name.slice(dotIndex + 1).toUpperCase();
}
