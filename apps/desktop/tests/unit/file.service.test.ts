import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  rmdir,
  stat,
  lstat,
  symlink,
  writeFile,
  rename,
  copyFile,
} from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { FileService } from '../../src/main/services/file.service';
import { removeFixture } from '../helpers/fixture';

const electronMocks = vi.hoisted(() => ({
  shell: {
    trashItem: vi.fn(),
    openPath: vi.fn(),
  },
}));

vi.mock('electron', () => electronMocks);
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename), copyFile: vi.fn(actual.copyFile) };
});

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
    await removeFixture(root);
    vi.clearAllMocks();
  });

  it('keeps directories before files when sorting directory entries', async () => {
    await mkdir(join(root, 'z-folder'));
    await mkdir(join(root, 'a-folder'));
    await writeFile(join(root, 'z-file.txt'), 'z', 'utf8');
    await writeFile(join(root, 'a-file.txt'), 'a', 'utf8');

    const entries = await service.readDir(root, { key: 'name', direction: 'desc' });

    expect(entries.map((entry) => entry.name)).toEqual(['z-folder', 'a-folder', 'z-file.txt', 'a-file.txt']);
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
    electronMocks.shell.trashItem.mockRejectedValueOnce(
      Object.assign(new Error('access denied'), { code: 'EPERM' }),
    );
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

    electronMocks.shell.trashItem.mockRejectedValueOnce(
      Object.assign(new Error('permission denied'), { code: 'EPERM' }),
    );
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

  it('preserves both files when renaming to an existing name', async () => {
    const source = join(root, 'source.txt');
    const target = join(root, 'existing.txt');
    await writeFile(source, 'source');
    await writeFile(target, 'keep me');

    expect((await service.renameFile(source, 'existing.txt')).success).toBe(false);
    await expect(readFile(source, 'utf8')).resolves.toBe('source');
    await expect(readFile(target, 'utf8')).resolves.toBe('keep me');
  });

  it.each(['../escape.txt', '..\\escape.txt', '.', '..', ''])('rejects invalid rename %j', async (name) => {
    const source = join(root, 'source.txt');
    await writeFile(source, 'keep me');

    expect((await service.renameFile(source, name)).success).toBe(false);
    await expect(readFile(source, 'utf8')).resolves.toBe('keep me');
  });

  it.skipIf(process.platform !== 'win32')('allows case-only renames on Windows', async () => {
    const source = join(root, 'original.txt');
    await writeFile(source, 'content');
    expect((await service.renameFile(source, 'Original.txt')).success).toBe(true);
    await expect(readFile(join(root, 'Original.txt'), 'utf8')).resolves.toBe('content');
  });

  it('reports OS errors when opening a file', async () => {
    electronMocks.shell.openPath.mockResolvedValueOnce('No application is associated with this file');
    await expect(service.open(join(root, 'unknown.bin'))).rejects.toThrow('No application');
  });

  it('copies a junction as a link and does not recurse through a parent cycle', async () => {
    const source = join(root, 'source');
    const destination = join(root, 'dest');
    await mkdir(source);
    await mkdir(destination);
    await writeFile(join(source, 'keep.txt'), 'keep');
    await symlink(source, join(source, 'loop'), 'junction');
    const result = await service.copyFiles([source], destination);
    expect(result.success).toBe(true);
    expect((await lstat(join(destination, 'source/loop'))).isSymbolicLink()).toBe(true);
    expect(await readFile(join(source, 'keep.txt'), 'utf8')).toBe('keep');
    expect((await service.readDir(source)).find((entry) => entry.name === 'loop')).toMatchObject({
      isDirectory: true,
      isSymlink: true,
    });
    expect(await service.getStat(join(source, 'loop'))).toMatchObject({ isDirectory: true, isSymlink: true });
    expect((await service.getDirSizes([source]))[source].size).toBe(4);
  });

  it('rejects copying into the source through a directory alias', async () => {
    const source = join(root, 'source');
    await mkdir(join(source, 'child'), { recursive: true });
    const alias = join(root, 'alias');
    await symlink(join(source, 'child'), alias, 'junction');
    expect((await service.copyFiles([source], alias)).success).toBe(false);
    expect(existsSync(join(source, 'child/source'))).toBe(false);
  });

  it('preserves the source when a cross-volume move cannot copy a locked file', async () => {
    const source = join(root, 'source.txt');
    const dest = join(root, 'destination');
    await mkdir(dest);
    await writeFile(source, 'must survive');
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('different volume'), { code: 'EXDEV' }));
    vi.mocked(copyFile).mockRejectedValueOnce(Object.assign(new Error('access denied'), { code: 'EACCES' }));
    const result = await service.moveFiles([source], dest);
    expect(result.success).toBe(false);
    expect(result.failures?.[0].code).toBe('EACCES');
    expect(await readFile(source, 'utf8')).toBe('must survive');
  });

  it('recognizes a dangling junction as an occupied destination', async () => {
    const target = join(root, 'target');
    const link = join(root, 'link');
    await mkdir(target);
    await symlink(target, link, 'junction');
    await rmdir(target);
    expect(await service.exists(link)).toBe(true);
    expect(await service.getStat(link)).toMatchObject({ isSymlink: true });
  });

  it('rejects a descendant whose name begins with two dots', async () => {
    const source = join(root, 'source');
    const child = join(source, '..child');
    await mkdir(child, { recursive: true });
    const result = await service.copyFiles([source], child);
    expect(result.failures?.[0].reason).toBe('不能把文件夹复制到它自己里面');
    expect(existsSync(join(child, 'source'))).toBe(false);
  });

  it('removes the source only after a cross-volume directory copy completes', async () => {
    const source = join(root, 'source');
    const destination = join(root, 'dest');
    await mkdir(source);
    await mkdir(destination);
    await writeFile(join(source, 'keep.txt'), 'content');
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('different volume'), { code: 'EXDEV' }));
    const result = await service.moveFiles([source], destination);
    expect(result.success).toBe(true);
    expect(await readFile(join(destination, 'source/keep.txt'), 'utf8')).toBe('content');
    expect(existsSync(source)).toBe(false);
  });
});
