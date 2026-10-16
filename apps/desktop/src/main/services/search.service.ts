import { spawn, type ChildProcess } from 'child_process';
import { existsSync, type Dirent, type Stats } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { dirname, join, relative } from 'path';
import { createRequire } from 'module';
import { StringDecoder } from 'string_decoder';
import type { FulltextMatch, SearchResult } from '@explore/shared';
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
  onCancel?: () => void;
  warnings: string[];
  onMatches?: (matches: FulltextMatch[], total: number) => void;
}

interface SearchOptions {
  filePattern?: string;
  excludePatterns?: string[];
  maxResults?: number;
  maxFileSize?: string;
}

export class SearchService implements Service {
  private rgPath: string | null = null;
  private pending = new Map<string, PendingSearch>();

  constructor(private container: ServiceContainer) {}

  init(): void {
    // Prefer the bundled executable so installed builds do not depend on the user's PATH.
    this.rgPath = this.findRgPath();
  }

  async fulltext(
    dir: string,
    query: string,
    searchId: string,
    opts?: SearchOptions,
  ): Promise<FulltextMatch[]> {
    const result = await this.run(dir, query, searchId, opts);
    return result.cancelled ? [] : result.matches;
  }

  async run(
    dir: string,
    query: string,
    searchId: string,
    opts?: SearchOptions,
    onMatches?: (matches: FulltextMatch[], total: number) => void,
  ): Promise<SearchResult> {
    this.cancel(searchId);
    const requestedMax = opts?.maxResults ?? 500;
    const maxResults = Number.isFinite(requestedMax) ? Math.max(0, Math.floor(requestedMax)) : 500;
    if (!query || maxResults === 0) return { matches: [], cancelled: false, truncated: false, warnings: [] };
    const args = [
      '--json',
      '--fixed-strings',
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
      return this.fulltextWithJs(dir, query, searchId, opts, maxResults, onMatches);
    }

    return new Promise((resolve, reject) => {
      const proc: ChildProcess = spawn(rgPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const entry: PendingSearch = { proc, results: [], cancelled: false, warnings: [], onMatches };
      this.pending.set(searchId, entry);
      let fallbackStarted = false;
      let settled = false;
      let emitted = 0;
      let flushTimer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => {
        clearTimeout(flushTimer);
        flushTimer = undefined;
        if (entry.results.length > emitted)
          entry.onMatches?.(entry.results.slice(emitted), entry.results.length);
        emitted = entry.results.length;
      };

      const deletePending = () => {
        if (this.pending.get(searchId) === entry) {
          this.pending.delete(searchId);
        }
      };

      const finish = (results: FulltextMatch[]) => {
        if (settled) return;
        flush();
        settled = true;
        deletePending();
        resolve({
          matches: results,
          cancelled: entry.cancelled,
          truncated: results.length >= maxResults,
          warnings: entry.warnings,
        });
      };
      const fail = (error: Error) => {
        if (settled) return;
        clearTimeout(flushTimer);
        settled = true;
        deletePending();
        reject(error);
      };
      entry.onCancel = () => finish(entry.results);

      const decoder = new StringDecoder('utf8');
      let partialLine = '';
      let stderr = '';
      const consumeLine = (line: string) => {
        if (settled) return;
        const match = this.parseRgLine(line);
        if (!match) return;
        entry.results.push(match);
        if (entry.results.length - emitted >= 25) flush();
        else if (!flushTimer) flushTimer = setTimeout(flush, 100);
        if (entry.results.length >= maxResults) {
          // --max-count applies per file. Enforce the global limit while reading.
          finish(entry.results);
          proc.kill();
        }
      };
      proc.stdout?.on('data', (chunk: Buffer) => {
        if (settled || fallbackStarted) return;
        partialLine += decoder.write(chunk);
        let start = 0;
        let end: number;
        while (!settled && (end = partialLine.indexOf('\n', start)) !== -1) {
          consumeLine(partialLine.slice(start, end));
          start = end + 1;
        }
        partialLine = settled ? '' : partialLine.slice(start);
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        // Keep diagnostics bounded even when ripgrep encounters many inaccessible files.
        if (!settled) stderr = (stderr + chunk.toString()).slice(-8192);
      });

      proc.on('close', (code: number | null) => {
        if (fallbackStarted || settled) return;
        if (entry.cancelled) {
          finish([]);
          return;
        }

        consumeLine(partialLine + decoder.end());
        partialLine = '';
        if (settled) return;
        if (code !== 0 && code !== 1) {
          const detail = stderr.trim();
          if (code === 2 && entry.results.length > 0) {
            entry.warnings.push(detail || '部分文件无法读取，已保留可读取文件的搜索结果');
            finish(entry.results);
            return;
          }
          const err = new Error(
            detail ? `ripgrep exited with code ${code}: ${detail}` : `ripgrep exited with code ${code}`,
          );
          (err as any).code = 'PROCESS_FAILED';
          fail(err);
          return;
        }

        finish(entry.results);
      });

      proc.on('error', (err: Error) => {
        if (settled || fallbackStarted) return;
        if (entry.cancelled) {
          finish([]);
          return;
        }
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          fallbackStarted = true;
          entry.onMatches = (matches, total) => {
            emitted = total;
            onMatches?.(matches, total);
          };
          entry.warnings.push('搜索组件不可用，已使用基础搜索；忽略规则可能与原生搜索不同');
          this.searchWithJs(dir, query, opts, maxResults, entry).then(finish, fail);
          return;
        }
        (err as any).code = 'PROCESS_FAILED';
        fail(err);
      });
    });
  }

