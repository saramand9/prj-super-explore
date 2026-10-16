import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@explore/shared';
import { FileSearchIndex } from '../../src/renderer/plugins/file-explorer/components/file-search-index';

function entry(name: string): FileEntry {
  return {
    name,
    path: `C:\\fixture\\${name}`,
    isDirectory: false,
    isSymlink: false,
    size: 1,
    modifiedAt: 0,
  };
}

describe('FileSearchIndex', () => {
  it('finds Chinese file names by full pinyin and initials', () => {
    const target = entry('项目计划.md');
    const index = new FileSearchIndex();
    index.build([target, entry('notes.txt')]);

    expect(index.search('xiangmu')).toEqual([target]);
    expect(index.search('xmjh')).toEqual([target]);
  });

  it('does not return a partial trigram match', () => {
    const index = new FileSearchIndex();
    index.build([entry('abc-only.txt')]);

    expect(index.search('abcxyz')).toEqual([]);
  });

  it('deduplicates entries with the same path', () => {
    const target = entry('duplicate.txt');
    const index = new FileSearchIndex();
    index.build([target, { ...target }]);

    expect(index.entryCount).toBe(1);
    expect(index.search('duplicate')).toEqual([target]);
  });

  it('searches partial batches immediately and appends without losing or duplicating earlier entries', () => {
    const first = entry('第一份计划.md');
    const second = entry('第二份计划.md');
    const index = new FileSearchIndex();
    index.append([first]);
    expect(index.search('jihua')).toEqual([first]);
    index.append([first, second]);
    expect(index.entryCount).toBe(2);
    expect(index.search('jihua')).toEqual([first, second]);
  });

  it('keeps the best bounded matches when earlier entries have worse positions', () => {
    const index = new FileSearchIndex();
    const entries = ['long-needle.txt', 'xneedle.txt', 'needle-a.txt', 'needle-b.txt', 'needle-c.txt'].map(entry);
    index.build(entries);
    expect(index.search('needle', 2)).toEqual(entries.slice(2, 4));
    expect(index.search('needle', 4)).toEqual([entries[2], entries[3], entries[4], entries[1]]);
    expect(index.search('needle', 0)).toEqual([]);
  });

  it('rejects fragments which exist in different keys but never form the full query', () => {
    const index = new FileSearchIndex();
    index.build([entry('abcd-cdef-bcde.txt')]);
    expect(index.search('abcdef')).toEqual([]);
  });
});
