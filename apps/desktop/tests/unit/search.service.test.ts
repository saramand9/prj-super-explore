import { EventEmitter } from 'events';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { spawn } from 'child_process';
import { SearchService } from '../../src/main/services/search.service';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const spawnMock = vi.mocked(spawn);

describe('SearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RG_PATH = process.execPath;
  });

  it('parses ripgrep JSON matches from Chinese and space paths', async () => {
    mockRipgrep({
      code: 0,
      stdoutLines: [
        rgMatch('D:/tmp/中文 目录/hello file.txt', 3, 'hello needle\n', 6, 12, 'needle'),
      ],
    });

    const service = createService();
    const results = await service.fulltext('D:/tmp/中文 目录', 'needle', 'search-1', { maxResults: 25 });

    expect(results).toEqual([
      {
        filePath: 'D:/tmp/中文 目录/hello file.txt',
        fileName: 'hello file.txt',
        lineNumber: 3,
        lineContent: 'hello needle',
        columnStart: 7,
        columnEnd: 13,
        matchText: 'needle',
      },
    ]);
  });

  it('passes max result, file size, and node_modules exclusion arguments', async () => {
    mockRipgrep({ code: 1, stdoutLines: [] });

    const service = createService();
    await service.fulltext('D:/repo', 'query', 'search-args', {
      filePattern: '*.ts',
      excludePatterns: ['**/custom/**'],
      maxResults: 12,
      maxFileSize: '2M',
    });

    const [, args] = spawnMock.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining([
      '--max-count',
      '12',
      '--max-filesize',
      '2M',
      '--glob',
      '*.ts',
      '--glob',
      '!**/node_modules/**',
      '--glob',
      '!**/custom/**',
      '--',
      'query',
      'D:/repo',
    ]));
  });

  it('returns empty results for empty directories or no matches', async () => {
    mockRipgrep({ code: 1, stdoutLines: [] });

    const service = createService();
    const results = await service.fulltext('D:/empty', 'missing', 'empty-search');

    expect(results).toEqual([]);
  });

  it('rejects with process errors when ripgrep fails', async () => {
    mockRipgrep({ code: 2, stderr: 'permission denied' });

    const service = createService();

    await expect(service.fulltext('D:/protected', 'needle', 'search-error')).rejects.toMatchObject({
      code: 'PROCESS_FAILED',
      message: expect.stringContaining('permission denied'),
    });
  });

  it('falls back to JS search when ripgrep is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'explore-search-'));
    process.env.RG_PATH = join(root, 'missing-rg.exe');
    mockSpawnError(Object.assign(new Error('spawn missing-rg ENOENT'), { code: 'ENOENT' }));

    try {
      await writeFile(join(root, 'note.txt'), 'first line\nNeedle here\n', 'utf8');
      await writeFile(join(root, 'skip.md'), 'Needle hidden by pattern\n', 'utf8');
      await mkdir(join(root, 'node_modules'));
      await writeFile(join(root, 'node_modules', 'dep.txt'), 'Needle ignored\n', 'utf8');

      const service = createService();
      const results = await service.fulltext(root, 'Needle', 'fallback-search', {
        filePattern: '*.txt',
        maxResults: 10,
      });

      expect(results).toEqual([
        expect.objectContaining({
          filePath: join(root, 'note.txt'),
          fileName: 'note.txt',
          lineNumber: 2,
          columnStart: 1,
          columnEnd: 7,
          lineContent: 'Needle here',
          matchText: 'Needle',
        }),
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('cancels older searches with the same search id', async () => {
    const first = mockHangingRipgrep();
    mockRipgrep({
      code: 0,
      stdoutLines: [rgMatch('D:/repo/result.txt', 1, 'needle\n', 0, 6, 'needle')],
    });

    const service = createService();
    const oldSearch = service.fulltext('D:/repo', 'old', 'same-id');
    const newSearch = service.fulltext('D:/repo', 'needle', 'same-id');

    first.close(0);
    await expect(oldSearch).resolves.toEqual([]);
    await expect(newSearch).resolves.toHaveLength(1);
    expect(first.kill).toHaveBeenCalled();
  });
});

function createService(): SearchService {
  const service = new SearchService({} as any);
  service.init();
  return service;
}

function rgMatch(
  filePath: string,
  lineNumber: number,
  lineContent: string,
  start: number,
  end: number,
  matchText: string,
): string {
  return JSON.stringify({
    type: 'match',
    data: {
      path: { text: filePath },
      line_number: lineNumber,
      lines: { text: lineContent },
      submatches: [{ start, end, match: { text: matchText } }],
    },
  });
}

function mockRipgrep(options: { code: number; stdoutLines?: string[]; stderr?: string }): void {
  spawnMock.mockImplementationOnce(() => {
    const proc = makeProcess();
    setImmediate(() => {
      for (const line of options.stdoutLines ?? []) {
        proc.stdout.write(`${line}\n`);
      }
      if (options.stderr) proc.stderr.write(options.stderr);
      proc.stdout.end();
      proc.stderr.end();
      proc.emit('close', options.code);
    });
    return proc as any;
  });
}

function mockSpawnError(error: Error & { code?: string }): void {
  spawnMock.mockImplementationOnce(() => {
    const proc = makeProcess();
    setImmediate(() => {
      proc.emit('error', error);
    });
    return proc as any;
  });
}

function mockHangingRipgrep(): ReturnType<typeof makeProcess> {
  const proc = makeProcess();
  spawnMock.mockImplementationOnce(() => proc as any);
  return proc;
}

function makeProcess() {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: ReturnType<typeof vi.fn>;
    close: (code: number) => void;
  };
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.close = (code: number) => {
    proc.stdout.end();
    proc.stderr.end();
    proc.emit('close', code);
  };
  return proc;
}