  cancel(searchId: string): void {
    const entry = this.pending.get(searchId);
    if (entry) {
      entry.cancelled = true;
      this.pending.delete(searchId);
      entry.onCancel?.();
      entry.proc?.kill();
    }
  }

  dispose(): void {
    for (const id of this.pending.keys()) this.cancel(id);
  }

  cancelOwner(owner: number): void {
    for (const id of this.pending.keys()) if (id.startsWith(`${owner}:`)) this.cancel(id);
  }

  // ── private ──

  private findRgPath(): string | null {
    // 优先从环境变量
    if (process.env.RG_PATH) return process.env.RG_PATH;

    const executable = process.platform === 'win32' ? 'rg.exe' : 'rg';
    const candidates: string[] = [];

    // spawn cannot execute an app.asar virtual path, even when the entry is unpacked.
    if (process.resourcesPath) {
      candidates.push(
        join(
          process.resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          '@lvce-editor',
          'ripgrep',
          'bin',
          executable,
        ),
        join(process.resourcesPath, 'node_modules', '@lvce-editor', 'ripgrep', 'bin', executable),
      );
    }

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

    candidates.push(join(process.cwd(), 'node_modules', '@lvce-editor', 'ripgrep', 'bin', executable));
    candidates.push(
      join(process.cwd(), 'node_modules', '@lvce-editor', '.ignored_ripgrep', 'bin', executable),
    );

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
    opts:
      | {
          filePattern?: string;
          excludePatterns?: string[];
          maxResults?: number;
          maxFileSize?: string;
        }
      | undefined,
    maxResults: number,
    onMatches?: (matches: FulltextMatch[], total: number) => void,
  ): Promise<SearchResult> {
    const entry: PendingSearch = {
      results: [],
      cancelled: false,
      warnings: ['搜索组件不可用，已使用基础搜索；忽略规则可能与原生搜索不同'],
      onMatches,
    };
    this.pending.set(searchId, entry);
    return new Promise((resolve, reject) => {
      const finish = () => {
        if (this.pending.get(searchId) === entry) this.pending.delete(searchId);
        resolve({
          matches: [...entry.results],
          cancelled: entry.cancelled,
          truncated: entry.results.length >= maxResults,
          warnings: [...entry.warnings],
        });
      };
      entry.onCancel = finish;
      this.searchWithJs(dir, query, opts, maxResults, entry).then(finish, (error) => {
        if (this.pending.get(searchId) === entry) this.pending.delete(searchId);
        reject(error);
      });
    });
  }

