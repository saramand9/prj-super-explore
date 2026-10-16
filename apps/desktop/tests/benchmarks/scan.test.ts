import { expect, test } from 'vitest';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { cpus } from 'os';
import { walkDirectory } from '../../src/main/services/directory-walker';
import { FileSearchIndex } from '../../src/renderer/plugins/file-explorer/components/file-search-index';
import { createFixture, removeFixture } from '../helpers/fixture';

// Deliberately separate from unit tests: generates real files and measures warm-cache traversal.
for (const files of [10_000, 100_000]) {
  test(`${files} files: incremental traversal, indexing, query and cancellation`, async () => {
    const root = await createFixture('benchmark');
    const index = new FileSearchIndex();
    try {
      for (let group = 0; group < files / 1000; group++) {
        const directory = join(root, `group-${group}`);
        await mkdir(directory);
        for (let offset = 0; offset < 1000; offset += 50) {
          await Promise.all(Array.from({ length: 50 }, (_, n) => {
            const id = group * 1000 + offset + n;
            const name = id % 10 === 0 ? `中文资料-${id}.txt` : `document-${id}.txt`;
            return writeFile(join(directory, name), '');
          }));
        }
      }
      const started = performance.now();
      let firstBatchMs = 0;
      let batches = 0;
      let maxBatchIndexMs = 0;
      const summary = await walkDirectory(root, { onBatch: (batch) => {
        if (!batch.length) return;
        if (!batches++) firstBatchMs = performance.now() - started;
        const batchStarted = performance.now();
        index.append(batch);
        maxBatchIndexMs = Math.max(maxBatchIndexMs, performance.now() - batchStarted);
      } });
      const totalMs = performance.now() - started;
      expect(summary.scanned).toBe(files + files / 1000);
      expect(summary.warnings).toEqual([]);
      expect(summary.truncated).toBe(false);
      expect(index.entryCount).toBe(summary.scanned);
      const queryTimes: number[] = [];
      for (const query of ['document', 'zwzl', '中文资料', `document-${files - 1}`, '*.txt']) {
        const start = performance.now();
        expect(index.search(query).length).toBeGreaterThan(0);
        queryTimes.push(performance.now() - start);
      }
      const controller = new AbortController();
      let cancelledAt = 0;
      const cancelled = await walkDirectory(root, { signal: controller.signal, onBatch: (batch) => {
        if (batch.length && !controller.signal.aborted) { cancelledAt = performance.now(); controller.abort(); }
      } });
      expect(cancelled.cancelled).toBe(true);
      expect(cancelled.scanned).toBeLessThan(summary.scanned);
      console.log(JSON.stringify({
        files, entries: summary.scanned, batches,
        firstBatchMs: Math.round(firstBatchMs), totalMs: Math.round(totalMs),
        maxBatchIndexMs: +maxBatchIndexMs.toFixed(2),
        maxQueryMs: +Math.max(...queryTimes).toFixed(2),
        cancelMs: +(performance.now() - cancelledAt).toFixed(2),
        heapMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        platform: `${process.platform} ${process.arch}`, node: process.version, cpu: cpus()[0].model,
      }));
    } finally { index.clear(); await removeFixture(root); }
  });
}
