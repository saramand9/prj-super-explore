import type { Space } from '@explore/shared';
import { pinyin } from 'pinyin-pro';

export interface SpaceOverview {
  leftPath: string | null;
  rightPath: string | null;
  paths: string[];
  pathCount: number;
  tabCount: number;
}

export type SpaceSectionId = 'current' | 'pinned' | 'recent' | 'other';

export interface SpaceSection {
  id: SpaceSectionId;
  label: string;
  spaces: Space[];
}

const SPACE_NAME_COLLATOR = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

function currentPanelPath(panel: Space['left']): string | null {
  return panel.path ?? panel.activeTabPath ?? panel.tabs.at(-1)?.path ?? null;
}

function pathKey(path: string): string {
  return path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
}

export function getSpaceOverview(space: Space): SpaceOverview {
  const leftPath = currentPanelPath(space.left);
  const rightPath = currentPanelPath(space.right);
  const candidates = [
    leftPath,
    rightPath,
    ...space.left.tabs.map((tab) => tab.path),
    ...space.right.tabs.map((tab) => tab.path),
  ];
  const seen = new Set<string>();
  const paths: string[] = [];

  for (const path of candidates) {
    if (!path) continue;
    const key = pathKey(path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    paths.push(path);
  }

  return {
    leftPath,
    rightPath,
    paths,
    pathCount: paths.length,
    tabCount: space.left.tabs.length + space.right.tabs.length,
  };
}

export function formatSpacePath(path: string | null, tailSegments = 2): string {
  if (!path) return '未打开';
  if (/^[a-z]:[\\/]$/i.test(path)) return path;
  const trimmed = path.replace(/[\\/]+$/, '');
  if (!trimmed) return path;

  const separator = trimmed.includes('\\') ? '\\' : '/';
  const segments = trimmed.split(/[\\/]+/).filter(Boolean);
  if (segments.length <= tailSegments + 1) return trimmed;

  const drive = /^[a-z]:$/i.test(segments[0]) ? `${segments[0]}${separator}` : '';
  const uncRoot = trimmed.startsWith('\\\\') ? `\\\\${segments[0]}${separator}` : '';
  const root = drive || uncRoot || (trimmed.startsWith(separator) ? separator : '');
  const tail = segments.slice(-tailSegments).join(separator);
  return `${root}...${separator}${tail}`;
}

function searchableKeys(value: string): string[] {
  const lower = value.toLowerCase();
  if (!/[一-鿿]/.test(value)) return [lower];

  const fullPinyin = pinyin(value, { toneType: 'none', type: 'array', v: true }).join('').toLowerCase();
  const initials = pinyin(value, { pattern: 'first', toneType: 'none', type: 'array' })
    .join('')
    .toLowerCase();
  return [lower, fullPinyin, initials];
}

export function compareSpacesByName(a: Space, b: Space): number {
  return SPACE_NAME_COLLATOR.compare(a.name, b.name) || SPACE_NAME_COLLATOR.compare(a.id, b.id);
}

export function getMostRecentSpace(spaces: Space[]): Space | undefined {
  return spaces.reduce<Space | undefined>((mostRecent, space) => {
    if (!mostRecent) return space;
    return (space.lastOpenedAt ?? 0) > (mostRecent.lastOpenedAt ?? 0) ? space : mostRecent;
  }, undefined);
}

export function buildSpaceSections(spaces: Space[], activeSpaceId: string, recentLimit = 5): SpaceSection[] {
  const used = new Set<string>();
  const sections: SpaceSection[] = [];
  const current = spaces.find((space) => space.id === activeSpaceId);

  if (current) {
    used.add(current.id);
    sections.push({ id: 'current', label: '当前', spaces: [current] });
  }

  const pinned = spaces.filter((space) => space.pinned && !used.has(space.id)).sort(compareSpacesByName);
  if (pinned.length > 0) {
    pinned.forEach((space) => used.add(space.id));
    sections.push({ id: 'pinned', label: '固定', spaces: pinned });
  }

  const recent = spaces
    .filter((space) => !used.has(space.id) && (space.lastOpenedAt ?? 0) > 0)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || compareSpacesByName(a, b))
    .slice(0, recentLimit);
  if (recent.length > 0) {
    recent.forEach((space) => used.add(space.id));
    sections.push({ id: 'recent', label: '最近', spaces: recent });
  }

  const other = spaces.filter((space) => !used.has(space.id)).sort(compareSpacesByName);
  if (other.length > 0) sections.push({ id: 'other', label: '其他工作区', spaces: other });

  return sections;
}

interface ScoredSpace {
  space: Space;
  score: number;
}

function scoreTerm(space: Space, term: string): number | null {
  const name = space.name.toLowerCase();
  if (name === term) return 0;
  if (name.startsWith(term)) return 10;
  if (name.includes(term)) return 20;

  const nameKeys = searchableKeys(space.name).slice(1);
  if (nameKeys.some((key) => key.startsWith(term))) return 30;
  if (nameKeys.some((key) => key.includes(term))) return 35;

  const paths = getSpaceOverview(space).paths;
  if (paths.some((path) => path.toLowerCase().includes(term))) return 40;
  if (
    paths.some((path) =>
      searchableKeys(path)
        .slice(1)
        .some((key) => key.includes(term)),
    )
  )
    return 50;
  return null;
}

export function rankSpaces(spaces: Space[], query: string): Space[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...spaces].sort(compareSpacesByName);

  const scored: ScoredSpace[] = [];
  for (const space of spaces) {
    let score = 0;
    let matched = true;
    for (const term of terms) {
      const termScore = scoreTerm(space, term);
      if (termScore === null) {
        matched = false;
        break;
      }
      score += termScore;
    }
    if (matched) scored.push({ space, score });
  }

  return scored
    .sort(
      (a, b) =>
        a.score - b.score ||
        Number(Boolean(b.space.pinned)) - Number(Boolean(a.space.pinned)) ||
        (b.space.lastOpenedAt ?? 0) - (a.space.lastOpenedAt ?? 0) ||
        compareSpacesByName(a.space, b.space),
    )
    .map(({ space }) => space);
}

export function getSpaceIdentityPath(space: Space, query = ''): string | null {
  const overview = getSpaceOverview(space);
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length > 0) {
    const matchingPath = overview.paths.find((path) => {
      const keys = searchableKeys(path);
      return terms.some((term) => keys.some((key) => key.includes(term)));
    });
    if (matchingPath) return matchingPath;
  }
  return overview.leftPath ?? overview.rightPath ?? overview.paths[0] ?? null;
}

export function matchesSpace(space: Space, query: string): boolean {
  return rankSpaces([space], query).length === 1;
}
