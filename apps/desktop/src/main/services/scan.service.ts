import type { FileEntry, ScanSummary } from '@explore/shared';
import { walkDirectory } from './directory-walker';

export class ScanService {
  private jobs = new Map<string, AbortController>();

  async scan(id: string, path: string, options: {
    maxDepth?: number;
    excludePatterns?: string[];
    onBatch: (entries: FileEntry[], summary: ScanSummary) => void;
  }): Promise<ScanSummary> {
    this.cancel(id);
    const controller = new AbortController();
    this.jobs.set(id, controller);
    try {
      return await walkDirectory(path, { ...options, signal: controller.signal });
    } finally {
      if (this.jobs.get(id) === controller) this.jobs.delete(id);
    }
  }

  cancel(id: string): void { this.jobs.get(id)?.abort(); }

  cancelOwner(owner: number): void {
    for (const [id, controller] of this.jobs) if (id.startsWith(`${owner}:`)) controller.abort();
  }

  dispose(): void {
    for (const controller of this.jobs.values()) controller.abort();
    this.jobs.clear();
  }
}