  private async searchWithJs(
    dir: string,
    query: string,
    opts:
      | {
          filePattern?: string;
          excludePatterns?: string[];
          maxResults?: number;
          maxFileSize?: string;
        }
      | undefined,
    maxResults: number,
    entry: PendingSearch,
  ): Promise<FulltextMatch[]> {
    if (!query) return [];
    const maxBytes = this.parseMaxFileSize(opts?.maxFileSize ?? '10M');
    const patterns = [...DEFAULT_EXCLUDE_PATTERNS, ...(opts?.excludePatterns ?? [])];
    const caseSensitive = /\p{Lu}/u.test(query);
    const needle = caseSensitive ? query : query.toLowerCase();
    const results = entry.results;

    const walk = async (currentDir: string): Promise<void> => {
      if (entry.cancelled || results.length >= maxResults) return;
      let dirents: Dirent[];
      try {
        dirents = (await readdir(currentDir, { withFileTypes: true })) as Dirent[];
      } catch (error) {
        if (currentDir === dir) throw error;
        if (entry.warnings.length < 20) entry.warnings.push(`${currentDir}: ${(error as Error).message}`);
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
        } catch (error) {
          if (entry.warnings.length < 20) entry.warnings.push(`${fullPath}: ${(error as Error).message}`);
          continue;
        }
        if (fileStat.size > maxBytes) continue;

        let content: string;
        try {
          content = await readFile(fullPath, 'utf8');
        } catch (error) {
          if (entry.warnings.length < 20) entry.warnings.push(`${fullPath}: ${(error as Error).message}`);
          continue;
        }

        if (content.includes('\0')) continue;
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
          entry.onMatches?.([results[results.length - 1]], results.length);
          if (results.length % 25 === 0) await new Promise<void>((resolve) => setImmediate(resolve));
        }
      }
    };

    await walk(dir);
    return results;
  }

  private parseMaxFileSize(value: string): number {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*([kmgt]?)(?:b)?$/i);
    if (!match) return 10 * 1024 * 1024;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier =
      unit === 't'
        ? 1024 ** 4
        : unit === 'g'
          ? 1024 ** 3
          : unit === 'm'
            ? 1024 ** 2
            : unit === 'k'
              ? 1024
              : 1;
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
        return (
          normalized === segment ||
          normalized.startsWith(`${segment}/`) ||
          normalized.includes(`/${segment}/`)
        );
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

  private parseRgLine(line: string): FulltextMatch | null {
    if (!line.trim()) return null;
    try {
      const event = JSON.parse(line);
      if (event.type !== 'match') return null;

      const data = event.data;
      const filePath = data?.path?.text;
      const lineNumber = data?.line_number;
      const lineContent = data?.lines?.text;
      const submatch = data?.submatches?.[0];
      if (typeof filePath !== 'string' || typeof lineNumber !== 'number' || typeof lineContent !== 'string') {
        return null;
      }

      // ripgrep reports UTF-8 byte offsets; the viewer slices JavaScript strings.
      const bytes = Buffer.from(lineContent, 'utf8');
      const start =
        typeof submatch?.start === 'number'
          ? bytes.subarray(0, submatch.start).toString('utf8').length + 1
          : 1;
      const end =
        typeof submatch?.end === 'number'
          ? bytes.subarray(0, submatch.end).toString('utf8').length + 1
          : start;
      return {
        filePath,
        fileName: filePath.split(/[/\\]/).pop() ?? filePath,
        lineNumber,
        columnStart: start,
        columnEnd: end,
        lineContent: lineContent.replace(/\r?\n$/, ''),
        matchText: submatch?.match?.text ?? '',
      };
    } catch {
      return null;
    }
  }
}
