/**
 * 算法 C: Boyer-Moore-Horspool (纯 JS 实现)
 *
 * BMH 是 ripgrep 内部使用的算法之一（在 SIMD 预过滤之后做精确匹配）。
 * 核心思想：
 *   1. 从模式串末尾开始比较（不是开头）
 *   2. 用"坏字符规则"计算跳转距离 — 不匹配时一次跳多位
 *   3. 最佳 O(n/m)，平均比 indexOf 快 2-3x
 *
 * 这里实现的是 Horspool 简化版：只用坏字符规则，去掉好后缀规则。
 * BMH 在实践中通常比完整 BM 更快（好后缀的计算开销 > 收益）。
 */

export interface Match {
  line: number;
  col: number;
  text: string;
}

/**
 * 构建坏字符跳转表
 * 对于模式串中不存在的字符，跳过整个模式串长度
 * 对于存在的字符，跳到该字符在模式串中最右出现的位置
 */
function buildBadCharTable(pattern: string): Record<number, number> {
  const m = pattern.length;
  // 用普通对象而非 Map：V8 对整数 key 的对象有优化（类似稀疏数组）
  const table: Record<number, number> = {};

  // 默认：不匹配的字符跳 m 位
  // 用 Proxy 或 getter 太慢，直接用 fallback

  for (let i = 0; i < m - 1; i++) {
    table[pattern.charCodeAt(i)] = m - 1 - i;
  }

  return table;
}

/**
 * BMH 搜索（单行）
 * 返回该行中所有匹配的列位置 (1-based)
 */
function bmhSearchInLine(line: string, pattern: string, badChar: Record<number, number>): number[] {
  const n = line.length;
  const m = pattern.length;
  if (m === 0 || m > n) return [];

  const positions: number[] = [];
  const lastChar = pattern.charCodeAt(m - 1);

  let i = m - 1; // 对齐模式串最后一个字符
  while (i < n) {
    const bc = line.charCodeAt(i);

    if (bc === lastChar) {
      // 末尾匹配 → 验证前面 m-1 个字符
      const start = i - m + 1;
      let j = m - 2;
      while (j >= 0 && line.charCodeAt(start + j) === pattern.charCodeAt(j)) {
        j--;
      }
      if (j < 0) {
        positions.push(start + 1); // 1-based
      }
    }

    // Horspool 跳转：只用对齐末尾的字符决定跳距
    i += badChar[bc] || m;
  }

  return positions;
}

/**
 * BMH 全文搜索
 * @param content 文件内容
 * @param query 搜索词
 * @returns 所有匹配位置
 */
export function bmhSearch(content: string, query: string): Match[] {
  const lines = content.split('\n');
  const results: Match[] = [];
  const badChar = buildBadCharTable(query);

  for (let i = 0; i < lines.length; i++) {
    const positions = bmhSearchInLine(lines[i], query, badChar);
    for (const col of positions) {
      results.push({ line: i + 1, col, text: lines[i] });
    }
  }

  return results;
}

// ── Buffer 版本：直接搜原始字节，避免 split+逐行开销 ──

/**
 * Buffer 版 BMH：在原始字节上搜索，定位行号和列号
 * 优势：不需要 split('\n')，不需要逐行字符串操作
 */
export function bmhSearchBuffer(content: string, query: string): Match[] {
  const buf = Buffer.from(content, 'utf-8');
  const queryBuf = Buffer.from(query, 'utf-8');
  const n = buf.length;
  const m = queryBuf.length;

  if (m === 0 || m > n) return [];

  // 构建换行索引（只做一次）
  const lineStarts: number[] = [0];
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0x0a) { // '\n'
      lineStarts.push(i + 1);
    }
  }

  // 坏字符表（针对字节值 0-255）
  const badChar = new Int32Array(256);
  badChar.fill(m);
  for (let i = 0; i < m - 1; i++) {
    badChar[queryBuf[i]] = m - 1 - i;
  }

  const results: Match[] = [];
  const lastByte = queryBuf[m - 1];

  let i = m - 1; // 对齐模式串最后一个字节
  while (i < n) {
    const bc = buf[i];

    if (bc === lastByte) {
      // 末尾匹配 → 验证前面 m-1 个字节
      const start = i - m + 1;
      let j = m - 2;
      while (j >= 0 && buf[start + j] === queryBuf[j]) {
        j--;
      }
      if (j < 0) {
        // 二分查找行号
        const col = start; // 字节偏移
        let lo = 0;
        let hi = lineStarts.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >>> 1;
          if (lineStarts[mid] <= col) lo = mid;
          else hi = mid - 1;
        }
        const lineNo = lo + 1;
        const colNo = col - lineStarts[lo] + 1;
        const lineStart = lineStarts[lo];
        const lineEnd = lo + 1 < lineStarts.length ? lineStarts[lo + 1] - 1 : n;
        const text = buf.slice(lineStart, lineEnd).toString('utf-8').replace(/\r$/, '');

        results.push({ line: lineNo, col: colNo, text });
      }
    }

    // Horspool 跳转
    i += badChar[bc];
  }

  return results;
}

// ── Benchmark helper ──

import { readFile } from 'fs/promises';

export async function benchmarkBmh(filePath: string, query: string) {
  const t0 = performance.now();

  const content = await readFile(filePath, 'utf-8');
  const tRead = performance.now();

  const results = bmhSearch(content, query);
  const tSearch = performance.now();

  return {
    results,
    readMs: +(tRead - t0).toFixed(2),
    searchMs: +(tSearch - tRead).toFixed(2),
    totalMs: +(tSearch - t0).toFixed(2),
  };
}

export async function benchmarkBmhBuffer(filePath: string, query: string) {
  const t0 = performance.now();

  const content = await readFile(filePath, 'utf-8');
  const tRead = performance.now();

  const results = bmhSearchBuffer(content, query);
  const tSearch = performance.now();

  return {
    results,
    readMs: +(tRead - t0).toFixed(2),
    searchMs: +(tSearch - tRead).toFixed(2),
    totalMs: +(tSearch - t0).toFixed(2),
  };
}
