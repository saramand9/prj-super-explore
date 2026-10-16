import type { FileConflictStrategy, FileEntry, FileOpResult } from '@explore/shared';

export function hasFileOpIssues(result: FileOpResult): boolean {
  return shouldShowFileOpDialog(result) || fileOpHasPolicyOutcome(result);
}

export function shouldShowFileOpDialog(result: FileOpResult): boolean {
  return !!result.cancelled || (result.failures?.length ?? 0) > 0;
}

export function fileOpHasPolicyOutcome(result: FileOpResult): boolean {
  return (
    (result.renamed?.length ?? 0) > 0 ||
    (result.replaced?.length ?? 0) > 0 ||
    (result.skipped?.length ?? 0) > 0
  );
}

export function summarizeFileOpResult(action: string, result: FileOpResult): string | null {
  if (!shouldShowFileOpDialog(result)) return null;

  const actionName = formatAction(action);
  const completed = result.completed?.length ?? 0;
  const skipped = result.skipped?.length ?? 0;
  const failed = result.failures?.length ?? 0;
  const renamed = result.renamed?.length ?? 0;
  const replaced = result.replaced?.length ?? 0;

  if (result.success && completed === 0 && renamed === 0 && replaced === 0 && skipped === 0 && failed === 0) {
    return null;
  }

  const lines: string[] = [];
  if (result.cancelled) {
    lines.push(`${actionName}已取消。`);
  } else if (result.success) {
    lines.push(`${actionName}已完成。`);
  } else {
    lines.push(`${actionName}未完全完成。`);
  }

  const counts: string[] = [];
  if (completed) counts.push(`已处理 ${completed} 项`);
  if (renamed) counts.push(`自动重命名 ${renamed} 项`);
  if (replaced) counts.push(`覆盖 ${replaced} 项`);
  if (skipped) counts.push(`已跳过 ${skipped} 项`);
  if (failed) counts.push(`失败 ${failed} 项`);
  if (counts.length) lines.push(counts.join('，'));

  for (const item of result.renamed ?? []) {
    lines.push(`已重命名：${basename(item.source)} -> ${basename(item.dest)}`);
  }

  for (const item of result.replaced ?? []) {
    lines.push(`已覆盖：${basename(item.path)}，原目标已移入回收站`);
  }

  for (const item of result.skipped ?? []) {
    lines.push(`已跳过：${basename(item)}`);
  }

  for (const failure of result.failures ?? []) {
    lines.push(`${basename(failure.path)}：${formatFailureReason(failure.reason)}`);
  }

  return lines.join('\n');
}

export function summarizeFileOpToast(action: string, result: FileOpResult): string {
  const actionName = formatAction(action);
  const completed = result.completed?.length ?? 0;
  const skipped = result.skipped?.length ?? 0;
  const renamed = result.renamed?.length ?? 0;
  const replaced = result.replaced?.length ?? 0;

  const parts: string[] = [];
  if (completed) parts.push(`${completed} 项`);
  if (renamed) parts.push(`自动重命名 ${renamed} 项`);
  if (replaced) parts.push(`覆盖 ${replaced} 项`);
  if (skipped) parts.push(`跳过 ${skipped} 项`);

  return parts.length > 0 ? `${actionName}完成：${parts.join('，')}` : `${actionName}完成`;
}

export function getFileOpToastType(result: FileOpResult): 'info' | 'warn' | 'error' {
  if ((result.failures?.length ?? 0) > 0) return 'error';
  if (result.cancelled) return 'warn';
  return fileOpHasPolicyOutcome(result) ? 'warn' : 'info';
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    Copy: '复制',
    Move: '移动',
    Delete: '删除',
    PermanentDelete: '永久删除',
  };
  return map[action] ?? action;
}

function formatFailureReason(reason: string): string {
  const map: Record<string, string> = {
    'Cannot copy a folder into itself': '不能把文件夹复制到它自己里面',
    'Cannot move a folder into itself': '不能把文件夹移动到它自己里面',
    'Copy failed': '复制失败',
    'Move failed': '移动失败',
    'Delete failed': '删除失败',
    'Destination already exists': '目标已存在',
  };
  return map[reason] ?? reason;
}

export async function resolveCopyConflictStrategy(
  sources: string[],
  destDir: string,
  readDir: (path: string) => Promise<FileEntry[]>,
  choose: (message: string) => Promise<FileConflictStrategy | null>,
): Promise<FileConflictStrategy | null> {
  const sourceNames = new Set(sources.map((source) => basename(source).toLowerCase()));
  const destEntries = await readDir(destDir);
  const conflicts = destEntries.filter((entry) => sourceNames.has(entry.name.toLowerCase()));

  if (conflicts.length === 0) return 'rename';

  const names = conflicts
    .slice(0, 8)
    .map((entry) => entry.name)
    .join('\n');
  const extra = conflicts.length > 8 ? `\n还有 ${conflicts.length - 8} 项未显示` : '';
  return choose(
    `目标位置已有 ${conflicts.length} 个同名项目：\n${names}${extra}\n\n请选择对本次操作中所有同名项目应用的策略。`,
  );
}

export async function resolveCopyConflictStrategyWithChoice(
  sources: string[],
  destDir: string,
  readDir: (path: string) => Promise<FileEntry[]>,
  choose: (
    message: string,
    buttons: { id: FileConflictStrategy | 'cancel'; label: string }[],
  ) => Promise<string | null>,
): Promise<FileConflictStrategy | null> {
  const sourceNames = new Set(sources.map((source) => basename(source).toLowerCase()));
  const destEntries = await readDir(destDir);
  const conflicts = destEntries.filter((entry) => sourceNames.has(entry.name.toLowerCase()));

  if (conflicts.length === 0) return 'rename';

  const names = conflicts
    .slice(0, 8)
    .map((entry) => entry.name)
    .join('\n');
  const extra = conflicts.length > 8 ? `\n还有 ${conflicts.length - 8} 项未显示` : '';
  const choice = await choose(
    `目标位置已有 ${conflicts.length} 个同名项目：\n${names}${extra}\n\n请选择对本次操作中所有同名项目应用的策略。`,
    [
      { id: 'skip', label: '跳过全部同名' },
      { id: 'rename', label: '自动重命名全部' },
      { id: 'overwrite', label: '覆盖全部' },
      { id: 'cancel', label: '取消' },
    ],
  );
  if (choice === 'skip' || choice === 'rename' || choice === 'overwrite' || choice === 'error') {
    return choice;
  }
  return null;
}

export async function resolveCopyConflictStrategyWithConfirm(
  sources: string[],
  destDir: string,
  readDir: (path: string) => Promise<FileEntry[]>,
  confirmChoice: (message: string) => Promise<boolean>,
): Promise<FileConflictStrategy | null> {
  const sourceNames = new Set(sources.map((source) => basename(source).toLowerCase()));
  const destEntries = await readDir(destDir);
  const conflicts = destEntries.filter((entry) => sourceNames.has(entry.name.toLowerCase()));

  if (conflicts.length === 0) return 'rename';

  const names = conflicts
    .slice(0, 8)
    .map((entry) => entry.name)
    .join('\n');
  const extra = conflicts.length > 8 ? `\n还有 ${conflicts.length - 8} 项未显示` : '';
  const proceed = await confirmChoice(
    `目标位置已有同名项目：\n${names}${extra}\n\n确定 = 为本次操作自动重命名全部同名项目\n取消 = 停止操作`,
  );
  if (!proceed) return null;
  return 'rename';
}
