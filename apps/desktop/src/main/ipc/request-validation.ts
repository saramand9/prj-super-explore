import { isAbsolute, win32 } from 'node:path';
import type { IpcChannels } from '@explore/shared';
import { UPDATE_CHANNELS } from '@explore/shared';

type Guard = (value: unknown) => boolean;
const text =
  (max = 32768): Guard =>
  (value) =>
    typeof value === 'string' && value.length <= max && !value.includes('\0');
const nonempty: Guard = (value) => text()(value) && (value as string).trim().length > 0;
const bool: Guard = (value) => typeof value === 'boolean';
const number =
  (min = 0, max = Number.MAX_SAFE_INTEGER): Guard =>
  (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer =
  (min = 0, max = Number.MAX_SAFE_INTEGER): Guard =>
  (value) =>
    number(min, max)(value) && Number.isInteger(value);
const oneOf =
  (...values: unknown[]): Guard =>
  (value) =>
    values.includes(value);
const optional =
  (guard: Guard): Guard =>
  (value) =>
    value === undefined || guard(value);
const nullable =
  (guard: Guard): Guard =>
  (value) =>
    value === null || guard(value);
const list =
  (guard: Guard, min = 0, max = 10000): Guard =>
  (value) =>
    Array.isArray(value) && value.length >= min && value.length <= max && value.every(guard);
const shape =
  (fields: Record<string, Guard>): Guard =>
  (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      Object.keys(record).every((key) => Object.hasOwn(fields, key)) &&
      Object.entries(fields).every(([key, guard]) => guard(record[key]))
    );
  };
const filePath: Guard = (value) =>
  nonempty(value) && (isAbsolute(value as string) || win32.isAbsolute(value as string));
const leaf: Guard = (value) =>
  nonempty(value) &&
  !/[<>:"/\\|?*\x00-\x1f]/.test(value as string) &&
  !/[. ]$/.test(value as string) &&
  !/^(?:\.{1,2}|con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value as string);
const pluginId: Guard = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) && value !== '..';
const id: Guard = (value) => nonempty(value) && (value as string).length <= 1024;
const pathList = list(filePath, 1);
const sort = shape({
  key: oneOf('name', 'size', 'modifiedAt', 'extension'),
  direction: oneOf('asc', 'desc'),
});
const scanFields = {
  path: filePath,
  maxDepth: optional(integer(0, 256)),
  excludePatterns: optional(list(text(1024), 0, 1000)),
};
const searchFields = {
  dir: filePath,
  query: text(65536),
  searchId: optional(id),
  filePattern: optional(text(4096)),
  excludePatterns: optional(list(text(1024), 0, 1000)),
  maxResults: optional(integer(1, 100000)),
  maxFileSize: optional((value: unknown) => typeof value === 'string' && /^\d+(?:[KMG]i?B?)?$/i.test(value)),
};
const operation = shape({
  sources: pathList,
  destDir: filePath,
  conflictStrategy: optional(oneOf('rename', 'skip', 'overwrite', 'error')),
  operationId: optional(id),
});
const bookmarkFields = {
  id,
  name: text(4096),
  path: filePath,
  icon: optional(text(1024)),
  sortOrder: number(),
};
const tab = shape({ path: filePath, label: text(4096), initialPath: filePath, pinned: optional(bool) });
const panel = shape({
  path: nullable(filePath),
  tabs: list(tab, 0, 1000),
  activeTabId: nullable(text(1024)),
  activeTabPath: optional(nullable(filePath)),
  activeTabIndex: optional(integer(-1, 1000)),
});
const space = shape({
  id,
  name: text(4096),
  pinned: optional(bool),
  lastOpenedAt: optional(number()),
  left: panel,
  right: panel,
});
const dialogFields = { title: optional(text(4096)), message: text(65536) };
const diagnosticFields = {
  source: optional(text(1024)),
  message: optional(text(16000)),
  stack: optional(text(16000)),
};
const voidRequest: Guard = (value) => value === undefined;

