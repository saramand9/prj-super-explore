import { watch } from 'fs';
import type { Service } from '../service-container';

interface WatcherEntry {
  path: string;
  watcher: ReturnType<typeof watch>;
  callbacks: Set<(event: string, filePath: string) => void>;
}

/**
 * 文件系统监听服务。
 * 注意：Node.js fs.watch 在不同平台上行为不一致，
 * 后续版本考虑用 chokidar 替代。
 */
export class WatcherService implements Service {
  private watchers = new Map<string, WatcherEntry>();

  watch(
    dirPath: string,
    watcherId: string,
    cb: (event: string, filePath: string) => void,
  ): void {
    if (this.watchers.has(watcherId)) {
      this.unwatch(watcherId);
    }

    const watcher = watch(dirPath, { recursive: false }, (event, filename) => {
      if (filename) {
        cb(event, filename);
      }
    });

    watcher.on('error', () => {
      // 静默处理
    });

    this.watchers.set(watcherId, {
      path: dirPath,
      watcher,
      callbacks: new Set([cb]),
    });
  }

  unwatch(watcherId: string): void {
    const entry = this.watchers.get(watcherId);
    if (entry) {
      entry.watcher.close();
      this.watchers.delete(watcherId);
    }
  }

  dispose(): void {
    for (const [, entry] of this.watchers) {
      entry.watcher.close();
    }
    this.watchers.clear();
  }
}
