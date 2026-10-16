import { lstat, opendir, realpath, stat } from 'fs/promises';
import { join, resolve } from 'path';
import type { FileEntry, ScanSummary } from '@explore/shared';

export const SCAN_ENTRY_LIMIT = 200_000;
const EXCLUDED = ['node_modules', '.git', '$RECYCLE.BIN', 'System Volume Information'];

export interface WalkOptions {
  signal?: AbortSignal;
  maxDepth?: number;
  maxEntries?: number;
  excludePatterns?: string[];
  includeHidden?: boolean;
  onBatch: (entries: FileEntry[], summary: ScanSummary) => void | Promise<void>;
}

/** One bounded queue for the whole tree; never recurse through a child link or junction. */
export async function walkDirectory(root: string, options: WalkOptions): Promise<ScanSummary> {
  const summary: ScanSummary = {
    scanned: 0,
    directories: 0,
    skipped: 0,
    cancelled: false,
    truncated: false,
    warnings: [],
  };
  const queue = [{ path: resolve(root), depth: 0 }];
  const seen = new Set<string>();
  const excluded = new Set([...EXCLUDED, ...(options.excludePatterns ?? [])]);
  const patterns = [...excluded]
    .filter((pattern) => /[*?]/.test(pattern))
    .map(
      (pattern) =>
        new RegExp(
          `^${pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')}$`,
        ),
    );
  const limit = options.maxEntries ?? SCAN_ENTRY_LIMIT;
  let batch: FileEntry[] = [];
  let lastFlush = Date.now();
  const snapshot = () => ({ ...summary, warnings: [...summary.warnings] });
  const flush = async () => {
    const entries = batch;
    batch = [];
    lastFlush = Date.now();
    await options.onBatch(entries, snapshot());
  };
  const warn = (path: string, error: unknown) => {
    summary.skipped++;
    if (summary.warnings.length < 20)
      summary.warnings.push(`${path}: ${(error as Error)?.message || String(error)}`);
  };
  const stopped = () => options.signal?.aborted || summary.scanned >= limit;

  for (let cursor = 0; cursor < queue.length && !stopped(); cursor++) {
    const current = queue[cursor];
    if (options.maxDepth !== undefined && current.depth >= options.maxDepth) continue;
    try {
      const canonical = await realpath(current.path);
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      const directory = await opendir(current.path);
      summary.directories++;
      let pending: Promise<void>[] = [];
      const visit = async (name: string) => {
        if (
          stopped() ||
          excluded.has(name) ||
          patterns.some((pattern) => pattern.test(name)) ||
          (!options.includeHidden && name.startsWith('.'))
        )
          return;
        const path = join(current.path, name);
        try {
          const info = await lstat(path);
          if (stopped()) return;
          const isSymlink = info.isSymbolicLink();
          const target = isSymlink ? await stat(path).catch(() => info) : info;
          if (stopped()) return;
          summary.scanned++;
          batch.push({
            name,
            path,
            isDirectory: target.isDirectory(),
            isSymlink,
            size: info.size,
            modifiedAt: info.mtimeMs,
          });
          if (info.isDirectory() && !isSymlink) queue.push({ path, depth: current.depth + 1 });
        } catch (error) {
          warn(path, error);
        }
      };
      // opendir allows cancellation without first allocating an entire huge directory listing.
      try {
        for await (const entry of directory) {
          if (stopped()) break;
          pending.push(visit(entry.name));
          if (pending.length >= 16) {
            await Promise.all(pending);
            pending = [];
            if (batch.length >= 256 || Date.now() - lastFlush >= 100) await flush();
          }
        }
      } finally {
        await Promise.all(pending);
      }
      if (batch.length >= 256 || Date.now() - lastFlush >= 100) await flush();
    } catch (error) {
      if (cursor === 0 && !options.signal?.aborted) throw error;
      warn(current.path, error);
    }
  }
  summary.cancelled = !!options.signal?.aborted;
  summary.truncated = summary.scanned >= limit;
  await flush();
  return snapshot();
}
