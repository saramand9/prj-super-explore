import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileService } from '../../src/main/services/file.service';

const electronMocks = vi.hoisted(() => ({
  shell: {
    trashItem: vi.fn(),
    openPath: vi.fn(),
  },
}));

vi.mock('electron', () => electronMocks);

describe('FileService file operations', () => {
  let root: string;
  let service: FileService;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explore-file-service-'));
    service = new FileService({ get: vi.fn() } as any);
    electronMocks.shell.trashItem.mockImplementation(async (target: string) => {
      await rm(target, { recursive: true, force: true });
    });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('copies files and directories with Chinese and space paths', async () => {
    const sourceDir = join(root, '源 目录');
    const destDir = join(root, '目标 space');
    const nestedDir = join(sourceDir, '空目录');
    await mkdir(nestedDir, { recursive: true });
    await mkdir(destDir, { recursive: true });
    await writeFile(join(sourceDir, '中文 文件.txt'), 'hello 中文', 'utf8');

    const result = await service.copyFiles([sourceDir], destDir, 'rename');

    expect(result.success).toBe(true);
    expect(result.completed).toHaveLength(1);
    await expect(readFile(join(destDir, '源 目录', '中文 文件.txt'), 'utf8')).resolves.toBe('hello 中文');
    await expect(stat(join(destDir, '源 目录', '空目录'))).resolves.toMatchObject({});
  });

  it('handles copy conflicts with rename, skip, overwrite, and permission failures', async () => {
    const srcDir = join(root, 'src');
    const destDir = join(root, 'dest');
    await mkdir(srcDir);
    await mkdir(destDir);
    const source = join(srcDir, 'same.txt');
    const dest = join(destDir, 'same.txt');
    await writeFile(source, 'new', 'utf8');
    await writeFile(dest, 'old', 'utf8');

    const renamed = await service.copyFiles([source], destDir, 'rename');
    expect(renamed.success).toBe(true);
    expect(renamed.renamed?.[0].dest).toMatch(/same copy\.txt$/);
    await expect(readFile(join(destDir, 'same copy.txt'), 'utf8')).resolves.toBe('new');

    const skipped = await service.copyFiles([source], destDir, 'skip');
    expect(skipped.success).toBe(false);
    expect(skipped.skipped).toEqual([source]);

    const overwritten = await service.copyFiles([source], destDir, 'overwrite');
    expect(overwritten.success).toBe(true);
    expect(overwritten.replaced).toEqual([{ path: source, originalDest: dest }]);
    expect(electronMocks.shell.trashItem).toHaveBeenCalledWith(dest);
    await expect(readFile(dest, 'utf8')).resolves.toBe('new');

    await writeFile(dest, 'old again', 'utf8');
    electronMocks.shell.trashItem.mockRejectedValueOnce(Object.assign(new Error('access denied'), { code: 'EPERM' }));
    const denied = await service.copyFiles([source], destDir, 'overwrite');
    expect(denied.success).toBe(false);
    expect(denied.failures?.[0].code).toBe('EPERM');
  });

  it('moves large directory contents and removes the source', async () => {
    const srcDir = join(root, 'large source');
    const destDir = join(root, 'large dest');
    await mkdir(srcDir);
    await mkdir(destDir);
    for (let i = 0; i < 80; i++) {
      await writeFile(join(srcDir, `file-${String(i).padStart(3, '0')}.txt`), `value-${i}`, 'utf8');
    }

    const result = await service.moveFiles([srcDir], destDir, 'rename');

    expect(result.success).toBe(true);
    expect(existsSync(srcDir)).toBe(false);
    await expect(readFile(join(destDir, 'large source', 'file-079.txt'), 'utf8')).resolves.toBe('value-79');
  });

  it('deletes permanently, moves to trash, and reports trash permission errors', async () => {
    const permanent = join(root, 'delete-me.txt');
    const trashed = join(root, 'trash-me.txt');
    const denied = join(root, 'denied.txt');
    await writeFile(permanent, 'permanent', 'utf8');
    await writeFile(trashed, 'trash', 'utf8');
    await writeFile(denied, 'denied', 'utf8');

    const permanentResult = await service.deleteFiles([permanent], true);
    expect(permanentResult.success).toBe(true);
    expect(existsSync(permanent)).toBe(false);

    const trashResult = await service.deleteFiles([trashed], false);
    expect(trashResult.success).toBe(true);
    expect(electronMocks.shell.trashItem).toHaveBeenCalledWith(trashed);

    electronMocks.shell.trashItem.mockRejectedValueOnce(Object.assign(new Error('permission denied'), { code: 'EPERM' }));
    const deniedResult = await service.deleteFiles([denied], false);
    expect(deniedResult.success).toBe(false);
    expect(deniedResult.failures?.[0].code).toBe('EPERM');
  });

  it('renames files in directories with spaces', async () => {
    const dir = join(root, 'rename space');
    await mkdir(dir);
    const source = join(dir, 'old name.txt');
    await writeFile(source, 'content', 'utf8');

    const result = await service.renameFile(source, '新 name.txt');

    expect(result.success).toBe(true);
    await expect(readFile(join(dir, '新 name.txt'), 'utf8')).resolves.toBe('content');
  });
});
