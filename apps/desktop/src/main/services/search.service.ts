import { spawn } from 'child_process';
import { join } from 'path';
import type { FulltextMatch } from '@explore/shared';
import type { Service, ServiceContainer } from '../service-container';

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
    opts?: { filePattern?: string; maxResults?: number },
  ): Promise<FulltextMatch[]> {
    // 取消之前的同名搜索
    const existing = this.pending.get(searchId);
    if (existing) {
      existing.cancelled = true;
      existing.proc.kill();
    }

    const maxResults = opts?.maxResults ?? 500;
    const args = [
      '--no-heading',
      '--line-number',
      '--column',
      '--smart-case',
      '--max-count',
      String(maxResults),
      '--no-ignore-parent',
      '--hidden',
    ];

    if (opts?.filePattern) {
      args.push('--glob', opts.filePattern);
    }

    args.push('--', query, dir);

    return new Promise((resolve, reject) => {
      const proc = spawn(this.rgPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const entry: PendingSearch = { proc, results: [], cancelled: false };
      this.pending.set(searchId, entry);

      let stdout = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      proc.on('close', (code) => {
        this.pending.delete(searchId);
        if (entry.cancelled) return;

        if (code !== 0 && code !== 1) {
          // code 1 = no matches (normal), other codes = error
          if (code !== 1) {
            reject(new Error(`ripgrep exited with code ${code}`));
            return;
          }
        }

        const results = this.parseRgOutput(stdout);
        resolve(results);
      });

      proc.on('error', (err) => {
        this.pending.delete(searchId);
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

    // 系统安装的 rg
    return 'rg';
  }

  private parseRgOutput(stdout: string): FulltextMatch[] {
    const results: FulltextMatch[] = [];
    const lines = stdout.split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      // ripgrep output: filepath:lineno:col:content
      const match = line.match(/^(.+?):(\d+):(\d+):(.*)$/);
      if (match) {
        const [, filePath, lineNo, col, content] = match;
        results.push({
          filePath: filePath.trim(),
          fileName: filePath.split(/[/\\]/).pop() ?? filePath,
          lineNumber: parseInt(lineNo, 10),
          columnStart: parseInt(col, 10),
          columnEnd: parseInt(col, 10), // rg doesn't give end col by default
          lineContent: content,
          matchText: content, // simplified
        });
      }
    }

    return results;
  }
}
