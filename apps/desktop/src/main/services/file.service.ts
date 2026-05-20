import { readdir, stat, copyFile, rename, unlink, rm, mkdir, access, writeFile } from 'fs/promises';
import { constants, watch } from 'fs';
import { join, basename, extname, parse, resolve, relative, isAbsolute } from 'path';
import { shell } from 'electron';
import type {
  FileConflictStrategy,
  FileEntry,
  FileOpResult,
  FileStat,
  SortConfig,
  DirSizeResult,
} from '@explore/shared';
import type { ServiceContainer } from '../service-container';
import type { WatcherService } from './watcher.service';

const DIR_SIZE_TIMEOUT = 1000; // ms
const DIR_SIZE_MAX_FILES = 50000;

export class FileService {
  private dirSizeCache = new Map<string, { size: number; ts: number }>();
  private dirSizePending = new Map<string, Promise<DirSizeResult>>();
  private cancelledOperations = new Set<string>();

  private get watcher(): WatcherService {
    return this.container.get<WatcherService>('watcher');
  }

  constructor(private container: ServiceContainer) {}

  /** 批量获取目录递归大小（带缓存，5分钟TTL） */
  async getDirSizes(paths: string[]): Promise<Record<string, DirSizeResult>> {
    const CACHE_TTL = 5 * 60 * 1000;
    const now = Date.now();
    const result: Record<string, DirSizeResult> = {};

    await Promise.all(
      paths.map(async (dirPath) => {
        const cached = this.dirSizeCache.get(dirPath);
        if (cached && now - cached.ts < CACHE_TTL) {
          result[dirPath] = { size: cached.size };
          return;
        }
        // 去重并发请求
        const pending = this.dirSizePending.get(dirPath);
        if (pending) {
          result[dirPath] = await pending;
          return;
        }
        const promise = this.computeDirSize(dirPath);
        this.dirSizePending.set(dirPath, promise);
        try {
          const r = await promise;
          if (!r.partial) {
            this.dirSizeCache.set(dirPath, { size: r.size, ts: now });
          }
          result[dirPath] = r;
        } catch {
          result[dirPath] = { size: 0 };
        } finally {
          this.dirSizePending.delete(dirPath);
        }
      }),
    );
    return result;
  }

  /** 后台完整计算（无时间限制，仅 maxFiles / maxDepth 兜底） */
  async computeDirSizeBackground(dirPath: string): Promise<DirSizeResult> {
    return this.computeDirSize(dirPath, 0);
  }

  private async computeDirSize(dirPath: string, timeout = DIR_SIZE_TIMEOUT): Promise<DirSizeResult> {
    const start = Date.now();
    let fileCount = 0;
    let partial = false;

    const timedOut = () => timeout > 0 && Date.now() - start > timeout;

    async function walk(d: string, depth: number): Promise<number> {
      if (depth > 8) { partial = true; return 0; }
      try {
        const names = await readdir(d);
        let total = 0;
        for (const name of names) {
          if (timedOut() || fileCount >= DIR_SIZE_MAX_FILES) {
            partial = true;
            return total;
          }
          try {
            const fullPath = join(d, name);
            const st = await stat(fullPath);
            fileCount++;
            if (st.isDirectory() && !st.isSymbolicLink()) {
              total += await walk(fullPath, depth + 1);
            } else {
              total += st.size;
            }
          } catch { /* skip */ }
        }
        return total;
      } catch {
        return 0;
      }
    }

    const size = await walk(dirPath, 1);
    const result: DirSizeResult = { size, fileCount };
    if (partial) result.partial = true;
    return result;
  }

  /** 清除指定路径的缓存（文件变更后调用） */
  clearDirSizeCache(dirPath?: string): void {
    if (dirPath) {
      this.dirSizeCache.delete(dirPath);
    } else {
      this.dirSizeCache.clear();
    }
  }

  async readDir(
    dirPath: string,
    sort?: SortConfig,
    showHidden = false,
  ): Promise<FileEntry[]> {
    const names = await readdir(dirPath);
    const entries: FileEntry[] = [];

    for (const name of names) {
      if (!showHidden && name.startsWith('.')) continue;
      try {
        const fullPath = join(dirPath, name);
        const st = await stat(fullPath);
        entries.push({
          name,
          path: fullPath,
          isDirectory: st.isDirectory(),
          isSymlink: st.isSymbolicLink(),
          size: st.size,
          modifiedAt: st.mtimeMs,
        });
      } catch {
        // 跳过无权限的文件
      }
    }

    if (sort) {
      entries.sort(this.makeComparator(sort));
    }
    return entries;
  }

