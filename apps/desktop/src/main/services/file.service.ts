import { readdir, stat, copyFile, rename, unlink, rm, mkdir, access } from 'fs/promises';
import { constants } from 'fs';
import { join, basename, extname } from 'path';
import { shell } from 'electron';
import type { FileEntry, FileStat, FileOpResult, SortConfig } from '@explore/shared';
import type { ServiceContainer } from '../service-container';
import type { WatcherService } from './watcher.service';

export class FileService {
  private dirSizeCache = new Map<string, { size: number; ts: number }>();
  private dirSizePending = new Map<string, Promise<number>>();

  private get watcher(): WatcherService {
    return this.container.get<WatcherService>('watcher');
  }

  constructor(private container: ServiceContainer) {}

  /** 批量获取目录递归大小（带缓存，5分钟TTL） */
  async getDirSizes(paths: string[]): Promise<Record<string, number>> {
    const CACHE_TTL = 5 * 60 * 1000;
    const now = Date.now();
    const result: Record<string, number> = {};

    await Promise.all(
      paths.map(async (dirPath) => {
        const cached = this.dirSizeCache.get(dirPath);
        if (cached && now - cached.ts < CACHE_TTL) {
          result[dirPath] = cached.size;
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
          const size = await promise;
          this.dirSizeCache.set(dirPath, { size, ts: now });
          result[dirPath] = size;
        } catch {
          result[dirPath] = 0;
        } finally {
          this.dirSizePending.delete(dirPath);
        }
      }),
    );
    return result;
  }

  private async computeDirSize(dirPath: string): Promise<number> {
    try {
      const names = await readdir(dirPath);
      const sizes = await Promise.all(
        names.map(async (name) => {
          try {
            const fullPath = join(dirPath, name);
            const st = await stat(fullPath);
            if (st.isDirectory()) {
              return this.computeDirSize(fullPath);
            }
            return st.size;
          } catch {
            return 0;
          }
        }),
      );
      return sizes.reduce((a, b) => a + b, 0);
    } catch {
      return 0;
    }
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

  async copyFiles(sources: string[], destDir: string): Promise<FileOpResult> {
    const skipped: string[] = [];
    for (const src of sources) {
      try {
        const dest = join(destDir, basename(src));
        const st = await stat(src);
        if (st.isDirectory()) {
          await this.copyDir(src, dest);
        } else {
          await copyFile(src, dest);
        }
      } catch (e: any) {
        skipped.push(src);
      }
    }
    return { success: skipped.length === 0, skipped };
  }

  async moveFiles(sources: string[], destDir: string): Promise<FileOpResult> {
    const skipped: string[] = [];
    for (const src of sources) {
      try {
        const dest = join(destDir, basename(src));
        await rename(src, dest);
      } catch {
        skipped.push(src);
      }
    }
    return { success: skipped.length === 0, skipped };
  }

  async deleteFiles(paths: string[], permanent = false): Promise<FileOpResult> {
    const skipped: string[] = [];
    for (const p of paths) {
      try {
        if (permanent) {
          await rm(p, { recursive: true, force: true });
        } else {
          await shell.trashItem(p);
        }
      } catch {
        skipped.push(p);
      }
    }
    return { success: skipped.length === 0, skipped };
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

  // ── private ──

  private async copyDir(src: string, dest: string): Promise<void> {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src);
    for (const name of entries) {
      const srcPath = join(src, name);
      const destPath = join(dest, name);
      const st = await stat(srcPath);
      if (st.isDirectory()) {
        await this.copyDir(srcPath, destPath);
      } else {
        await copyFile(srcPath, destPath);
      }
    }
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
