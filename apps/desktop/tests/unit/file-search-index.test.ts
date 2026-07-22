import { describe, expect, it } from 'vitest';
import type { FileEntry } from '@explore/shared';
import { FileSearchIndex } from '../../src/renderer/plugins/file-explorer/components/file-search-index';

function entry(name: string): FileEntry {
  return {
    name,
    path: `C:\\fixtures\\${name}`,
    isDirectory: false,
    isSymlink: false,
    size: 1,
    modifiedAt: 0,
  };
}

describe('FileSearchIndex pinyin search', () => {
  it('matches long full-pinyin and initials queries through the trigram index', () => {
    const index = new FileSearchIndex();
    const report = entry('中国银行报告.txt');
    index.build([report, entry('english-report.txt')]);

    expect(index.search('zhongguoyinhang')).toEqual([report]);
    expect(index.search('zgyh')).toEqual([report]);
  });

  it('clears cached pinyin data when rebuilding the index', () => {
    const index = new FileSearchIndex();
    index.build([entry('中国银行报告.txt')]);
    index.build([entry('英文报告.txt')]);

    expect(index.search('zhongguoyinhang')).toEqual([]);
    expect(index.search('yingwenbaogao')).toHaveLength(1);
  });
});
