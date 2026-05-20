import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { createRequire } from 'module';
import type { FulltextMatch } from '@explore/shared';
import type { Service, ServiceContainer } from '../service-container';

const require = createRequire(import.meta.url);

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/build/**',
  '**/.next/**',
  '**/coverage/**',
];

interface PendingSearch {
  proc: ReturnType<typeof spawn>;
  results: FulltextMatch[];
  cancelled: boolean;
}

export class SearchService implements Service {
  private rgPath!: string;
  private pending = new Map<string, PendingSearch>();

  constructor(private container: ServiceContainer) {}

  init(): void {
    // 尝试查找 ripgrep 路径
    // 优先使用系统安装的，否则使用打包的
    this.rgPath = this.findRgPath();
  }

  async fulltext(
    dir: string,
    query: string,
    searchId: string,
    opts?: {
      filePattern?: string;
      excludePatterns?: string[];
      maxResults?: number;
      maxFileSize?: string;
    },
  ): Promise<FulltextMatch[]> {
    // 取消之前的同名搜索
    const existing = this.pending.get(searchId);
    if (existing) {
      existing.cancelled = true;
      existing.proc.kill();
    }

    const maxResults = opts?.maxResults ?? 500;
    const args = [
      '--json',
      '--smart-case',
      '--max-count',
      String(maxResults),
      '--max-filesize',
      opts?.maxFileSize ?? '10M',
      '--no-ignore-parent',
      '--hidden',
    ];

    if (opts?.filePattern) {
      args.push('--glob', opts.filePattern);
    }

    for (const pattern of [...DEFAULT_EXCLUDE_PATTERNS, ...(opts?.excludePatterns ?? [])]) {
      args.push('--glob', `!${pattern}`);
    }

    args.push('--', query, dir);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.rgPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const entry: PendingSearch = { proc, results: [], cancelled: false };
      this.pending.set(searchId, entry);

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code) => {
        this.pending.delete(searchId);
        if (entry.cancelled) {
          resolve([]);
          return;
        }

        if (code !== 0 && code !== 1) {
          // code 1 = no matches (normal), other codes = error
          if (code !== 1) {
            const detail = stderr.trim();
            const err = new Error(detail ? `ripgrep exited with code ${code}: ${detail}` : `ripgrep exited with code ${code}`);
            (err as any).code = 'PROCESS_FAILED';
            reject(err);
            return;
          }
        }

        const results = this.parseRgOutput(stdout);
        resolve(results);
      });

      proc.on('error', (err) => {
        this.pending.delete(searchId);
        if (entry.cancelled) {
          resolve([]);
          return;
        }
        (err as any).code = 'PROCESS_FAILED';
        reject(err);
      });
    });
  }

  cancel(searchId: string): void {
    const entry = this.pending.get(searchId);
    if (entry) {
      entry.cancelled = true;
      entry.proc.kill();
      this.pending.delete(searchId);
    }
  }

  dispose(): void {
    for (const [, entry] of this.pending) {
      entry.cancelled = true;
      entry.proc.kill();
    }
    this.pending.clear();
  }

  // ── private ──

  private findRgPath(): string {
    // 优先从环境变量
    if (process.env.RG_PATH) return process.env.RG_PATH;

    const executable = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const candidates: string[] = [];

    try {
      const packageJson = require.resolve('@lvce-editor/ripgrep/package.json');
      candidates.push(join(dirname(packageJson), 'bin', executable));
    } catch {
      // The packaged binary is optional in development; fall back below.
    }

    if (process.resourcesPath) {
      candidates.push(
        join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@lvce-editor', 'ripgrep', 'bin', executable),
        join(process.resourcesPath, 'node_modules', '@lvce-editor', 'ripgrep', 'bin', executable),
      );
    }

    candidates.push(join(process.cwd(), 'node_modules', '@lvce-editor', 'ripgrep', 'bin', executable));

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    // 系统安装的 rg
    return 'rg';
  }

  private parseRgOutput(stdout: string): FulltextMatch[] {
    const results: FulltextMatch[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.type !== 'match') continue;

        const data = event.data;
        const filePath = data?.path?.text;
        const lineNumber = data?.line_number;
        const lineContent = data?.lines?.text;
        const submatch = data?.submatches?.[0];
        if (typeof filePath !== 'string' || typeof lineNumber !== 'number' || typeof lineContent !== 'string') {
          continue;
        }

        const start = typeof submatch?.start === 'number' ? submatch.start + 1 : 1;
        const end = typeof submatch?.end === 'number' ? submatch.end + 1 : start;
        results.push({
          filePath,
          fileName: filePath.split(/[/\\]/).pop() ?? filePath,
          lineNumber,
          columnStart: start,
          columnEnd: end,
          lineContent: lineContent.replace(/\r?\n$/, ''),
          matchText: submatch?.match?.text ?? '',
        });
      } catch {
        continue;
      }
    }

    return results;
  }
}
