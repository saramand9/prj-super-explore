import { spawn, type ChildProcess } from 'child_process';
import { existsSync, type Dirent, type Stats } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { dirname, join, relative } from 'path';
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
  proc?: ChildProcess;
  results: FulltextMatch[];
  cancelled: boolean;
}

export class SearchService implements Service {
  private rgPath: string | null = null;
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
      existing.proc?.kill();
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

    const rgPath = this.rgPath;
    if (!rgPath) {
      return this.fulltextWithJs(dir, query, searchId, opts, maxResults);
    }

    return new Promise((resolve, reject) => {
      const proc: ChildProcess = spawn(rgPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const entry: PendingSearch = { proc, results: [], cancelled: false };
      this.pending.set(searchId, entry);
      let fallbackStarted = false;

      const deletePending = () => {
        if (this.pending.get(searchId) === entry) {
          this.pending.delete(searchId);
        }
      };

      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      proc.on('close', (code: number | null) => {
        if (fallbackStarted) return;
        deletePending();
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

      proc.on('error', (err: Error) => {
        if (entry.cancelled) {
          deletePending();
          resolve([]);
          return;
        }
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          fallbackStarted = true;
          this.searchWithJs(dir, query, opts, maxResults, entry)
            .then((results) => {
              deletePending();
              resolve(results);
            })
            .catch((fallbackErr) => {
              deletePending();
              reject(fallbackErr);
            });
          return;
        }
        deletePending();
        (err as any).code = 'PROCESS_FAILED';
        reject(err);
      });
    });
  }

  cancel(searchId: string): void {
    const entry = this.pending.get(searchId);
    if (entry) {
      entry.cancelled = true;
      entry.proc?.kill();
      this.pending.delete(searchId);
    }
  }

  dispose(): void {
    for (const [, entry] of this.pending) {
      entry.cancelled = true;
      entry.proc?.kill();
    }
    this.pending.clear();
  }

  // ── private ──

  private findRgPath(): string | null {
    // 优先从环境变量
    if (process.env.RG_PATH) return process.env.RG_PATH;

    const executable = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const candidates: string[] = [];

    try {
      const packageJson = require.resolve('@lvce-editor/ripgrep/package.json');
      const packageDir = dirname(packageJson);
      candidates.push(
        join(packageDir, 'bin', executable),
        join(packageDir, '..', '..', '..', '..', '..', '@lvce-editor', '.ignored_ripgrep', 'bin', executable),
      );
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
    candidates.push(join(process.cwd(), 'node_modules', '@lvce-editor', '.ignored_ripgrep', 'bin', executable));

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate;
    }

    return this.findExecutableInPath(executable);
  }

  private findExecutableInPath(executable: string): string | null {
    const pathEnv = process.env.PATH ?? '';
    for (const dir of pathEnv.split(process.platform === 'win32' ? ';' : ':')) {
      if (!dir) continue;
      const candidate = join(dir, executable);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  }

  private async fulltextWithJs(
    dir: string,
    query: string,
    searchId: string,
    opts: {
      filePattern?: string;
      excludePatterns?: string[];
      maxResults?: number;
      maxFileSize?: string;
    } | undefined,
    maxResults: number,
  ): Promise<FulltextMatch[]> {
    const entry: PendingSearch = { results: [], cancelled: false };
    this.pending.set(searchId, entry);
    try {
      return await this.searchWithJs(dir, query, opts, maxResults, entry);
    } finally {
      if (this.pending.get(searchId) === entry) {
        this.pending.delete(searchId);
      }
    }
  }

  private async searchWithJs(
    dir: string,
    query: string,
    opts: {
      filePattern?: string;
      excludePatterns?: string[];
      maxResults?: number;
      maxFileSize?: string;
    } | undefined,
    maxResults: number,
    entry: PendingSearch,
  ): Promise<FulltextMatch[]> {
    if (!query) return [];
    const maxBytes = this.parseMaxFileSize(opts?.maxFileSize ?? '10M');
    const patterns = [...DEFAULT_EXCLUDE_PATTERNS, ...(opts?.excludePatterns ?? [])];
    const caseSensitive = /[A-Z]/.test(query);
    const needle = caseSensitive ? query : query.toLowerCase();
    const results: FulltextMatch[] = [];

    const walk = async (currentDir: string): Promise<void> => {
      if (entry.cancelled || results.length >= maxResults) return;
      let dirents: Dirent[];
      try {
        dirents = await readdir(currentDir, { withFileTypes: true }) as Dirent[];
      } catch {
        return;
      }

      for (const dirent of dirents) {
        if (entry.cancelled || results.length >= maxResults) return;
        const name = String(dirent.name);
        const fullPath = join(currentDir, name);
        const relPath = relative(dir, fullPath).replace(/\\/g, '/');
        if (this.matchesExcludePattern(relPath, patterns)) continue;

        if (dirent.isDirectory()) {
          if (!dirent.isSymbolicLink()) {
            await walk(fullPath);
          }
          continue;
        }
        if (!dirent.isFile()) continue;
        if (opts?.filePattern && !this.matchesFilePattern(name, opts.filePattern)) continue;

        let fileStat: Stats;
        try {
          fileStat = await stat(fullPath);
        } catch {
          continue;
        }
        if (fileStat.size > maxBytes) continue;

        let content: string;
        try {
          content = await readFile(fullPath, 'utf8');
        } catch {
          continue;
        }

        const lines = content.split(/\n/);
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          if (entry.cancelled || results.length >= maxResults) return;
          const lineContent = lines[lineIndex].replace(/\r$/, '');
          const haystack = caseSensitive ? lineContent : lineContent.toLowerCase();
          const idx = haystack.indexOf(needle);
          if (idx < 0) continue;
          results.push({
            filePath: fullPath,
            fileName: name,
            lineNumber: lineIndex + 1,
            columnStart: idx + 1,
            columnEnd: idx + query.length + 1,
            lineContent,
            matchText: lineContent.slice(idx, idx + query.length),
          });
        }
      }
    };

    await walk(dir);
    return entry.cancelled ? [] : results;
  }

  private parseMaxFileSize(value: string): number {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)(?:b)?$/i);
    if (!match) return 10 * 1024 * 1024;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier =
      unit === 't' ? 1024 ** 4 :
      unit === 'g' ? 1024 ** 3 :
      unit === 'm' ? 1024 ** 2 :
      unit === 'k' ? 1024 :
      1;
    return Math.floor(amount * multiplier);
  }

  private matchesFilePattern(name: string, pattern: string): boolean {
    return pattern
      .split(/[;,]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => this.globToRegExp(part, true).test(name));
  }

  private matchesExcludePattern(relPath: string, patterns: string[]): boolean {
    const normalized = relPath.replace(/\\/g, '/');
    return patterns.some((pattern) => {
      const normalizedPattern = pattern.replace(/\\/g, '/');
      if (normalizedPattern.startsWith('**/') && normalizedPattern.endsWith('/**')) {
        const segment = normalizedPattern.slice(3, -3);
        return normalized === segment || normalized.startsWith(`${segment}/`) || normalized.includes(`/${segment}/`);
      }
      return this.globToRegExp(normalizedPattern, false).test(normalized);
    });
  }

  private globToRegExp(pattern: string, basenameOnly: boolean): RegExp {
    let source = '';
    for (let i = 0; i < pattern.length; i++) {
      const char = pattern[i];
      if (char === '*' && pattern[i + 1] === '*') {
        source += '.*';
        i++;
      } else if (char === '*') {
        source += basenameOnly ? '[^/]*' : '[^/]*';
      } else if (char === '?') {
        source += basenameOnly ? '[^/]' : '.';
      } else {
        source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      }
    }
    return new RegExp(`^${source}$`, 'i');
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