// Exhaustiveness makes adding an IPC capability without a runtime schema a type error.
const schemas = {
  [UPDATE_CHANNELS.getState]: voidRequest,
  [UPDATE_CHANNELS.check]: voidRequest,
  [UPDATE_CHANNELS.download]: voidRequest,
  [UPDATE_CHANNELS.install]: voidRequest,
  [UPDATE_CHANNELS.resolveSave]: shape({ requestId: integer(1), allow: bool }),
  'file:readDir': shape({ path: filePath, sort: optional(sort), showHidden: optional(bool) }),
  'file:stat': shape({ path: filePath }),
  'file:copy': operation,
  'file:move': operation,
  'file:delete': shape({ paths: pathList, permanent: optional(bool), operationId: optional(id) }),
  'file:cancelOperation': shape({ operationId: id }),
  'file:mkdir': shape({ parentPath: filePath, name: leaf }),
  'file:create': shape({ parentPath: filePath, name: leaf }),
  'file:rename': shape({ path: filePath, newName: leaf }),
  'file:exists': shape({ path: filePath }),
  'file:open': shape({ path: filePath }),
  'file:read': shape({
    path: filePath,
    maxSize: optional(integer(1, 64 * 1024 * 1024)),
    loadFull: optional(bool),
  }),
  'file:openInExplorer': shape({ path: filePath }),
  'file:showItemInFolder': shape({ path: filePath }),
  'file:watch': shape({ path: filePath }),
  'file:unwatch': shape({ watcherId: id }),
  'file:watchFile': shape({ path: filePath }),
  'file:unwatchFile': shape({ path: filePath }),
  'file:walkTree': shape(scanFields),
  'file:scan': shape({ ...scanFields, scanId: id }),
  'file:cancelScan': shape({ scanId: id }),
  'file:dirSizes': shape({ paths: pathList }),
  'search:fulltext': shape(searchFields),
  'search:run': shape({ ...searchFields, searchId: id }),
  'search:cancel': shape({ searchId: id }),
  'index:query': shape({
    pattern: text(65536),
    maxResults: optional(integer(1, 100000)),
    includePaths: optional(list(filePath)),
  }),
  'index:rebuild': shape({ paths: list(filePath) }),
  'index:status': voidRequest,
  'bookmark:list': voidRequest,
  'bookmark:add': shape(bookmarkFields),
  'bookmark:remove': shape({ id }),
  'bookmark:update': shape({
    id,
    updates: shape(
      Object.fromEntries(Object.entries(bookmarkFields).map(([key, guard]) => [key, optional(guard)])),
    ),
  }),
  'tabs:load': voidRequest,
  'tabs:save': shape({ side: oneOf('left', 'right'), tabs: list(tab, 0, 1000) }),
  'space:list': voidRequest,
  'space:save': shape({ spaces: list(space, 0, 1000) }),
  'plugin:scanExternal': voidRequest,
  'plugin:readFile': shape({ pluginId, file: oneOf('main.js') }),
  'plugin:install': shape({ sourcePath: filePath }),
  'window:readyForClose': voidRequest,
  'window:toggleLauncher': voidRequest,
  'window:resolveClose': shape({ allow: bool, requestId: integer(1) }),
  'window:closePending': shape({ requestId: integer(1) }),
  'dialog:openFolder': shape({ defaultPath: optional(filePath) }),
  'dialog:confirm': shape(dialogFields),
  'dialog:alert': shape({ ...dialogFields, type: optional(oneOf('info', 'warning', 'error')) }),
  'dialog:prompt': shape({ ...dialogFields, defaultValue: optional(text()) }),
  'dialog:choice': shape({
    ...dialogFields,
    buttons: list(shape({ id, label: text(4096) }), 1, 16),
    defaultId: optional(id),
    cancelId: optional(id),
    type: optional(oneOf('none', 'info', 'error', 'question', 'warning')),
  }),
  'settings:getAppearance': voidRequest,
  'settings:saveAppearance': shape({
    theme: pluginId,
    fontScale: number(80, 250),
    layoutMode: oneOf('single', 'dual'),
  }),
  'app:getVersion': voidRequest,
  'app:getPlatform': voidRequest,
  'app:getHomeDir': voidRequest,
  'app:openLogs': voidRequest,
  'app:copyDiagnostics': shape(diagnosticFields),
  'app:reportError': shape({ ...diagnosticFields, source: text(1024), message: text(16000) }),
} satisfies Record<keyof IpcChannels, Guard>;

export function validateRequest<C extends keyof IpcChannels>(
  channel: C,
  payload: unknown,
): asserts payload is IpcChannels[C]['req'] {
  if (!Object.hasOwn(schemas, channel) || !schemas[channel](payload)) {
    throw Object.assign(new TypeError(`Invalid request: ${channel}`), { code: 'INVALID_REQUEST' });
  }
}

export function validatePluginId(value: unknown): asserts value is string {
  if (!pluginId(value)) throw Object.assign(new TypeError('Invalid plugin id'), { code: 'INVALID_REQUEST' });
}
