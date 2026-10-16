import { app } from 'electron';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';

const MAX_LOG_BYTES = 1024 * 1024;

export class DiagnosticsService {
  private directory: string | null = null;

  init(): void {
    if (this.directory) return;
    const directory = join(app.getPath('userData'), 'logs');
    try { mkdirSync(directory, { recursive: true }); this.directory = directory; }
    catch (error) { console.error('[diagnostics] cannot open log directory', error); }
  }

  get logDirectory(): string { return this.directory ?? join(app.getPath('userData'), 'logs'); }

  log(source: string, error: unknown): void {
    const detail = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
    const record = `${new Date().toISOString()} [${source.slice(0, 80)}] ${detail.slice(0, 12000)}\n`;
    if (!this.directory) { console.error(record); return; }
    try {
      const file = join(this.directory, 'app.log');
      if (existsSync(file) && statSync(file).size + Buffer.byteLength(record) > MAX_LOG_BYTES) {
        const backup = `${file}.1`;
        if (existsSync(backup)) unlinkSync(backup);
        renameSync(file, backup);
      }
      appendFileSync(file, record, 'utf8');
    } catch (failure) { console.error('[diagnostics] cannot write log', failure); }
  }

  snapshot(details?: { source?: string; message?: string; stack?: string }): string {
    let recent = '';
    try { recent = readFileSync(join(this.logDirectory, 'app.log'), 'utf8').slice(-16000); } catch { /* Logs may be unavailable. */ }
    return [
      `Explore ${app.getVersion()} | ${process.platform} ${process.arch}`,
      `Electron ${process.versions.electron} | ${new Date().toISOString()}`,
      ...[details?.source, details?.message, details?.stack].filter((value) => typeof value === 'string').map((value) => value!.slice(0, 12000)),
      'Recent local logs:', recent,
    ].join('\n');
  }
}
