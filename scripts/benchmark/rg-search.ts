/**
 * 算法 B: ripgrep 子进程搜索
 *
 * ripgrep 内部算法:
 * 1. Teddy SIMD 预过滤器 — 用 AVX2/SSE2 一次扫描 16-32 字节
 * 2. Boyer-Moore 变体精确匹配
 * 3. 正则 DFA — 编译到确定性有限自动机，O(n) 不回溯
 * 4. mmap IO — 零拷贝读取
 * 5. 多线程并行 (搜索目录时)
 *
 * 单文件搜索主要受益于 SIMD + mmap
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import type { Match } from './indexof-search';

const execFileP = promisify(execFile);

// ripgrep 二进制路径 — node_modules 里 @lvce-editor/ripgrep/bin/rg.exe
const RG_BIN = join(
  import.meta.dirname,
  '..', '..',
  'node_modules', '@lvce-editor', 'ripgrep', 'bin', 'rg.exe',
);

function parseRgOutput(stdout: string): Match[] {
  const lines = stdout.trim().split('\n');
  const results: Match[] = [];

  for (const line of lines) {
    if (!line) continue;
    // ripgrep --no-heading 输出格式: filepath:lineno:col:content
    // 我们只关心 lineno:col:text (单文件搜索)
    const firstColon = line.indexOf(':');
    const secondColon = line.indexOf(':', firstColon + 1);
    const thirdColon = line.indexOf(':', secondColon + 1);

    if (firstColon === -1 || secondColon === -1) continue;

    const lineNo = parseInt(line.slice(firstColon + 1, secondColon), 10);
    const colNo = thirdColon !== -1
      ? parseInt(line.slice(secondColon + 1, thirdColon), 10)
      : parseInt(line.slice(secondColon + 1), 10);

    const text = thirdColon !== -1 ? line.slice(thirdColon + 1) : '';

    if (!isNaN(lineNo)) {
      results.push({ line: lineNo, col: colNo, text });
    }
  }

  return results;
}

/**
 * 测量 ripgrep 搜索耗时 (含进程启动 + 搜索)
 */
export async function benchmarkRg(filePath: string, query: string) {
  const t0 = performance.now();

  let stdout: string;
  try {
    // --no-heading 去掉文件头，只保留 line:col:text
    // --smart-case 智能大小写 (全小写→不敏感，含大写→敏感)
    const { stdout: out } = await execFileP(RG_BIN, [
      '--no-heading',
      '--line-number',
      '--column',
      '--smart-case',
      '--no-ignore',
      '--no-config',
      query,
      filePath,
    ], {
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer
      timeout: 30000,
    });
    stdout = out;
  } catch (err: any) {
    // ripgrep exit code 1 = no matches, exit code 2 = error
    if (err.code === 1 && err.stdout === '') {
      stdout = '';
    } else if (err.stdout) {
      stdout = err.stdout;
    } else {
      throw err;
    }
  }

  const tSearch = performance.now();
  const results = parseRgOutput(stdout);
  const tParse = performance.now();

  return {
    results,
    searchMs: +(tSearch - t0).toFixed(2),
    parseMs: +(tParse - tSearch).toFixed(2),
    totalMs: +(tParse - t0).toFixed(2),
  };
}
