import {
  type CSSProperties,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { Space } from '@explore/shared';
import { Check, Layers, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import { appDialog } from '../../../framework/dialogs/app-dialog';
import { useSpaceStore } from '../space-store';
import {
  buildSpaceSections,
  formatSpacePath,
  getSpaceIdentityPath,
  getSpaceOverview,
  rankSpaces,
} from '../utils/space-display';

const SWITCHER_WIDTH = 680;
const SWITCHER_HEIGHT = 620;
const VIEWPORT_GUTTER = 8;

const LAST_OPENED_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export interface WorkspaceSwitcherProps {
  open: boolean;
  onClose: () => void;
  variant: 'anchored' | 'modal';
  anchorRef?: RefObject<HTMLElement>;
}

interface AnchoredPosition {
  x: number;
  y: number;
  height: number;
}

export function getWorkspaceDisplayName(space: Pick<Space, 'name'>): string {
  return space.name === 'Default' ? '默认工作区' : space.name;
}

function rankWorkspaceOptions(spaces: Space[], query: string): Space[] {
  // Localize the built-in name for display/search without rewriting saved workspaces.
  const searchable = spaces.map((space) => space.name === 'Default'
    ? { ...space, name: `${getWorkspaceDisplayName(space)} Default` }
    : space);
  const byId = new Map(spaces.map((space) => [space.id, space]));
  return rankSpaces(searchable, query).map((space) => byId.get(space.id)!);
}

function fullPathTitle(space: Space): string {
  const overview = getSpaceOverview(space);
  return `${getWorkspaceDisplayName(space)}\n左侧：${overview.leftPath ?? '未打开'}\n右侧：${overview.rightPath ?? '未打开'}`;
}

function WorkspaceRow({
  space,
  query,
  active,
  selected,
  testId,
  rowRef,
  onSelect,
  onOpen,
}: {
  space: Space;
  query: string;
  active: boolean;
  selected: boolean;
  testId: string;
  rowRef: (element: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const identityPath = getSpaceIdentityPath(space, query);

  return (
    <button
      ref={rowRef}
      data-testid={testId}
      data-workspace-id={space.id}
      className={`relative flex min-h-12 w-full items-center gap-2 px-3 py-1 text-left transition-colors ${
        selected ? 'bg-accent/15' : 'hover:bg-surface-lighter'
      }`}
      role="option"
      aria-selected={selected}
      onMouseEnter={onSelect}
      onFocus={onSelect}
      onClick={onOpen}
      title={fullPathTitle(space)}
    >
      {selected && <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-accent" />}
      <Layers className={`h-[14px] w-[14px] flex-shrink-0 ${active ? 'text-accent' : 'text-text-muted'}`} />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`truncate text-xs font-medium leading-snug ${active ? 'text-accent' : 'text-text-primary'}`}>
            {getWorkspaceDisplayName(space)}
          </span>
          {active && (
            <span className="flex-shrink-0 rounded-sm bg-accent/15 px-1 text-[0.6875rem] text-accent">当前</span>
          )}
          {space.pinned && <Pin className="h-3 w-3 flex-shrink-0 fill-current text-text-muted" />}
        </span>
        <span className="block truncate font-mono text-[0.6875rem] leading-snug text-text-secondary">
          {formatSpacePath(identityPath)}
        </span>
      </span>
    </button>
  );
}

function WorkspacePreview({
  space,
  active,
  onlySpace,
  editing,
  editValue,
  editInputRef,
  onEditValueChange,
  onBeginRename,
  onConfirmRename,
  onCancelRename,
  onTogglePinned,
  onDelete,
}: {
  space: Space | null;
  active: boolean;
  onlySpace: boolean;
  editing: boolean;
  editValue: string;
  editInputRef: RefObject<HTMLInputElement>;
  onEditValueChange: (value: string) => void;
  onBeginRename: () => void;
  onConfirmRename: () => void;
  onCancelRename: () => void;
  onTogglePinned: () => void;
  onDelete: () => void;
}) {
  if (!space) {
    return (
      <aside className="flex h-[150px] flex-shrink-0 items-center justify-center border-t border-border text-xs text-text-secondary min-[720px]:h-auto min-[720px]:w-[310px] min-[720px]:border-l min-[720px]:border-t-0">
        没有可预览的工作区
      </aside>
    );
  }

  const overview = getSpaceOverview(space);
  const primaryPaths = new Set(
    [overview.leftPath, overview.rightPath].filter(Boolean).map((path) => path!.toLowerCase()),
  );
  const otherPaths = overview.paths.filter((path) => !primaryPaths.has(path.toLowerCase()));

  return (
    <aside
      data-testid="workspace-preview"
      className="flex h-[170px] min-h-0 flex-shrink-0 flex-col border-t border-border min-[720px]:h-auto min-[720px]:w-[310px] min-[720px]:border-l min-[720px]:border-t-0"
    >
      <div className="flex min-h-11 flex-shrink-0 items-center gap-2 border-b border-border px-3 py-1">
        {editing ? (
          <>
            <input
              ref={editInputRef}
              data-testid="workspace-rename-input"
              className="h-7 min-w-0 flex-1 rounded border border-accent/60 bg-surface px-2 text-xs text-text-primary outline-none"
              value={editValue}
              onChange={(event) => onEditValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') onConfirmRename();
                if (event.key === 'Escape') {
                  event.stopPropagation();
                  onCancelRename();
                }
              }}
            />
            <button
              className="flex h-[28px] w-[28px] items-center justify-center rounded text-text-muted hover:bg-accent/15 hover:text-accent"
              title="确认重命名"
              onClick={onConfirmRename}
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-[28px] w-[28px] items-center justify-center rounded text-text-muted hover:bg-surface-lighter hover:text-text-primary"
              title="取消"
              onClick={onCancelRename}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-text-primary">{getWorkspaceDisplayName(space)}</span>
            <button
              data-testid="workspace-pin-toggle"
              className={`flex h-[28px] w-[28px] items-center justify-center rounded transition-colors hover:bg-surface-lighter ${
                space.pinned ? 'text-accent' : 'text-text-muted hover:text-text-primary'
              }`}
              title={space.pinned ? '取消固定' : '固定工作区'}
              onClick={onTogglePinned}
            >
              <Pin className={`h-3.5 w-3.5 ${space.pinned ? 'fill-current' : ''}`} />
            </button>
            <button
              className="flex h-[28px] w-[28px] items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-lighter hover:text-text-primary"
              title="重命名工作区"
              onClick={onBeginRename}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              className="flex h-[28px] w-[28px] items-center justify-center rounded text-text-muted transition-colors hover:bg-red-500/15 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-text-muted"
              title={onlySpace ? '至少保留一个工作区' : '删除工作区'}
              onClick={onDelete}
              disabled={onlySpace}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-[0.6875rem] text-text-secondary">
          {active && <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-accent">当前工作区</span>}
          {space.pinned && <span className="rounded-sm bg-surface-lighter px-1.5 py-0.5">已固定</span>}
          <span>{overview.pathCount} 个目录</span>
          <span>{overview.tabCount} 个标签页</span>
        </div>

        <div className="border-b border-border px-3 py-2">
          <div className="mb-1 text-[0.6875rem] text-text-secondary">左侧目录</div>
          <div className="line-clamp-2 break-all font-mono text-xs leading-relaxed text-text-primary" title={overview.leftPath ?? undefined}>
            {overview.leftPath ?? '未打开'}
          </div>
        </div>
        <div className="border-b border-border px-3 py-2">
          <div className="mb-1 text-[0.6875rem] text-text-secondary">右侧目录</div>
          <div className="line-clamp-2 break-all font-mono text-xs leading-relaxed text-text-primary" title={overview.rightPath ?? undefined}>
            {overview.rightPath ?? '未打开'}
          </div>
        </div>

        {otherPaths.length > 0 && (
          <div className="border-b border-border px-3 py-2">
            <div className="mb-1.5 text-[0.6875rem] text-text-secondary">其他已保存目录</div>
            <div className="space-y-1">
              {otherPaths.slice(0, 4).map((path) => (
                <div key={path} className="truncate font-mono text-[0.6875rem] text-text-secondary" title={path}>
                  {formatSpacePath(path, 3)}
                </div>
              ))}
              {otherPaths.length > 4 && (
                <div className="text-[0.6875rem] text-text-secondary">另有 {otherPaths.length - 4} 个目录</div>
              )}
            </div>
          </div>
        )}

        <div className="px-3 py-2 text-[0.6875rem] text-text-secondary">
          最近使用：{space.lastOpenedAt ? LAST_OPENED_FORMATTER.format(space.lastOpenedAt) : '未记录'}
        </div>
      </div>
    </aside>
  );
}

export function WorkspaceSwitcher({ open, onClose, variant, anchorRef }: WorkspaceSwitcherProps) {
  const spaces = useSpaceStore((state) => state.spaces);
  const activeSpaceId = useSpaceStore((state) => state.activeSpaceId);
  const switchSpace = useSpaceStore((state) => state.switchSpace);
  const addSpace = useSpaceStore((state) => state.addSpace);
  const removeSpace = useSpaceStore((state) => state.removeSpace);
  const renameSpace = useSpaceStore((state) => state.renameSpace);
  const toggleSpacePinned = useSpaceStore((state) => state.toggleSpacePinned);

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [position, setPosition] = useState<AnchoredPosition>({ x: 8, y: 8, height: 480 });

  const surfaceRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const newInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const displaySections = useMemo(() => {
    if (query.trim()) {
      return [{ id: 'search', label: '搜索结果', spaces: rankWorkspaceOptions(spaces, query) }];
    }
    return buildSpaceSections(spaces, activeSpaceId);
  }, [spaces, activeSpaceId, query]);
  const visibleSpaces = useMemo(
    () => displaySections.flatMap((section) => section.spaces),
    [displaySections],
  );
  const selectedSpace =
    visibleSpaces.find((space) => space.id === selectedId) ??
    visibleSpaces[0] ??
    (!query.trim() ? spaces.find((space) => space.id === activeSpaceId) : null) ??
    null;

  const updatePosition = useCallback(() => {
    if (variant !== 'anchored') return;
    const rect = anchorRef?.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(SWITCHER_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
    const maxX = Math.max(VIEWPORT_GUTTER, window.innerWidth - width - VIEWPORT_GUTTER);
    const y = rect.bottom + 4;
    setPosition({
      x: Math.min(Math.max(VIEWPORT_GUTTER, rect.left), maxX),
      y,
      height: Math.min(SWITCHER_HEIGHT, Math.max(180, window.innerHeight - y - VIEWPORT_GUTTER)),
    });
  }, [anchorRef, variant]);

  useEffect(() => {
    if (!open) return;
    const state = useSpaceStore.getState();
    setQuery('');
    setSelectedId(state.activeSpaceId || state.spaces[0]?.id || null);
    setShowNewInput(false);
    setNewName('');
    setEditingId(null);
    updatePosition();
    const timer = window.setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => window.clearTimeout(timer);
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open || variant !== 'anchored') return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!surfaceRef.current?.contains(target) && !anchorRef?.current?.contains(target)) onClose();
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, variant, anchorRef, onClose, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !editingId && !showNewInput) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [open, editingId, showNewInput, onClose]);

  useEffect(() => {
    if (!open) return;
    if (selectedId && visibleSpaces.some((space) => space.id === selectedId)) return;
    setSelectedId(visibleSpaces[0]?.id ?? null);
    setEditingId(null);
  }, [open, selectedId, visibleSpaces]);

  useEffect(() => {
    if (!selectedId) return;
    rowRefs.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  useEffect(() => {
    if (!editingId) return;
    const timer = window.setTimeout(() => editInputRef.current?.select(), 0);
    return () => window.clearTimeout(timer);
  }, [editingId]);

  useEffect(() => {
    if (!showNewInput) return;
    const timer = window.setTimeout(() => newInputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [showNewInput]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setEditingId(null);
      const nextSpaces = value.trim()
        ? rankWorkspaceOptions(spaces, value)
        : buildSpaceSections(spaces, activeSpaceId).flatMap((section) => section.spaces);
      setSelectedId(nextSpaces[0]?.id ?? null);
    },
    [spaces, activeSpaceId],
  );

  const moveSelection = useCallback(
    (delta: number) => {
      if (visibleSpaces.length === 0) return;
      const currentIndex = visibleSpaces.findIndex((space) => space.id === selectedId);
      const nextIndex = Math.min(
        visibleSpaces.length - 1,
        Math.max(0, (currentIndex < 0 ? 0 : currentIndex) + delta),
      );
      setSelectedId(visibleSpaces[nextIndex].id);
    },
    [visibleSpaces, selectedId],
  );

  const handleSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        if (selectedSpace) {
          onClose();
          void switchSpace(selectedSpace.id);
        }
      } else if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    },
    [moveSelection, selectedSpace, onClose, switchSpace],
  );

  const handleAdd = useCallback(() => {
    const name = newName.trim();
    if (!name) return;
    addSpace(name);
    setNewName('');
    setShowNewInput(false);
  }, [addSpace, newName]);

  const beginRename = useCallback(() => {
    if (!selectedSpace) return;
    setEditingId(selectedSpace.id);
    setEditValue(getWorkspaceDisplayName(selectedSpace));
    setShowNewInput(false);
  }, [selectedSpace]);

  const confirmRename = useCallback(() => {
    if (!editingId) return;
    const name = editValue.trim();
    if (name) renameSpace(editingId, name);
    setEditingId(null);
  }, [editingId, editValue, renameSpace]);

  const handleDelete = useCallback(async () => {
    if (!selectedSpace || spaces.length <= 1) return;
    const confirmed = await appDialog.confirm({
      title: '删除工作区',
      message: `确定删除工作区“${getWorkspaceDisplayName(selectedSpace)}”吗？\n这不会删除磁盘上的文件。`,
    });
    if (!confirmed) return;
    await removeSpace(selectedSpace.id);
    const state = useSpaceStore.getState();
    setSelectedId(state.activeSpaceId || state.spaces[0]?.id || null);
  }, [selectedSpace, spaces.length, removeSpace]);

  if (!open) return null;

  const rootTestId = variant === 'anchored' ? 'workspace-dropdown' : 'workspace-search';
  const inputTestId = variant === 'anchored' ? 'workspace-dropdown-search' : 'workspace-search-input';
  const rowTestId = variant === 'anchored' ? 'workspace-dropdown-item' : 'workspace-search-result';
  const surfaceStyle: CSSProperties =
    variant === 'anchored'
      ? { left: position.x, top: position.y, height: position.height }
      : { height: 'min(620px, calc(100vh - 24px))' };

  const surface = (
    <div
      ref={surfaceRef}
      data-testid={rootTestId}
      className={`solid-elevated-surface z-[220] flex w-[680px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded border border-border-strong shadow-2xl ${
        variant === 'anchored' ? 'fixed' : 'relative'
      }`}
      style={surfaceStyle}
      role="dialog"
      aria-modal={variant === 'modal'}
      aria-label="切换工作区"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex min-h-11 flex-shrink-0 items-center gap-2 border-b border-border px-3 py-1">
        <Search className="h-4 w-4 flex-shrink-0 text-accent" />
        <input
          ref={searchInputRef}
          data-testid={inputTestId}
          className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary"
          placeholder="搜索工作区名称或目录"
          value={query}
          onChange={(event) => handleQueryChange(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        <span className="flex-shrink-0 text-xs tabular-nums text-text-secondary">
          {visibleSpaces.length}/{spaces.length}
        </span>
        <button
          className="flex h-[28px] w-[28px] items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-lighter hover:text-text-primary"
          onClick={onClose}
          title="关闭"
          aria-label="关闭工作区选择器"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col min-[720px]:flex-row">
        <div className="flex min-h-0 flex-1 flex-col min-[720px]:w-[369px] min-[720px]:flex-none">
          <div className="min-h-0 flex-1 overflow-y-auto py-1" role="listbox">
            {visibleSpaces.length === 0 ? (
              <div className="px-3 py-10 text-center text-xs text-text-secondary">没有匹配的工作区</div>
            ) : (
              displaySections.map((section) =>
                section.spaces.length > 0 ? (
                  <section key={section.id} data-testid={`workspace-section-${section.id}`}>
                    <div className="flex min-h-7 items-center border-y border-border/60 bg-surface px-3 text-[0.6875rem] font-medium text-text-secondary first:border-t-0">
                      <span>{section.label}</span>
                      <span className="ml-auto tabular-nums">{section.spaces.length}</span>
                    </div>
                    {section.spaces.map((space) => (
                      <WorkspaceRow
                        key={space.id}
                        space={space}
                        query={query}
                        active={space.id === activeSpaceId}
                        selected={space.id === selectedSpace?.id}
                        testId={rowTestId}
                        rowRef={(element) => {
                          if (element) rowRefs.current.set(space.id, element);
                          else rowRefs.current.delete(space.id);
                        }}
                        onSelect={() => {
                          setSelectedId(space.id);
                          if (editingId && editingId !== space.id) setEditingId(null);
                        }}
                        onOpen={() => {
                          onClose();
                          void switchSpace(space.id);
                        }}
                      />
                    ))}
                  </section>
                ) : null,
              )
            )}
          </div>

          <div className="flex min-h-10 flex-shrink-0 items-center border-t border-border px-2 py-1">
            {showNewInput ? (
              <div className="flex min-w-0 flex-1 items-center gap-1">
                <input
                  ref={newInputRef}
                  className="h-7 min-w-0 flex-1 rounded border border-accent/60 bg-surface px-2 text-xs text-text-primary outline-none"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleAdd();
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      setShowNewInput(false);
                      setNewName('');
                    }
                  }}
                  placeholder="工作区名称"
                />
                <button
                  className="flex h-[28px] w-[28px] items-center justify-center rounded text-text-muted hover:bg-accent/15 hover:text-accent disabled:opacity-35"
                  title="创建工作区"
                  onClick={handleAdd}
                  disabled={!newName.trim()}
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button
                  className="flex h-[28px] w-[28px] items-center justify-center rounded text-text-muted hover:bg-surface-lighter hover:text-text-primary"
                  title="取消"
                  onClick={() => {
                    setShowNewInput(false);
                    setNewName('');
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                className="flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs text-text-secondary transition-colors hover:bg-accent/10 hover:text-text-primary"
                onClick={() => {
                  setEditingId(null);
                  setShowNewInput(true);
                }}
              >
                <Plus className="h-3.5 w-3.5 text-accent" />
                新建工作区
              </button>
            )}
          </div>
        </div>

        <WorkspacePreview
          space={selectedSpace}
          active={selectedSpace?.id === activeSpaceId}
          onlySpace={spaces.length <= 1}
          editing={editingId === selectedSpace?.id}
          editValue={editValue}
          editInputRef={editInputRef}
          onEditValueChange={setEditValue}
          onBeginRename={beginRename}
          onConfirmRename={confirmRename}
          onCancelRename={() => setEditingId(null)}
          onTogglePinned={() => {
            if (selectedSpace) toggleSpacePinned(selectedSpace.id);
          }}
          onDelete={() => void handleDelete()}
        />
      </div>
      <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-1.5 text-[0.6875rem] text-text-secondary">
        <span>↑ ↓ 选择 · Enter 切换 · Esc 关闭</span>
        <span>Ctrl+Shift+W 搜索工作区</span>
      </div>
    </div>
  );

  return createPortal(
    variant === 'modal' ? (
      <div
        className="fixed inset-0 z-[210] flex items-center justify-center bg-black/30 px-2 py-3"
        onMouseDown={onClose}
      >
        {surface}
      </div>
    ) : (
      surface
    ),
    document.body,
  );
}
