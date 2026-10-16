import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, symlink, writeFile } from 'fs/promises';
import { join } from 'path';
import type { FileEntry } from '@explore/shared';
import { walkDirectory } from '../../src/main/services/directory-walker';
import { createFixture, removeFixture } from '../helpers/fixture';

const fault = vi.hoisted(() => ({ denied: '' }));
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, opendir: (path: string, options?: any) => path === fault.denied
    ? Promise.reject(Object.assign(new Error('permission denied'), { code: 'EACCES' }))
    : actual.opendir(path, options),
  };
});

describe('bounded directory scanning', () => {
  let root: string;
  beforeEach(async () => { root = await createFixture('walk'); fault.denied = ''; });
  afterEach(async () => removeFixture(root));

  it('lists links without following a parent cycle or scanning an external target', async () => {
    const source = join(root, 'source');
    const outside = join(root, 'outside');
    await mkdir(source);
    await mkdir(outside);
    await writeFile(join(source, 'visible.txt'), 'visible');
    await writeFile(join(outside, 'private.txt'), 'outside');
    await symlink(source, join(source, 'loop'), 'junction');
    await symlink(outside, join(source, 'external'), 'junction');
    const entries: FileEntry[] = [];
    const result = await walkDirectory(source, { onBatch: (batch) => { entries.push(...batch); } });
    expect(result).toMatchObject({ scanned: 3, directories: 1, cancelled: false });
    expect(entries.filter((entry) => entry.isSymlink).map((entry) => entry.name).sort()).toEqual(['external', 'loop']);
    expect(entries.some((entry) => entry.name === 'private.txt')).toBe(false);
  });

  it('stops between batches and preserves the batch already delivered', async () => {
    for (let offset = 0; offset < 600; offset += 50) {
      await Promise.all(Array.from({ length: 50 }, (_, i) => writeFile(join(root, `entry-${offset + i}.txt`), '')));
    }
    const controller = new AbortController();
    const entries: FileEntry[] = [];
    const result = await walkDirectory(root, { signal: controller.signal, onBatch: (batch) => {
      entries.push(...batch);
      if (batch.length) controller.abort();
    } });
    expect(result.cancelled).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(256);
    expect(result.scanned).toBe(entries.length);
  });

  it('reports an unreadable child without discarding other entries', async () => {
    fault.denied = join(root, 'protected');
    await mkdir(fault.denied);
    await writeFile(join(root, 'readable.txt'), 'readable');
    const entries: FileEntry[] = [];
    const result = await walkDirectory(root, { onBatch: (batch) => { entries.push(...batch); } });
    expect(entries.some((entry) => entry.name === 'readable.txt')).toBe(true);
    expect(result.skipped).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('protected');
  });

  it('enforces the entry cap and retains exclude patterns', async () => {
    await mkdir(join(root, 'node_modules'));
    await mkdir(join(root, 'ignore-me'));
    await Promise.all(Array.from({ length: 30 }, (_, i) => writeFile(join(root, `file-${i}.txt`), '')));
    const entries: FileEntry[] = [];
    const result = await walkDirectory(root, { maxEntries: 10, excludePatterns: ['ignore-*'], onBatch: (batch) => { entries.push(...batch); } });
    expect(result).toMatchObject({ scanned: 10, truncated: true });
    expect(entries).toHaveLength(10);
    expect(entries.every((entry) => !entry.isDirectory)).toBe(true);
  });

  it('cancels before touching an unavailable directory', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(walkDirectory(join(root, 'missing'), { signal: controller.signal, onBatch: () => {} })).resolves.toMatchObject({ cancelled: true, scanned: 0 });
  });
});
