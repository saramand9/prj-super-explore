import { extname } from 'path';
import type { IndexResult } from '@explore/shared';
import type { Service, ServiceContainer } from '../service-container';
import type { ConfigService } from './config.service';
import { walkDirectory } from './directory-walker';

export class IndexService implements Service {
  private ready = false;
  private indexing = false;
  private entries: IndexResult[] = [];
  private excludePatterns: string[] = [];
  private controller: AbortController | null = null;

  constructor(private container: ServiceContainer) {}

  init(): void {
    const config = this.container.get<ConfigService>('config');
    const settings = config.getSettings();
    this.excludePatterns = settings.excludePatterns;
    // 非阻塞：启动后台索引
    if (settings.indexPaths.length > 0) {
      void this.rebuild(settings.indexPaths).catch(() => {});
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
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.indexing = true;
    const entries: IndexResult[] = [];
    const seen = new Set<string>();
    try {
      for (const path of paths) {
        if (controller.signal.aborted) break;
        await walkDirectory(path, {
          signal: controller.signal,
          maxDepth: 3,
          excludePatterns: this.excludePatterns,
          onBatch: (batch) => {
            if (controller.signal.aborted) return;
            for (const entry of batch) {
              if (seen.has(entry.path)) continue;
              seen.add(entry.path);
              entries.push({ ...entry, extension: entry.isDirectory ? '' : extname(entry.name) });
            }
          },
        }).catch(() => {});
      }
      if (!controller.signal.aborted) {
        this.entries = entries;
        this.ready = true;
      }
      return entries.length;
    } finally {
      if (this.controller === controller) {
        this.controller = null;
        this.indexing = false;
      }
    }
  }

  dispose(): void {
    this.controller?.abort();
    this.entries = [];
    this.ready = false;
  }

  // ── private ──

  private fuzzyMatch(text: string, pattern: string): boolean {
    let pi = 0;
    for (let ti = 0; ti < text.length && pi < pattern.length; ti++) {
      if (text[ti] === pattern[pi]) {
        pi++;
      }
    }
    return pi === pattern.length;
  }
}
