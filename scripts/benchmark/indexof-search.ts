/**
 * 算法 A: String.indexOf() 循环 (纯 JS 内存搜索)
 *
 * 模拟在 text-viewer 中按行搜索的场景
 */

import { readFile } from 'fs/promises';

export interface Match {
  line: number;
  col: number;
  text: string;
}

/**
 * 逐行 indexOf 循环搜索
 * - String.indexOf() 内部使用 V8 的 Turbo-Boyer-Moore (C++ 原生)
 * - 复杂度 O(n*m) 最坏，实际接近 O(n) 因为引擎优化
 */
export function indexOfSearch(content: string, query: string): Match[] {
  const lines = content.split('\n');
  const results: Match[] = [];

  // 大小写不敏感？这里默认大小写敏感，和 ripgrep --smart-case 对齐
  const lowerQ = query.toLowerCase();
  const smartCase = query !== lowerQ; // query 含大写 → 大小写敏感

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const searchLine = smartCase ? line : line.toLowerCase();
    const searchQuery = smartCase ? query : lowerQ;

    let from = 0;
    while (from < searchLine.length) {
      const pos = searchLine.indexOf(searchQuery, from);
      if (pos === -1) break;
      results.push({ line: i + 1, col: pos + 1, text: line });
      from = pos + 1;
    }
  }

  return results;
}

/**
 * 测量 indexOf 搜索耗时 (包含 readFile + split + 搜索)
 */
export async function benchmarkIndexOf(filePath: string, query: string) {
  const t0 = performance.now();

  const content = await readFile(filePath, 'utf-8');
  const tRead = performance.now();

  const results = indexOfSearch(content, query);
  const tSearch = performance.now();

  return {
    results,
    readMs: +(tRead - t0).toFixed(2),
    searchMs: +(tSearch - tRead).toFixed(2),
    totalMs: +(tSearch - t0).toFixed(2),
  };
}
