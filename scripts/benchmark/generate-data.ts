/**
 * 测试数据生成器
 * 生成不同大小的文本文件，散布可搜索的标记词
 *
 * Usage: npx tsx scripts/benchmark/generate-data.ts
 */

import { randomBytes } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const DATA_DIR = join(import.meta.dirname, 'data');
const TARGET_COUNT = 100; // 每个文件散布 100 个目标词

// 生成级别: 标签 -> 大约文件大小
const LEVELS: [string, number][] = [
  ['1mb', 1_000_000],
  ['10mb', 10_000_000],
  ['50mb', 50_000_000],
];

// 生成长得像代码/日志的行
function generateLine(rng: () => string, minLen = 30, maxLen = 200): string {
  const len = minLen + Math.floor(Math.random() * (maxLen - minLen));
  const chars: string[] = [];
  for (let i = 0; i < len; i++) {
    chars.push(rng());
  }
  return chars.join('');
}

// 模拟日志行
function logLine(): string {
  const ts = new Date(Date.now() - Math.floor(Math.random() * 86400000)).toISOString();
  const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  const level = levels[Math.floor(Math.random() * levels.length)];
  const msgs = [
    'Processing request from client',
    'Database query completed in 12ms',
    'Cache hit for key user_session_',
    'Connection pool stats: active=5, idle=10',
    'Authentication token verified',
    'File upload completed successfully',
    'Rate limit check passed',
    'WebSocket connection established',
    'Background job scheduled for execution',
    'Health check responded with 200',
  ];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  const id = Math.random().toString(36).slice(2, 10);
  return `${ts} [${level}] [${id}] ${msg}`;
}

async function main() {
  await mkdir(DATA_DIR, { recursive: true });

  for (const [label, targetSize] of LEVELS) {
    const filePath = join(DATA_DIR, `test-${label}.log`);
    console.log(`Generating ${filePath} (~${(targetSize / 1_000_000).toFixed(0)}MB)...`);

    const targets: number[] = [];
    // 随机散布 100 个目标词位置
    for (let t = 0; t < TARGET_COUNT; t++) {
      targets.push(Math.floor(Math.random() * targetSize));
    }
    targets.sort((a, b) => a - b);

    let bytesWritten = 0;
    let targetIdx = 0;
    const chunks: string[] = [];

    while (bytesWritten < targetSize) {
      const line = logLine() + '\n';
      let lineBytes = Buffer.byteLength(line, 'utf-8');

      // 检查是否需要在当前行插入目标词
      if (targetIdx < TARGET_COUNT && bytesWritten + lineBytes > targets[targetIdx]) {
        // 在行尾追加目标标记
        const marker = ` BENCHMARK_TARGET_${String(targetIdx).padStart(3, '0')}`;
        const modified = logLine() + marker + '\n';
        lineBytes = Buffer.byteLength(modified, 'utf-8');
        chunks.push(modified);
        targetIdx++;
      } else {
        chunks.push(line);
      }

      bytesWritten += lineBytes;
    }

    await writeFile(filePath, chunks.join(''), 'utf-8');

    const stats = `  Lines: ~${chunks.length.toLocaleString()}, Targets embedded: ${targetIdx}`;
    console.log(`  Done. ${stats}`);
  }

  console.log('\nAll test data generated in:', DATA_DIR);
  console.log('Target pattern to search: BENCHMARK_TARGET_');
}

main().catch(console.error);
