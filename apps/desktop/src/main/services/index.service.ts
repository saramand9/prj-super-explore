import { readdir, stat } from 'fs/promises';
import { join, extname } from 'path';
import type { IndexResult } from '@explore/shared';
import type { Service, ServiceContainer } from '../service-container';
import type { ConfigService } from './config.service';

export class IndexService implements Service {
  private ready = false;
  private indexing = false;
  private entries: IndexResult[] = [];
  private excludePatterns: string[] = [];

  constructor(private container: ServiceContainer) {}

  init(): void {
    const config = this.container.get<ConfigService>('config');
    const settings = config.getSettings();
    this.excludePatterns = settings.excludePatterns;
    // 非阻塞：启动后台索引
    if (settings.indexPaths.length > 0) {
      this.rebuildInBackground(settings.indexPaths);
    } else {
      this.ready = true;
    }
  }

  get status() {
    return {
      ready: this.ready,
      itemCount: this.entries.length,
      indexing: this.indexing,
    };
  }

  query(pattern: string, maxResults = 20): IndexResult[] {
    if (!this.ready) return [];

    const lower = pattern.toLowerCase();
    const results: IndexResult[] = [];

    for (const entry of this.entries) {
      if (this.fuzzyMatch(entry.name.toLowerCase(), lower)) {
        results.push(entry);
        if (results.length >= maxResults) break;
      }
    }

    return results;
  }

  async rebuild(paths: string[]): Promise<number> {
    this.indexing = true;
    this.entries = [];

    // 并行 walk 各根路径，限制深度 3 层
    await Promise.all(paths.map((p) => this.walk(p, 3)));

    this.ready = true;
    this.indexing = false;
    return this.entries.length;
  }

  dispose(): void {
    this.entries = [];
    this.ready = false;
  }

  // ── private ──

  /** 后台异步重建索引，不阻塞启动 */
  private rebuildInBackground(paths: string[]): void {
    this.indexing = true;
    Promise.all(paths.map((p) => this.walk(p, 3)))
      .then(() => {
        this.ready = true;
        this.indexing = false;
      })
      .catch(() => {
        this.ready = true;
        this.indexing = false;
      });
  }

  private async walk(dirPath: string, maxDepth: number): Promise<void> {
    if (maxDepth <= 0) return;
    try {
      const names = await readdir(dirPath);
      const tasks = names.map(async (name) => {
        if (this.isExcluded(name)) return;

        const fullPath = join(dirPath, name);
        try {
          const st = await stat(fullPath);
          this.entries.push({
            path: fullPath,
            name,
            isDirectory: st.isDirectory(),
            extension: st.isDirectory() ? '' : extname(name),
          });

          if (st.isDirectory()) {
            await this.walk(fullPath, maxDepth - 1);
          }
        } catch {
          // skip
        }
      });

      // 并行处理同层文件，限制并发数避免 fd 耗尽
      const batchSize = 32;
      for (let i = 0; i < tasks.length; i += batchSize) {
        await Promise.all(tasks.slice(i, i + batchSize));
      }
    } catch {
      // skip inaccessible dirs
    }
  }

  private fuzzyMatch(text: string, pattern: string): boolean {
    let pi = 0;
    for (let ti = 0; ti < text.length && pi < pattern.length; ti++) {
      if (text[ti] === pattern[pi]) {
        pi++;
      }
    }
    return pi === pattern.length;
  }

  private isExcluded(name: string): boolean {
    return this.excludePatterns.some((p) => {
      if (p === name) return true;
      if (p.includes('*')) {
        const regex = new RegExp('^' + p.replace(/\*/g, '.*') + '$');
        return regex.test(name);
      }
      return false;
    });
  }
}
