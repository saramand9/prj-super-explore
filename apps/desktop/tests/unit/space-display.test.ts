import { describe, expect, it } from 'vitest';
import type { Space } from '@explore/shared';
import {
  buildSpaceSections,
  formatSpacePath,
  getMostRecentSpace,
  getSpaceIdentityPath,
  getSpaceOverview,
  matchesSpace,
  rankSpaces,
} from '../../src/renderer/plugins/file-explorer/utils/space-display';

function createSpace(): Space {
  return {
    id: 'workspace-1',
    name: '中文项目',
    left: {
      tabs: [
        {
          path: 'D:\\dev\\products\\desktop',
          label: 'desktop',
          initialPath: 'D:\\dev\\products\\desktop',
          pinned: false,
        },
        {
          path: 'D:\\dev\\products\\shared',
          label: 'shared',
          initialPath: 'D:\\dev\\products\\shared',
          pinned: false,
        },
      ],
      activeTabId: null,
      activeTabPath: 'D:\\dev\\products\\desktop',
      path: 'D:\\dev\\products\\desktop',
    },
    right: {
      tabs: [
        {
          path: 'D:\\docs\\release-notes',
          label: 'release-notes',
          initialPath: 'D:\\docs\\release-notes',
          pinned: false,
        },
      ],
      activeTabId: null,
      activeTabPath: 'D:\\docs\\release-notes',
      path: 'D:\\docs\\release-notes',
    },
  };
}

function createNamedSpace(
  id: string,
  name: string,
  metadata: Pick<Space, 'pinned' | 'lastOpenedAt'> = {},
): Space {
  const base = createSpace();
  return {
    ...base,
    ...metadata,
    id,
    name,
    left: {
      ...base.left,
      path: `D:\\workspaces\\${name}`,
      activeTabPath: `D:\\workspaces\\${name}`,
      tabs: [
        {
          path: `D:\\workspaces\\${name}`,
          label: name,
          initialPath: `D:\\workspaces\\${name}`,
          pinned: false,
        },
      ],
    },
  };
}

describe('workspace display helpers', () => {
  it('builds a deduplicated overview with both panel paths', () => {
    const overview = getSpaceOverview(createSpace());

    expect(overview.leftPath).toBe('D:\\dev\\products\\desktop');
    expect(overview.rightPath).toBe('D:\\docs\\release-notes');
    expect(overview.pathCount).toBe(3);
    expect(overview.tabCount).toBe(3);
  });

  it('keeps the drive and identifying tail of long paths', () => {
    expect(formatSpacePath('D:\\dev\\products\\desktop')).toBe('D:\\...\\products\\desktop');
    expect(formatSpacePath('/srv/projects/explore/docs')).toBe('/.../explore/docs');
    expect(formatSpacePath('C:\\')).toBe('C:\\');
    expect(formatSpacePath('\\\\fileserver\\team\\projects\\desktop')).toBe(
      '\\\\fileserver\\...\\projects\\desktop',
    );
    expect(formatSpacePath(null)).toBe('未打开');
  });

  it('matches workspace names, pinyin, and any saved directory', () => {
    const space = createSpace();

    expect(matchesSpace(space, '中文')).toBe(true);
    expect(matchesSpace(space, 'zhongwen')).toBe(true);
    expect(matchesSpace(space, 'zwxm')).toBe(true);
    expect(matchesSpace(space, 'release-notes')).toBe(true);
    expect(matchesSpace(space, 'products shared')).toBe(true);
    expect(matchesSpace(space, 'missing')).toBe(false);
  });

  it('partitions dozens of workspaces without duplicates', () => {
    const spaces = [
      createNamedSpace('current', '当前项目', { lastOpenedAt: 1000 }),
      createNamedSpace('pinned-b', '固定 10', { pinned: true, lastOpenedAt: 900 }),
      createNamedSpace('pinned-a', '固定 2', { pinned: true, lastOpenedAt: 800 }),
      ...Array.from({ length: 7 }, (_, index) =>
        createNamedSpace(`recent-${index}`, `最近 ${index + 1}`, { lastOpenedAt: 700 - index }),
      ),
      createNamedSpace('project-10', 'Project 10'),
      createNamedSpace('project-2', 'Project 2'),
    ];

    const sections = buildSpaceSections(spaces, 'current');
    const flattened = sections.flatMap((section) => section.spaces);

    expect(sections.map((section) => section.id)).toEqual(['current', 'pinned', 'recent', 'other']);
    expect(sections.find((section) => section.id === 'pinned')?.spaces.map((space) => space.id)).toEqual([
      'pinned-a',
      'pinned-b',
    ]);
    expect(sections.find((section) => section.id === 'recent')?.spaces).toHaveLength(5);
    expect(flattened).toHaveLength(spaces.length);
    expect(new Set(flattened.map((space) => space.id)).size).toBe(spaces.length);

    const otherNames = sections.find((section) => section.id === 'other')?.spaces.map((space) => space.name);
    expect(otherNames?.indexOf('Project 2')).toBeLessThan(otherNames?.indexOf('Project 10') ?? -1);
  });

  it('ranks exact names before prefixes, pinyin, and matching paths', () => {
    const exact = createNamedSpace('exact', '客户资料');
    const prefix = createNamedSpace('prefix', '客户资料归档');
    const pinyinMatch = createNamedSpace('pinyin', '客户中心');
    const pathMatch = createNamedSpace('path', 'Archive');
    pathMatch.right.path = 'D:\\客户资料\\发布';
    pathMatch.right.activeTabPath = pathMatch.right.path;

    expect(rankSpaces([pathMatch, prefix, pinyinMatch, exact], '客户资料').map((space) => space.id)).toEqual([
      'exact',
      'prefix',
      'path',
    ]);
    expect(rankSpaces([pathMatch, pinyinMatch], 'khzx').map((space) => space.id)).toEqual(['pinyin']);
    expect(getSpaceIdentityPath(pathMatch, '客户资料')).toBe('D:\\客户资料\\发布');
  });

  it('selects the most recently opened workspace while preserving first-item fallback', () => {
    const first = createNamedSpace('first', 'First');
    const older = createNamedSpace('older', 'Older', { lastOpenedAt: 10 });
    const newest = createNamedSpace('newest', 'Newest', { lastOpenedAt: 20 });

    expect(getMostRecentSpace([first, older, newest])?.id).toBe('newest');
    expect(getMostRecentSpace([first, createNamedSpace('second', 'Second')])?.id).toBe('first');
  });
});