  async getStat(filePath: string): Promise<FileStat | null> {
    try {
      const st = await stat(filePath);
      const mode = st.mode.toString(8).slice(-3);
      return {
        path: filePath,
        size: st.size,
        isDirectory: st.isDirectory(),
        isSymlink: st.isSymbolicLink(),
        createdAt: st.birthtimeMs,
        modifiedAt: st.mtimeMs,
        accessedAt: st.atimeMs,
        permissions: mode,
      };
    } catch {
      return null;
    }
  }

  async copyFiles(
    sources: string[],
    destDir: string,
    conflictStrategy: FileConflictStrategy = 'rename',
    operationId?: string,
  ): Promise<FileOpResult> {
    const result = this.createOpResult();

    try {
      const destCheck = await this.validateDestDir(destDir);
      if (destCheck) {
        for (const src of sources) this.addFailure(result, src, destDir, destCheck);
        return this.finalizeOpResult(result);
      }

      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        if (this.markCancelledIfNeeded(result, operationId, sources.slice(i))) break;
        try {
          const st = await stat(src);
          if (st.isDirectory() && this.isSameOrChild(destDir, src)) {
            this.addFailure(result, src, destDir, '不能把文件夹复制到它自己里面');
            continue;
          }

          const target = await this.resolveDestination(src, destDir, conflictStrategy, result);
          if (!target) continue;

          if (st.isDirectory()) {
            await this.copyDir(src, target.dest, operationId);
          } else {
            this.throwIfCancelled(operationId);
            await copyFile(src, target.dest, constants.COPYFILE_EXCL);
          }
          result.completed.push({ path: src, dest: target.dest, action: 'copied' });
        } catch (e: any) {
          if (this.handleCancellation(result, e, sources.slice(i))) break;
          this.addFailure(result, src, undefined, e.message ?? '复制失败', e.code);
        }
      }
    } finally {
      if (operationId) this.cancelledOperations.delete(operationId);
    }

