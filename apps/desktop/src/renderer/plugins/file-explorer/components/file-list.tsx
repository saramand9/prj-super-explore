import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileEntry } from '@explore/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFileStore, useFilteredEntries } from '../store';
import { FileRow } from './file-row';
import { ipc } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { pluginManager } from '../../../framework/plugin-system';
import { FolderOpen, FolderPlus, RefreshCw, Trash2, Copy, ArrowRightLeft, Pencil, File, Folder, Clipboard, ClipboardCheck } from 'lucide-react';

interface FileListProps {
  side: 'left' | 'right';
}

export function FileList({ side }: FileListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const entries = useFilteredEntries(side);
  const path = useFileStore((s) => s[side].path);
  const selected = useFileStore((s) => s[side].selected);
  const filterText = useFileStore((s) => s[side].filterText);
  const loading = useFileStore((s) => s[side].loading);

  const navigateTo = useFileStore((s) => s.navigateTo);
  const toggleSelect = useFileStore((s) => s.toggleSelect);
  const clearSelection = useFileStore((s) => s.clearSelection);
  const selectSingle = useFileStore((s) => s.selectSingle);
  const selectAll = useFileStore((s) => s.selectAll);
  const setFilter = useFileStore((s) => s.setFilter);
  const refresh = useFileStore((s) => s.refresh);

  const lastSelectedRef = useRef<string | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const focusIdxRef = useRef(0);
  focusIdxRef.current = focusIdx;
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dropFlashPath, setDropFlashPath] = useState<string | null>(null);
  const lastBackspaceRef = useRef<string | null>(null);
  const [disableHover, setDisableHover] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number;
    single?: FileEntry;
    count: number;
  } | null>(null);

  // Inline prompt helper
  const showPrompt = useCallback(
    (message: string, defaultValue: string): Promise<string | null> =>
      new Promise((resolve) => {
        setInlinePrompt({ message, defaultValue, resolve });
      }),
    [],
  );

  // Inline prompt state（代替 prompt()）
  const [inlinePrompt, setInlinePrompt] = useState<{
    message: string;
    defaultValue: string;
    resolve: (value: string | null) => void;
  } | null>(null);

  // 关闭右键菜单
  const closeMenu = useCallback(() => setContextMenu(null), []);
  useEffect(() => {
    if (!contextMenu) return;
    const h = () => closeMenu();
    window.addEventListener('click', h);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    return () => { window.removeEventListener('click', h); };
  }, [contextMenu, closeMenu]);

  // 文件打开路由：有插件处理→右侧预览，否则→外部打开
  const openFile = useCallback((entry: FileEntry) => {
    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    const handler = pluginManager.getFileHandlerForExtension(ext);
    if (handler) {
      const targetSide = side === 'left' ? 'right' : 'left';
      useLayoutStore.getState().setPanelPath(targetSide, entry.path);
      useLayoutStore.getState().setPanelPlugin(targetSide, handler.pluginId, handler.panelId);
    } else {
      ipc.invoke('file:open', { path: entry.path });
    }
  }, [side]);
  const ctxOpen = useCallback(() => {
    if (!contextMenu?.single) return;
    if (contextMenu.single.isDirectory) {
      navigateTo(side, contextMenu.single.path);
      useLayoutStore.getState().setPanelPath(side, contextMenu.single.path);
    } else {
      openFile(contextMenu.single);
    }
    closeMenu();
  }, [contextMenu, side, navigateTo, closeMenu, openFile]);

  const ctxOpenOther = useCallback(() => {
    if (!contextMenu?.single) return;
    const other = side === 'left' ? 'right' : 'left';
    useLayoutStore.getState().setPanelPath(other, contextMenu.single.path);
    closeMenu();
  }, [contextMenu, side, closeMenu]);

  const ctxDelete = useCallback(async () => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    if (paths.length === 0) { closeMenu(); return; }
    if (!await showConfirm(`Delete ${paths.length} item(s)?`)) { closeMenu(); return; }
    try {
      await ipc.invoke('file:delete', { paths });
      clearSelection(side);
      refresh(side);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
    closeMenu();
  }, [contextMenu, side, clearSelection, refresh, closeMenu]);

  const ctxRename = useCallback(async () => {
    if (!contextMenu?.single) return;
    const newName = await showPrompt('New name:', contextMenu.single.name);
    if (!newName || newName === contextMenu.single.name) { closeMenu(); return; }
    try {
      await ipc.invoke('file:rename', { path: contextMenu.single.path, newName });
      refresh(side);
    } catch (err: any) {
      alert(`Rename failed: ${err.message}`);
    }
    closeMenu();
  }, [contextMenu, side, refresh, closeMenu, showPrompt]);

  const ctxCopy = useCallback(async () => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    const other = side === 'left' ? 'right' : 'left';
    const dest = useLayoutStore.getState().layout[other].path;
    if (!dest || paths.length === 0) { closeMenu(); return; }
    try {
      await ipc.invoke('file:copy', { sources: paths, destDir: dest });
      refresh(side);
      useFileStore.getState().refresh(other);
    } catch (err: any) {
      alert(`Copy failed: ${err.message}`);
    }
    closeMenu();
  }, [contextMenu, side, refresh, closeMenu]);

  const ctxMove = useCallback(async () => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    const other = side === 'left' ? 'right' : 'left';
    const dest = useLayoutStore.getState().layout[other].path;
    if (!dest || paths.length === 0) { closeMenu(); return; }
    try {
      await ipc.invoke('file:move', { sources: paths, destDir: dest });
      refresh(side);
      useFileStore.getState().refresh(other);
    } catch (err: any) {
      alert(`Move failed: ${err.message}`);
    }
    closeMenu();
  }, [contextMenu, side, refresh, closeMenu]);

  const ctxCopyName = useCallback(() => {
    if (!contextMenu) return;
    const names = contextMenu.single
      ? [contextMenu.single.name]
      : [...(useFileStore.getState()[side].selected)].map((p) => p.split(/[/\\]/).pop()!);
    navigator.clipboard.writeText(names.join('\n'));
    closeMenu();
  }, [contextMenu, side, closeMenu]);

  const ctxCopyPath = useCallback(() => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    navigator.clipboard.writeText(paths.join('\n'));
    closeMenu();
  }, [contextMenu, side, closeMenu]);

  const ctxNewFolder = useCallback(async () => {
    const dir = useFileStore.getState()[side].path;
    console.log('[ctxNewFolder] dir:', dir);
    if (!dir) { closeMenu(); return; }
    const name = await showPrompt('Folder name:', 'New folder');
    console.log('[ctxNewFolder] name:', name);
    if (!name) { closeMenu(); return; }
    const result = await ipc.invoke('file:mkdir', { parentPath: dir, name });
    console.log('[ctxNewFolder] result:', result);
    if (!result.success) { alert(`Failed: ${result.error}`); closeMenu(); return; }
    refresh(side);
    closeMenu();
  }, [side, refresh, closeMenu, showPrompt]);

  const ctxRefresh = useCallback(() => {
    refresh(side);
    closeMenu();
  }, [side, refresh, closeMenu]);

  const ctxEmptyFolder = useCallback(async () => {
    const allPaths = useFileStore.getState()[side].entries.map((e) => e.path);
    if (allPaths.length === 0) { closeMenu(); return; }
    if (!await ipc.invoke('dialog:confirm', { message: `Move all ${allPaths.length} item(s) to recycle bin?` })) { closeMenu(); return; }
    try {
      await ipc.invoke('file:delete', { paths: allPaths });
      refresh(side);
    } catch (err: any) {
      alert(`Empty folder failed: ${err.message}`);
    }
    closeMenu();
  }, [side, refresh, closeMenu]);

  // Inline confirm helper
  const showConfirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        setInlineConfirm({ message, resolve });
      }),
    [],
  );

  const [inlineConfirm, setInlineConfirm] = useState<{
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  // 筛选文本/路径变化时，同步重置焦点并选中第一项
  // focusIdxRef 同步赋值避免 React setState 异步批量更新导致 Enter 时读取到旧值
  useEffect(() => {
    setFocusIdx(0);
    focusIdxRef.current = 0;
    if (entries.length > 0) {
      selectSingle(side, entries[0].path);
    }
    // entries/selectSingle 故意不放 deps，只在 filterText/path 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterText, path]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  // ── 将导航同步到 LayoutStore ──

  const syncToLayout = useCallback(
    (newPath: string) => {
      useLayoutStore.getState().setPanelPath(side, newPath);
    },
    [side],
  );

  const navigateToPath = useCallback(
    async (newPath: string) => {
      await navigateTo(side, newPath);
      syncToLayout(newPath);
    },
    [side, navigateTo, syncToLayout],
  );

  // ── Ctrl+O 打开文件夹 ──

  const handleOpenFolder = useCallback(async () => {
    const currentPath = useFileStore.getState()[side].path;
    const result = await ipc.invoke('dialog:openFolder', {
      defaultPath: currentPath ?? undefined,
    });
    if (result) {
      useFileStore.getState().addTab(side, result);
      navigateTo(side, result, false);
      syncToLayout(result);
    }
  }, [side, navigateTo, syncToLayout]);

  // ── 键盘事件 ──

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // 仅在活跃面板处理键盘事件
      const layout = useLayoutStore.getState().layout;
      if (layout.id !== side) return;

      // 忽略在 input 内的输入
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key;
      const state = useFileStore.getState()[side];

      // 快速筛选：字母/数字/点号
      if (key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        setFilter(side, state.filterText + key);
        return;
      }

      // Shift+数字：切换标签
      if (e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit9') {
        e.preventDefault();
        const tabs = useFileStore.getState()[side].tabs;
        const idx = parseInt(e.code.replace('Digit', '')) - 1;
        if (idx < tabs.length) {
          const target = tabs[idx];
          useFileStore.getState().activateTab(side, target.id);
          navigateTo(side, target.path);
          useLayoutStore.getState().setPanelPath(side, target.path);
        }
        return;
      }

      switch (e.key) {
        case 'Backspace':
          if (state.filterText) {
            setFilter(side, state.filterText.slice(0, -1));
          } else if (e.shiftKey && lastBackspaceRef.current) {
            // Shift+Backspace：撤销返回，回到之前目录
            navigateToPath(lastBackspaceRef.current);
            lastBackspaceRef.current = null;
          } else if (state.path) {
            // 返回上层目录，记录来源
            const originPath = state.path;
            lastBackspaceRef.current = originPath;
            const parent = state.path.split(/[/\\]/).slice(0, -1).join('\\') || state.path.slice(0, 2) + '\\';
            navigateToPath(parent).then(() => {
              const entries = useFileStore.getState()[side].entries;
              const target = entries.find((e) => e.path === originPath);
              if (target) {
                selectSingle(side, target.path);
                const idx = entries.indexOf(target);
                if (idx >= 0) setFocusIdx(idx);
              }
            });
          }
          break;

        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            selectAll(side);
            break;
          }
          setFilter(side, state.filterText + key);
          return;

        case 'o':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleOpenFolder();
            break;
          }
          setFilter(side, state.filterText + key);
          return;

        case 'Escape':
          setFilter(side, '');
          clearSelection(side);
          break;

        case 'ArrowDown':
          e.preventDefault();
          {
            const next = Math.min(focusIdxRef.current + 1, entries.length - 1);
            selectSingle(side, entries[next].path);
            setFocusIdx(next);
            setDisableHover(true);
            (document.activeElement as HTMLElement)?.blur();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          {
            const next = Math.max(focusIdxRef.current - 1, 0);
            selectSingle(side, entries[next].path);
            setFocusIdx(next);
            setDisableHover(true);
            (document.activeElement as HTMLElement)?.blur();
          }
          break;

        case 'ArrowLeft':
          e.preventDefault();
          useLayoutStore.getState().setActivePanel('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          useLayoutStore.getState().setActivePanel('right');
          break;

        case 'Tab':
          if (e.shiftKey) {
            e.preventDefault();
            {
              const tabs = useFileStore.getState()[side].tabs;
              if (tabs.length > 1) {
                const curIdx = tabs.findIndex((t) => t.id === useFileStore.getState()[side].activeTabId);
                const next = (curIdx + 1) % tabs.length;
                const target = tabs[next];
                useFileStore.getState().activateTab(side, target.id);
                navigateTo(side, target.path);
                useLayoutStore.getState().setPanelPath(side, target.path);
              }
            }
          }
          break;

        case 'Enter': {
          if (entries.length > 0 && state.selected.size === 1) {
            const selPath = [...state.selected][0];
            const entry = entries.find((e) => e.path === selPath);
            if (entry?.isDirectory) {
              navigateToPath(entry.path);
            } else if (entry) {
              openFile(entry);
            }
          } else if (entries.length > 0 && focusIdxRef.current < entries.length) {
            const entry = entries[focusIdxRef.current];
            if (entry.isDirectory) {
              navigateToPath(entry.path);
            } else {
              openFile(entry);
            }
          }
          break;
        }

        case 'F5': {
          const targetSide = side === 'left' ? 'right' : 'left';
          const targetPath = useLayoutStore.getState().layout[targetSide].path;
          if (targetPath && state.selected.size > 0) {
            const result = await ipc.invoke('file:copy', {
              sources: [...state.selected],
              destDir: targetPath,
            });
            if (result.success) {
              clearSelection(side);
              refresh(side);
            }
          }
          break;
        }
        case 'F6': {
          const targetSide = side === 'left' ? 'right' : 'left';
          const targetPath = useLayoutStore.getState().layout[targetSide].path;
          if (targetPath && state.selected.size > 0) {
            const result = await ipc.invoke('file:move', {
              sources: [...state.selected],
              destDir: targetPath,
            });
            if (result.success) {
              clearSelection(side);
              refresh(side);
            }
          }
          break;
        }
        case 'F7': {
          if (state.path) {
            const name = await showPrompt('Folder name:', 'New folder');
            if (name) {
              const result = await ipc.invoke('file:mkdir', {
                parentPath: state.path,
                name,
              });
              if (result.success) refresh(side);
            }
          }
          break;
        }
        case 'Delete': {
          if (state.selected.size > 0) {
            const names = [...state.selected]
              .map((p) => p.split(/[/\\]/).pop())
              .join(', ');
            if (await ipc.invoke('dialog:confirm', { message: `Delete ${names}?` })) {
              await ipc.invoke('file:delete', { paths: [...state.selected] });
              clearSelection(side);
              refresh(side);
            }
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [side, filterText, path, entries, selected, setFilter, clearSelection, selectSingle, navigateToPath, refresh, handleOpenFolder]);

  // 键盘操作后禁 hover，鼠标移动恢复
  useEffect(() => {
    if (!disableHover) return;
    const handler = () => setDisableHover(false);
    window.addEventListener('mousemove', handler, { once: true });
    return () => window.removeEventListener('mousemove', handler);
  }, [disableHover]);

  // 聚焦项变化时滚动到可视区
  useEffect(() => {
    if (entries.length > 0 && focusIdx < entries.length) {
      virtualizer.scrollToIndex(focusIdx, { align: 'auto' });
    }
  }, [focusIdx, entries.length, virtualizer]);

  // ── 渲染 ──

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        Loading...
      </div>
    );
  }

  if (!path) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        <div className="text-center">
          <div className="text-3xl mb-2">📂</div>
          <button
            className="px-3 py-1.5 bg-accent/20 hover:bg-accent/40 text-text-primary rounded text-xs transition-colors"
            onClick={handleOpenFolder}
          >
            Open Folder
          </button>
          <div className="mt-2 text-xs text-text-muted">or press Ctrl+O</div>
        </div>
      </div>
    );
  }

  return (<>
    <div ref={containerRef} className="h-full overflow-auto" onContextMenu={(e) => {
      if (e.target === containerRef.current || (e.target as HTMLElement).classList.contains('relative')) {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, count: 0 });
      }
    }}>
      {filterText && (
        <div className="sticky top-0 z-10 px-2 py-0.5 bg-accent/80 text-white text-xs">
          Filter: "{filterText}" ({entries.length} items)
        </div>
      )}

      <div
        className="relative"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const idx = virtualItem.index;
          const entry = entries[idx];
          return (
            <div
              key={entry.path}
              className="absolute top-0 left-0 w-full"
              style={{
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <FileRow
                entry={entry}
                isSelected={selected.has(entry.path)}
                isActive={idx === focusIdx}
                disableHover={disableHover}
                highlight={filterText}
                onClick={(e: React.MouseEvent) => {
                  if (e.ctrlKey || e.metaKey) {
                    toggleSelect(side, entry.path);
                  } else {
                    selectSingle(side, entry.path);
                    setFocusIdx(idx);
                  }
                  lastSelectedRef.current = entry.path;
                }}
                onDoubleClick={() => {
                  if (entry.isDirectory) {
                    navigateToPath(entry.path);
                  } else {
                    openFile(entry);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!selected.has(entry.path)) {
                    clearSelection(side);
                    toggleSelect(side, entry.path);
                  }
                  const selCount = selected.size || 1;
                  setContextMenu({
                    x: e.clientX, y: e.clientY,
                    single: selCount <= 1 ? entry : undefined,
                    count: selCount,
                  });
                }}
                onDragStart={(e) => {
                  const paths = selected.has(entry.path)
                    ? [...selected]
                    : [entry.path];
                  e.dataTransfer.setData('application/x-explore-files', JSON.stringify(paths));
                }}
                dragOver={dragOverPath === entry.path}
                dropFlash={dropFlashPath === entry.path}
                onDragEnterRow={() => entry.isDirectory && setDragOverPath(entry.path)}
                onDragLeaveRow={() => setDragOverPath(null)}
                onDrop={async (e) => {
                  const data = e.dataTransfer.getData('application/x-explore-files');
                  if (!data) return;
                  const sources: string[] = JSON.parse(data);
                  if (sources.length === 0) return;

                  // 同目录忽略
                  if (sources.every((s) => {
                    const parent = s.replace(/[/\\][^/\\]*$/, '');
                    return parent === entry.path;
                  })) return;

                  // 拖到自己子目录 → 阻止
                  if (sources.some((s) => entry.path.startsWith(s + '\\') || entry.path.startsWith(s + '/'))) return;

                  // 同名冲突
                  const sourceNames = new Set(sources.map((s) => s.split(/[/\\]/).pop()?.toLowerCase()));
                  const destEntries = await ipc.invoke('file:readDir', { path: entry.path });
                  const conflicts = destEntries.filter((de) => sourceNames.has(de.name.toLowerCase()));
                  if (conflicts.length > 0) {
                    if (!await ipc.invoke('dialog:confirm', { message: `Overwrite in ${entry.name}?\n${conflicts.map((c) => c.name).join(', ')}` })) return;
                  }

                  const isMove = e.ctrlKey || e.metaKey;
                  try {
                    if (isMove) {
                      const result = await ipc.invoke('file:move', { sources, destDir: entry.path });
                      if (!result.success && result.skipped?.length) {
                        await ipc.invoke('file:copy', { sources: result.skipped, destDir: entry.path });
                        await ipc.invoke('file:delete', { paths: result.skipped });
                      }
                    } else {
                      await ipc.invoke('file:copy', { sources, destDir: entry.path });
                    }
                  } catch (err: any) {
                    alert(`Operation failed: ${err.message}`);
                  }
                  refresh(side);
                  const otherSide = side === 'left' ? 'right' : 'left';
                  useFileStore.getState().refresh(otherSide);
                  setDropFlashPath(entry.path);
                  setTimeout(() => setDropFlashPath(null), 600);
                }}
              />
            </div>
          );
        })}
      </div>

      {entries.length === 0 && !loading && (
        <div className="text-center text-text-muted mt-8">
          {filterText ? 'No matches' : 'Empty directory'}
        </div>
      )}
    </div>

    {/* 内联输入框（代替 prompt()） */}
    {inlinePrompt && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={() => { inlinePrompt.resolve(null); setInlinePrompt(null); }}>
        <div className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[320px]" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm text-text-primary mb-3">{inlinePrompt.message}</div>
          <input
            autoFocus
            id="inline-prompt-input"
            className="w-full bg-surface-lighter border border-border rounded px-3 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            defaultValue={inlinePrompt.defaultValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { inlinePrompt.resolve((e.target as HTMLInputElement).value); setInlinePrompt(null); }
              if (e.key === 'Escape') { inlinePrompt.resolve(null); setInlinePrompt(null); }
            }}
          />
          <div className="flex justify-end gap-2 mt-3">
            <button className="px-3 py-1 text-xs text-text-muted hover:text-text-primary" onClick={() => { inlinePrompt.resolve(null); setInlinePrompt(null); }}>Cancel</button>
            <button className="px-3 py-1 text-xs bg-accent text-white rounded" onClick={() => { const el = document.getElementById('inline-prompt-input') as HTMLInputElement; inlinePrompt.resolve(el?.value || ''); setInlinePrompt(null); }}>OK</button>
          </div>
        </div>
      </div>
    )}

    {/* 内联确认框（代替 confirm） */}
    {inlineConfirm && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50" onClick={() => { inlineConfirm.resolve(false); setInlineConfirm(null); }}>
        <div className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[300px]" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm text-text-primary mb-4 whitespace-pre-wrap">{inlineConfirm.message}</div>
          <div className="flex justify-end gap-2">
            <button className="px-4 py-1 text-xs text-text-muted hover:text-text-primary border border-border rounded" onClick={() => { inlineConfirm.resolve(false); setInlineConfirm(null); }}>Cancel</button>
            <button className="px-4 py-1 text-xs bg-accent text-white rounded" onClick={() => { inlineConfirm.resolve(true); setInlineConfirm(null); }}>OK</button>
          </div>
        </div>
      </div>
    )}

    {/* 右键菜单 */}
    {contextMenu && (
      <div className="fixed z-[150]" style={{ left: contextMenu.x, top: contextMenu.y }}>
        <div className="bg-surface-light border border-border rounded-lg shadow-xl py-1 min-w-[180px] text-xs">
          {/* 空白区域 */}
          {contextMenu.count === 0 && (
            <>
              <MenuBtn onClick={handleOpenFolder}><FolderOpen className="w-3.5 h-3.5" /> Open folder...</MenuBtn>
              <MenuBtn onClick={ctxNewFolder}><FolderPlus className="w-3.5 h-3.5" /> New folder</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxRefresh}><RefreshCw className="w-3.5 h-3.5" /> Refresh</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxEmptyFolder}><Trash2 className="w-3.5 h-3.5" /> Empty folder</MenuBtn>
            </>
          )}
          {/* 单个文件或文件夹 */}
          {contextMenu.single && (
            <>
              <MenuBtn onClick={ctxOpen}>
                {contextMenu.single.isDirectory ? <Folder className="w-3.5 h-3.5" /> : <File className="w-3.5 h-3.5" />}
                {' '}{contextMenu.single.isDirectory ? 'Open' : 'Open file'}
              </MenuBtn>
              {contextMenu.single.isDirectory && (
                <MenuBtn onClick={ctxOpenOther}>↗️ Open in other panel</MenuBtn>
              )}
              <MenuSep />
              <MenuBtn onClick={ctxCopy}><Copy className="w-3.5 h-3.5" /> Copy to other panel</MenuBtn>
              <MenuBtn onClick={ctxMove}><ArrowRightLeft className="w-3.5 h-3.5" /> Move to other panel</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxRename}><Pencil className="w-3.5 h-3.5" /> Rename</MenuBtn>
              <MenuBtn onClick={ctxDelete}><Trash2 className="w-3.5 h-3.5" /> Delete</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxCopyName}><Clipboard className="w-3.5 h-3.5" /> Copy filename</MenuBtn>
              <MenuBtn onClick={ctxCopyPath}><ClipboardCheck className="w-3.5 h-3.5" /> Copy path</MenuBtn>
            </>
          )}
          {/* 多个选中 */}
          {contextMenu.count > 1 && !contextMenu.single && (
            <>
              <MenuBtn onClick={ctxCopy}><Copy className="w-3.5 h-3.5" /> Copy {contextMenu.count} items to other panel</MenuBtn>
              <MenuBtn onClick={ctxMove}><ArrowRightLeft className="w-3.5 h-3.5" /> Move {contextMenu.count} items to other panel</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxDelete}><Trash2 className="w-3.5 h-3.5" /> Delete {contextMenu.count} items</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxCopyName}><Clipboard className="w-3.5 h-3.5" /> Copy filenames</MenuBtn>
              <MenuBtn onClick={ctxCopyPath}><ClipboardCheck className="w-3.5 h-3.5" /> Copy paths</MenuBtn>
            </>
          )}
        </div>
      </div>
    )}
  </>
  );
}

function MenuBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      className="w-full text-left px-3 py-1.5 text-text-secondary hover:bg-accent/20 hover:text-text-primary flex items-center gap-2"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuSep() {
  return <div className="border-t border-border/50 my-0.5" />;
}
