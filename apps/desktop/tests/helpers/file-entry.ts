import type { FileEntry } from '@explore/shared';

export function fixtureFile(name: string): FileEntry {
  return { name, path: `D:/fixture/${name}`, isDirectory: false, isSymlink: false, size: 0, modifiedAt: 0 };
}
