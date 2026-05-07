import { readdir, stat, copyFile, rename, unlink, rm, mkdir, access } from 'fs/promises';
import { constants } from 'fs';
import { join, basename, extname } from 'path';
import { shell } from 'electron';
import type { FileEntry, FileStat, FileOpResult, SortConfig } from '@explore/shared';
import type { ServiceContainer } from '../service-container';
import type { WatcherService } from './watcher.service';

export class FileService {
  private get watcher(): WatcherService {
    return this.container.get<WatcherService>('watcher');
  }

  constructor(private container: ServiceContainer) {}

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
      // 目录优先
      if (a.isDirectory !== b.isDirectory) {
        return a.isDirectory ? -1 : 1;
      }
      switch (sort.key) {
        case 'name':
          return dir * a.name.localeCompare(b.name);
        case 'size':
          return dir * (a.size - b.size);
        case 'modifiedAt':
          return dir * (a.modifiedAt - b.modifiedAt);
        case 'extension':
          return dir * extname(a.name).localeCompare(extname(b.name));
      }
    };
  }
}
