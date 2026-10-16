import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';
import { DiagnosticsService } from '../../src/main/services/diagnostics.service';
import { createFixture, removeFixture } from '../helpers/fixture';

const app = vi.hoisted(() => ({ getPath: vi.fn(), getVersion: () => 'test-version' }));
vi.mock('electron', () => ({ app }));

describe('local diagnostics', () => {
  let root: string;
  beforeEach(async () => {
    root = await createFixture('logs');
    app.getPath.mockReturnValue(root);
  });
  afterEach(async () => removeFixture(root));

  it('records errors and produces a useful diagnostic snapshot', async () => {
    const diagnostics = new DiagnosticsService();
    diagnostics.init();
    diagnostics.log('test', new Error('fixture failure'));
    const snapshot = diagnostics.snapshot({ source: 'Panel-left', message: 'render failed' });
    expect(snapshot).toContain('test-version');
    expect(snapshot).toContain('Panel-left');
    expect(snapshot).toContain('fixture failure');
    expect(await readFile(join(root, 'logs/app.log'), 'utf8')).toContain('[test]');
  });

  it('bounds each record and rotates logs instead of growing indefinitely', async () => {
    const diagnostics = new DiagnosticsService();
    diagnostics.init();
    for (let i = 0; i < 200; i++) diagnostics.log('rotation', 'x'.repeat(20000));
    expect((await stat(join(root, 'logs/app.log'))).size).toBeLessThanOrEqual(1024 * 1024);
    expect((await stat(join(root, 'logs/app.log.1'))).size).toBeLessThanOrEqual(1024 * 1024);
  });
});
