/**
 * 搜索算法性能对比 — Benchmark Runner
 *
 * 四种算法同台对比:
 *   A: String.indexOf() 循环 (纯 JS, V8 Turbo-Boyer-Moore)
 *   B: ripgrep 子进程 (SIMD + Teddy + Boyer-Moore, 有进程启动开销)
 *   C: Boyer-Moore-Horspool 纯 JS (手写坏字符规则)
 *   D: BMH Buffer 版 (原始字节扫描, 二分查找行号)
 *
 * Usage: npx tsx scripts/benchmark/run-benchmark.ts
 */

import { join } from 'path';
import { stat, readdir } from 'fs/promises';
import { benchmarkIndexOf } from './indexof-search';
import { benchmarkRg } from './rg-search';
import { benchmarkBmh, benchmarkBmhBuffer } from './bmh-search';

const DATA_DIR = join(import.meta.dirname, 'data');
const QUERY = 'BENCHMARK_TARGET_';
const WARMUP_RUNS = 2;
const MEASURED_RUNS = 5;

function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)} μs`;
  if (ms < 1000) return `${ms.toFixed(1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface BenchResult {
  name: string;
  searchMs: number;
  totalMs: number;
  matches: number;
}

async function main() {
  let files: string[];
  try {
    files = (await readdir(DATA_DIR))
      .filter((f) => f.endsWith('.log'))
      .sort();
  } catch {
    console.error('No test data found. Run generate-data.ts first:');
    console.error('  npx tsx scripts/benchmark/generate-data.ts');
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No .log files found in data/. Run generate-data.ts first.');
    process.exit(1);
  }

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        Search Algorithm Benchmark                       ║');
  console.log('║  A: indexOf (V8 native)                                 ║');
  console.log('║  B: ripgrep subprocess (SIMD+Teddy+BM)                  ║');
  console.log('║  C: BMH pure JS (Horspool bad-char)                     ║');
  console.log('║  D: BMH Buffer (raw bytes + binary line lookup)         ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();
  console.log(`Query: "${QUERY}"  |  Warmup: ${WARMUP_RUNS}  |  Runs: ${MEASURED_RUNS}`);
  console.log();

  for (const file of files) {
    const filePath = join(DATA_DIR, file);
    const { size } = await stat(filePath);

    console.log('─'.repeat(62));
    console.log(`  ${file}  (${formatSize(size)})`);
    console.log('─'.repeat(62));

    // ── Warmup ──
    for (let i = 0; i < WARMUP_RUNS; i++) {
      await benchmarkIndexOf(filePath, QUERY);
      await benchmarkBmh(filePath, QUERY);
      await benchmarkBmhBuffer(filePath, QUERY);
      await sleep(50);
      try { await benchmarkRg(filePath, QUERY); } catch { /* */ }
      await sleep(100);
    }

    const allResults: BenchResult[] = [];

    // ── A: indexOf ──
    {
      const runs = [];
      for (let i = 0; i < MEASURED_RUNS; i++) {
        runs.push(await benchmarkIndexOf(filePath, QUERY));
        await sleep(30);
      }
      allResults.push({
        name: 'A: indexOf (V8 native)',
        searchMs: runs.reduce((s, r) => s + r.searchMs, 0) / MEASURED_RUNS,
        totalMs: runs.reduce((s, r) => s + r.totalMs, 0) / MEASURED_RUNS,
        matches: runs[0].results.length,
      });
    }

    // ── C: BMH pure JS ──
    {
      const runs = [];
      for (let i = 0; i < MEASURED_RUNS; i++) {
        runs.push(await benchmarkBmh(filePath, QUERY));
        await sleep(30);
      }
      allResults.push({
        name: 'C: BMH pure JS',
        searchMs: runs.reduce((s, r) => s + r.searchMs, 0) / MEASURED_RUNS,
        totalMs: runs.reduce((s, r) => s + r.totalMs, 0) / MEASURED_RUNS,
        matches: runs[0].results.length,
      });
    }

    // ── D: BMH Buffer ──
    {
      const runs = [];
      for (let i = 0; i < MEASURED_RUNS; i++) {
        runs.push(await benchmarkBmhBuffer(filePath, QUERY));
        await sleep(30);
      }
      allResults.push({
        name: 'D: BMH Buffer',
        searchMs: runs.reduce((s, r) => s + r.searchMs, 0) / MEASURED_RUNS,
        totalMs: runs.reduce((s, r) => s + r.totalMs, 0) / MEASURED_RUNS,
        matches: runs[0].results.length,
      });
    }

    // ── B: ripgrep ──
    {
      const runs = [];
      for (let i = 0; i < MEASURED_RUNS; i++) {
        runs.push(await benchmarkRg(filePath, QUERY));
        await sleep(100);
      }
      allResults.push({
        name: 'B: ripgrep (subprocess)',
        searchMs: runs.reduce((s, r) => s + r.searchMs, 0) / MEASURED_RUNS,
        totalMs: runs.reduce((s, r) => s + r.totalMs, 0) / MEASURED_RUNS,
        matches: runs[0].results.length,
      });
    }

    // ── Print results table ──
    const fastest = Math.min(...allResults.map((r) => r.totalMs));

    console.log();
    console.log('  Algorithm                  Search   Total    Matches');
    console.log('  ─────────                  ──────   ─────    ───────');
    for (const r of allResults) {
      const marker = r.totalMs === fastest ? ' ◀ fastest' : '';
      const padName = r.name.padEnd(26);
      const padSearch = formatMs(r.searchMs).padStart(7);
      const padTotal = formatMs(r.totalMs).padStart(7);
      console.log(`  ${padName} ${padSearch}  ${padTotal}    ${r.matches}${marker}`);
    }
    console.log();
  }

  console.log('═'.repeat(62));
  console.log();
  console.log('Key takeaways:');
  console.log('  - V8 indexOf: C++ 原生 Turbo-Boyer-Moore, 零 JS 开销, 单文件王者');
  console.log('  - BMH pure JS: 手写坏字符表, 每次比较走 JS 解释器, 反而更慢');
  console.log('  - BMH Buffer: 省了 split+逐行, 但二分定位行号有额外成本');
  console.log('  - ripgrep: SIMD 并行 + mmap IO, 但子进程启动 ~40ms');
  console.log();
  console.log('  结论: 内存内搜索用 indexOf 最快。');
  console.log('        手写算法在 JS 中不可能快过 C++ 原生实现。');
  console.log('        多文件/大文件场景 ripgrep 的 SIMD 优势才显现。');
}

main().catch(console.error);
