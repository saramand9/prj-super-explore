import type { FileConflictStrategy, FileEntry, FileOpResult } from '@explore/shared';

export function hasFileOpIssues(result: FileOpResult): boolean {
  return !result.success || !!result.renamed?.length;
}

export function summarizeFileOpResult(action: string, result: FileOpResult): string | null {
  const actionName = formatAction(action);
  const completed = result.completed?.length ?? 0;
  const skipped = result.skipped?.length ?? 0;
  const failed = result.failures?.length ?? 0;
  const renamed = result.renamed?.length ?? 0;

  if (result.success && renamed === 0) return null;

  const lines: string[] = [];
  if (result.success) {
    lines.push(`${actionName}已完成。`);
  } else {
    lines.push(`${actionName}未完全完成。`);
  }

  const counts: string[] = [];
  if (completed) counts.push(`已处理 ${completed} 项`);
  if (renamed) counts.push(`自动重命名 ${renamed} 项`);
  if (skipped) counts.push(`已跳过 ${skipped} 项`);
  if (failed) counts.push(`失败 ${failed} 项`);
  if (counts.length) lines.push(counts.join('，'));

  for (const item of result.renamed?.slice(0, 5) ?? []) {
    lines.push(`已重命名：${basename(item.source)} -> ${basename(item.dest)}`);
  }

  for (const failure of result.failures?.slice(0, 5) ?? []) {
    lines.push(`${basename(failure.path)}：${formatFailureReason(failure.reason)}`);
  }

  if (failed > 5) lines.push(`还有 ${failed - 5} 个失败项未显示`);
  return lines.join('\n');
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function formatAction(action: string): string {
  const map: Record<string, string> = {
    Copy: '复制',
    Move: '移动',
    Delete: '删除',
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

  const names = conflicts.slice(0, 8).map((entry) => entry.name).join('\n');
  const extra = conflicts.length > 8 ? `\n还有 ${conflicts.length - 8} 项未显示` : '';
  return choose(`目标位置已有 ${conflicts.length} 个同名项目：\n${names}${extra}`);
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

  const names = conflicts.slice(0, 8).map((entry) => entry.name).join('\n');
  const extra = conflicts.length > 8 ? `\n还有 ${conflicts.length - 8} 项未显示` : '';
  const proceed = await confirmChoice(
    `目标位置已有同名项目：\n${names}${extra}\n\n选择“确定”继续，选择“取消”停止。`,
  );
  if (!proceed) return null;
  const overwrite = await confirmChoice('是否覆盖已有项目？\n\n确定 = 覆盖\n取消 = 自动重命名');
  return overwrite ? 'overwrite' : 'rename';
}
