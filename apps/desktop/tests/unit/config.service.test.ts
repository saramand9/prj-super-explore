import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { tmpdir } from 'os';
import type { Space } from '@explore/shared';
import { ConfigService } from '../../src/main/services/config.service';

const electronMock = vi.hoisted(() => ({ app: { getPath: vi.fn() } }));
vi.mock('electron', () => electronMock);

function savedSpace(id = 'saved'): Space {
  return {
    id,
    name: id,
    left: { tabs: [], path: null, activeTabId: null },
    right: { tabs: [], path: null, activeTabId: null },
  };
}

describe('configuration recovery', () => {
  let root: string;
  let configDir: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'explore-config-'));
    configDir = join(root, 'config');
    await mkdir(configDir);
    electronMock.app.getPath.mockReturnValue(root);
  });
  afterEach(async () => {
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !root.includes('explore-config-'))
      throw new Error('Unsafe fixture path');
    await rm(root, { recursive: true, force: true });
  });

  it('merges defaults into older settings without enabling explicitly disabled indexing', async () => {
    await writeFile(join(configDir, 'config.json'), JSON.stringify({ indexPaths: [], theme: 'linear' }));
    const config = new ConfigService();
    config.init();
    expect(config.getSettings()).toMatchObject({
      indexPaths: [],
      theme: 'linear',
      fontScale: 130,
      layoutMode: 'dual',
    });
    expect(config.getSettings().excludePatterns).toContain('node_modules');
  });

  it('persists appearance settings across service restarts', async () => {
    const config = new ConfigService();
    config.init();
    await config.saveAppearance({ theme: 'linear', fontScale: 160, layoutMode: 'single' });
    const restarted = new ConfigService();
    restarted.init();
    expect(restarted.getAppearance()).toEqual({ theme: 'linear', fontScale: 160, layoutMode: 'single' });
  });

  it('rejects invalid appearance values without changing saved settings', async () => {
    const config = new ConfigService();
    config.init();
    await expect(
      config.saveAppearance({ theme: 'linear', fontScale: Infinity, layoutMode: 'dual' }),
    ).rejects.toThrow('无效');
    expect(config.getSettings().fontScale).toBe(130);
  });

  it('recovers a damaged workspace from the newest valid backup', async () => {
    await mkdir(join(configDir, 'backups'));
    await writeFile(
      join(configDir, 'backups', 'spaces.json.2025.autosave.bak'),
      JSON.stringify([savedSpace()]),
    );
    await writeFile(join(configDir, 'spaces.json'), '[null]');
    const config = new ConfigService();
    config.init();
    expect(config.getSpaces()).toEqual([savedSpace()]);
    config.saveSpaces([savedSpace('recovered')]);
    expect(JSON.parse(await readFile(join(configDir, 'spaces.json'), 'utf8'))[0].id).toBe('recovered');
  });

  it('blocks overwrite of an unreadable workspace and permits retry after repair', async () => {
    const file = join(configDir, 'spaces.json');
    await writeFile(file, '{broken');
    const config = new ConfigService();
    config.init();
    expect(() => config.getSpaces()).toThrow('配置损坏');
    expect(() => config.saveSpaces([savedSpace('replacement')])).toThrow('Refusing');
    await expect(readFile(file, 'utf8')).resolves.toBe('{broken');
    await writeFile(file, JSON.stringify([savedSpace('repaired')]));
    expect(config.getSpaces()[0].id).toBe('repaired');
  });

  it.each(['tabs', 'activeTabPath', 'pinned', 'lastOpenedAt'] as const)(
    'rejects malformed %s before touching the saved file',
    async (field) => {
      const config = new ConfigService();
      config.init();
      config.saveSpaces([savedSpace()]);
      const malformed = savedSpace();
      if (field === 'tabs') malformed.left.tabs = [null as any];
      else if (field === 'activeTabPath') malformed.left.activeTabPath = {} as any;
      else (malformed as any)[field] = 'invalid';
      expect(() => config.saveSpaces([malformed])).toThrow('Invalid');
      expect(JSON.parse(await readFile(join(configDir, 'spaces.json'), 'utf8'))).toEqual([savedSpace()]);
    },
  );

  it('keeps the previous in-memory state and cleans its temp file after a failed write', async () => {
    const config = new ConfigService();
    config.init();
    config.saveSpaces([savedSpace()]);
    const previous = config.getAppearance();
    await mkdir(join(configDir, 'config.json'));
    await expect(
      config.saveAppearance({ theme: 'linear', fontScale: 160, layoutMode: 'single' }),
    ).rejects.toThrow();
    expect(config.getAppearance()).toEqual(previous);
    expect((await readdir(configDir)).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});