    return this.finalizeOpResult(result);
  }

  async moveFiles(
    sources: string[],
    destDir: string,
    conflictStrategy: FileConflictStrategy = 'rename',
    operationId?: string,
  ): Promise<FileOpResult> {
    const result = this.createOpResult();

    try {
      const destCheck = await this.validateDestDir(destDir);
      if (destCheck) {
        for (const src of sources) this.addFailure(result, src, destDir, destCheck);
        return this.finalizeOpResult(result);
      }

      for (let i = 0; i < sources.length; i++) {
        const src = sources[i];
        if (this.markCancelledIfNeeded(result, operationId, sources.slice(i))) break;
        try {
          const st = await stat(src);
          if (st.isDirectory() && this.isSameOrChild(destDir, src)) {
            this.addFailure(result, src, destDir, '不能把文件夹移动到它自己里面');
            continue;
          }

          const target = await this.resolveDestination(src, destDir, conflictStrategy, result);
          if (!target) continue;

          try {
            this.throwIfCancelled(operationId);
            await rename(src, target.dest);
          } catch (e: any) {
            if (e.code !== 'EXDEV') throw e;
            if (st.isDirectory()) {
              await this.copyDir(src, target.dest, operationId);
              this.throwIfCancelled(operationId);
              await rm(src, { recursive: true, force: true });
            } else {
              this.throwIfCancelled(operationId);
              await copyFile(src, target.dest, constants.COPYFILE_EXCL);
              this.throwIfCancelled(operationId);
              await unlink(src);
            }
          }
          result.completed.push({ path: src, dest: target.dest, action: 'moved' });
        } catch (e: any) {
          if (this.handleCancellation(result, e, sources.slice(i))) break;
          this.addFailure(result, src, undefined, e.message ?? '移动失败', e.code);
        }
      }
    } finally {
      if (operationId) this.cancelledOperations.delete(operationId);
    }

    return this.finalizeOpResult(result);
  }

  async deleteFiles(paths: string[], permanent = false, operationId?: string): Promise<FileOpResult> {
    const result = this.createOpResult();
    try {
      for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        if (this.markCancelledIfNeeded(result, operationId, paths.slice(i))) break;
        try {
          if (permanent) {
            this.throwIfCancelled(operationId);
            await rm(p, { recursive: true, force: true });
            result.completed.push({ path: p, action: 'deleted' });
          } else {
            this.throwIfCancelled(operationId);
            await shell.trashItem(p);
            result.completed.push({ path: p, action: 'trashed' });
          }
        } catch (e: any) {
          if (this.handleCancellation(result, e, paths.slice(i))) break;
          this.addFailure(result, p, undefined, e.message ?? '删除失败', e.code);
        }
      }
    } finally {
      if (operationId) this.cancelledOperations.delete(operationId);
    }
    return this.finalizeOpResult(result);
  }

  cancelOperation(operationId: string): boolean {
    this.cancelledOperations.add(operationId);
    return true;
  }

  async createDir(parentPath: string, name: string) {
    try {
      const fullPath = join(parentPath, name);
      await mkdir(fullPath);
      return { success: true, path: fullPath };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async createFile(parentPath: string, name: string) {
    try {
      const fullPath = join(parentPath, name);
      await writeFile(fullPath, '', { flag: 'wx' });
      return { success: true, path: fullPath };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async renameFile(filePath: string, newName: string) {
    try {
      const dir = join(filePath, '..');
      const newPath = join(dir, newName);
      await rename(filePath, newPath);
      return { success: true, newPath };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async open(filePath: string): Promise<void> {
    await shell.openPath(filePath);
  }

  // ── File watching (tail -f) ──

  private fileWatchers = new Map<string, { watcher: ReturnType<typeof watch>; timer: ReturnType<typeof setTimeout> | null; cb: () => void }>();

  watchFile(filePath: string, onChange: () => void): void {
    this.unwatchFile(filePath);
    this.createFileWatcher(filePath, onChange);
  }

  private createFileWatcher(filePath: string, onChange: () => void): void {
    let watcher: ReturnType<typeof watch>;
    try {
      watcher = watch(filePath, (event) => {
        if (event === 'change' || event === 'rename') {
          const entry = this.fileWatchers.get(filePath);
          if (!entry) return;
          // 防抖：编辑器保存可能连续触发多个事件
          if (entry.timer) clearTimeout(entry.timer);
          entry.timer = setTimeout(() => {
            entry.timer = null;
            if (event === 'rename') {
              access(filePath, constants.F_OK)
                .then(() => {
                  const current = this.fileWatchers.get(filePath);
                  if (current?.cb === onChange) {
                    this.unwatchFile(filePath);
                    this.createFileWatcher(filePath, onChange);
                  }
                  onChange();
                })
                .catch(() => {
                  this.unwatchFile(filePath);
                  onChange();
                });
              return;
            }
            onChange();
          }, 150);
        }
      });
    } catch {
      return;
    }

    watcher.on('error', () => {
      this.unwatchFile(filePath);
      onChange();
    });
    this.fileWatchers.set(filePath, { watcher, timer: null, cb: onChange });
  }

  unwatchFile(filePath: string): void {
    const entry = this.fileWatchers.get(filePath);
    if (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.watcher.close();
      this.fileWatchers.delete(filePath);
    }
  }

  disposeWatchers(): void {
    for (const [, entry] of this.fileWatchers) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.watcher.close();
    }
    this.fileWatchers.clear();
  }

  // ── private ──

  private createOpResult(): Required<Pick<FileOpResult, 'skipped' | 'completed' | 'failures' | 'renamed' | 'replaced'>> & Pick<FileOpResult, 'cancelled'> {
    return {
      skipped: [],
      completed: [],
      failures: [],
      renamed: [],
      replaced: [],
      cancelled: false,
    };
  }

  private finalizeOpResult(
    result: Required<Pick<FileOpResult, 'skipped' | 'completed' | 'failures' | 'renamed' | 'replaced'>> & Pick<FileOpResult, 'cancelled'>,
  ): FileOpResult {
    const skipped = result.skipped;
    const failures = result.failures;
    const success = !result.cancelled && skipped.length === 0 && failures.length === 0;
    return {
      success,
      cancelled: result.cancelled || undefined,
      error: success ? undefined : this.summarizeOpError(result),
      skipped,
      completed: result.completed,
      failures,
      renamed: result.renamed,
      replaced: result.replaced,
    };
  }

  private summarizeOpError(
    result: Required<Pick<FileOpResult, 'skipped' | 'completed' | 'failures' | 'renamed' | 'replaced'>> & Pick<FileOpResult, 'cancelled'>,
  ): string {
    const parts: string[] = [];
    if (result.cancelled) parts.push('已取消');
    if (result.completed.length > 0) parts.push(`已处理 ${result.completed.length} 项`);
    if (result.skipped.length > 0) parts.push(`已跳过 ${result.skipped.length} 项`);
    if (result.failures.length > 0) parts.push(`失败 ${result.failures.length} 项`);
    return parts.join('，') || '操作失败';
  }

  private addFailure(
    result: Required<Pick<FileOpResult, 'skipped' | 'completed' | 'failures' | 'renamed' | 'replaced'>> & Pick<FileOpResult, 'cancelled'>,
    path: string,
    dest: string | undefined,
    reason: string,
    code?: string,
  ): void {
    result.failures.push({ path, dest, reason, code });
  }

  private async validateDestDir(destDir: string): Promise<string | null> {
    try {
      const st = await stat(destDir);
      return st.isDirectory() ? null : 'Destination is not a directory';
    } catch (e: any) {
      return e.message ?? 'Destination is not accessible';
    }
  }

  private isSameOrChild(targetPath: string, parentPath: string): boolean {
    const rel = relative(resolve(parentPath), resolve(targetPath));
    return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel));
  }

  private async resolveDestination(
    src: string,
    destDir: string,
    strategy: FileConflictStrategy,
    result: Required<Pick<FileOpResult, 'skipped' | 'completed' | 'failures' | 'renamed' | 'replaced'>> & Pick<FileOpResult, 'cancelled'>,
  ): Promise<{ dest: string } | null> {
    const dest = join(destDir, basename(src));
    if (resolve(src) === resolve(dest)) {
      result.skipped.push(src);
      return null;
    }

    const exists = await this.exists(dest);
    if (!exists) return { dest };

    if (strategy === 'skip') {
      result.skipped.push(src);
      return null;
    }

    if (strategy === 'error') {
      this.addFailure(result, src, dest, '目标已存在', 'EEXIST');
      return null;
    }

    if (strategy === 'overwrite') {
      await shell.trashItem(dest);
      result.replaced.push({ path: src, originalDest: dest });
      return { dest };
    }

    const uniqueDest = await this.uniquePath(dest);
    result.renamed.push({ source: src, dest: uniqueDest });
    return { dest: uniqueDest };
  }

  private async uniquePath(dest: string): Promise<string> {
    const parsed = parse(dest);
    let candidate = join(parsed.dir, `${parsed.name} copy${parsed.ext}`);
    let index = 2;
    while (await this.exists(candidate)) {
      candidate = join(parsed.dir, `${parsed.name} copy ${index}${parsed.ext}`);
      index++;
    }
    return candidate;
  }

  private async copyDir(src: string, dest: string, operationId?: string): Promise<void> {
    this.throwIfCancelled(operationId);
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src);
    for (const name of entries) {
      this.throwIfCancelled(operationId);
      const srcPath = join(src, name);
      const destPath = join(dest, name);
      const st = await stat(srcPath);
      if (st.isDirectory()) {
        await this.copyDir(srcPath, destPath, operationId);
      } else {
        await copyFile(srcPath, destPath, constants.COPYFILE_EXCL);
      }
    }
  }

  private throwIfCancelled(operationId?: string): void {
    if (!operationId || !this.cancelledOperations.has(operationId)) return;
    const err = new Error('操作已取消');
    (err as any).code = 'ECANCELED';
    throw err;
  }

  private markCancelledIfNeeded(
    result: Required<Pick<FileOpResult, 'skipped' | 'completed' | 'failures' | 'renamed' | 'replaced'>> & Pick<FileOpResult, 'cancelled'>,
    operationId: string | undefined,
    remaining: string[],
  ): boolean {
    if (!operationId || !this.cancelledOperations.has(operationId)) return false;
    result.cancelled = true;
    result.skipped.push(...remaining);
    return true;
  }

  private handleCancellation(
    result: Required<Pick<FileOpResult, 'skipped' | 'completed' | 'failures' | 'renamed' | 'replaced'>> & Pick<FileOpResult, 'cancelled'>,
    err: any,
    remaining: string[],
  ): boolean {
    if (err?.code !== 'ECANCELED') return false;
    result.cancelled = true;
    result.skipped.push(...remaining);
    return true;
  }

  private makeComparator(sort: SortConfig): (a: FileEntry, b: FileEntry) => number {
    const dir = sort.direction === 'asc' ? 1 : -1;
    return (a, b) => {
      let cmp = 0;
      switch (sort.key) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'size':
          cmp = a.size - b.size;
          break;
        case 'modifiedAt':
          cmp = a.modifiedAt - b.modifiedAt;
          break;
        case 'extension':
          cmp = extname(a.name).localeCompare(extname(b.name));
          break;
      }
      if (cmp !== 0) return dir * cmp;
      // 次级排序：按名称
      return a.name.localeCompare(b.name);
    };
  }
}
