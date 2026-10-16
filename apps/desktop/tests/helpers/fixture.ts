import { mkdtemp, rm } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { tmpdir } from 'os';

export const createFixture = (name: string) => mkdtemp(join(tmpdir(), `explore-${name}-`));

export async function removeFixture(root: string): Promise<void> {
  const target = resolve(root);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('explore-'))
    throw new Error('Unexpected fixture directory');
  await rm(target, { recursive: true, force: true });
}
