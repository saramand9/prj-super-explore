import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileEntry } from '@explore/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFileStore, useFilteredEntries } from '../store';
import { FileRow } from './file-row';
import { ipc } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';
import { pluginManager, showNotification } from '../../../framework/plugin-system';
import { FolderOpen, FolderPlus, RefreshCw, Trash2, Copy, ArrowRightLeft, Pencil, File, FilePlus, Folder, Clipboard, ClipboardCheck } from 'lucide-react';
import {
  getFileOpToastType,
  resolveCopyConflictStrategy,
  summarizeFileOpResult,
  summarizeFileOpToast,
} from '../utils/file-op-result';
import type { FileConflictStrategy, FileOpResult } from '@explore/shared';

interface FileListProps {
  side: 'left' | 'right';
}

function normalizePathForCompare(path: string): string {
  return path.replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
}

function isSameDirectory(a: string, b: string): boolean {
  return normalizePathForCompare(a) === normalizePathForCompare(b);
}

export function FileList({ side }: FileListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const entries = useFilteredEntries(side);
  const path = useFileStore((s) => s[side].path);
  const selected = useFileStore((s) => s[side].selected);
  const filterText = useFileStore((s) => s[side].filterText);
  const loading = useFileStore((s) => s[side].loading);
  const error = useFileStore((s) => s[side].error);
  const dirSizeMap = useFileStore((s) => s.dirSizeMap);
  const setDirSizes = useFileStore((s) => s.setDirSizes);

  const navigateTo = useFileStore((s) => s.navigateTo);
  const toggleSelect = useFileStore((s) => s.toggleSelect);
  const clearSelection = useFileStore((s) => s.clearSelection);
  const selectRange = useFileStore((s) => s.selectRange);
  const selectSingle = useFileStore((s) => s.selectSingle);
  const selectAll = useFileStore((s) => s.selectAll);
  const setFilter = useFileStore((s) => s.setFilter);
  const pinTab = useFileStore((s) => s.pinTab);
  const unpinTab = useFileStore((s) => s.unpinTab);
  const repinTab = useFileStore((s) => s.repinTab);
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
  const [copyConflictChoice, setCopyConflictChoice] = useState<{
    message: string;
    resolve: (strategy: FileConflictStrategy | null) => void;
  } | null>(null);
  const [conflictHover, setConflictHover] = useState<FileConflictStrategy | 'cancel' | null>(null);
  const [pendingOperation, setPendingOperation] = useState<{
    id: string;
    label: string;
    cancelling: boolean;
  } | null>(null);
  const [inlineAlert, setInlineAlert] = useState<{
    message: string;
    type: 'info' | 'warning' | 'error';
    resolve: () => void;
  } | null>(null);

  const showAlert = useCallback(
    (message: string, type: 'info' | 'warning' | 'error' = 'info') =>
      new Promise<void>((resolve) => {
        setInlineAlert({ message, type, resolve });
      }),
    [],
  );

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

  const showCopyConflictChoice = useCallback(
    (message: string): Promise<FileConflictStrategy | null> =>
      new Promise((resolve) => {
        setConflictHover(null);
        setCopyConflictChoice({ message, resolve });
      }),
    [],
  );

  const chooseConflictStrategy = useCallback(
    (sources: string[], destDir: string) =>
      resolveCopyConflictStrategy(
        sources,
        destDir,
        (p) => ipc.invoke('file:readDir', { path: p }),
        showCopyConflictChoice,
      ),
    [showCopyConflictChoice],
  );

  const runFileOperation = useCallback(
    async (
      channel: 'file:copy' | 'file:move' | 'file:delete',
      payload: Record<string, unknown>,
      label: string,
    ): Promise<FileOpResult> => {
      const operationId = `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const timer = window.setTimeout(() => {
        setPendingOperation({ id: operationId, label, cancelling: false });
      }, 500);
      try {
        return await ipc.invoke(channel, { ...payload, operationId } as any);
      } finally {
        window.clearTimeout(timer);
        setPendingOperation(null);
      }
    },
    [],
  );

  const cancelPendingOperation = useCallback(() => {
    const current = pendingOperation;
    if (!current || current.cancelling) return;
    setPendingOperation({ ...current, cancelling: true });
    ipc.invoke('file:cancelOperation', { operationId: current.id }).catch(() => {});
  }, [pendingOperation]);

  const reportFileOperationResult = useCallback(
    async (action: string, result: FileOpResult) => {
      const summary = summarizeFileOpResult(action, result);
      if (summary) {
        const type = getFileOpToastType(result) === 'error' ? 'error' : 'warning';
        await showAlert(summary, type);
        return;
      }
      showNotification(summarizeFileOpToast(action, result), getFileOpToastType(result));
    },
    [showAlert],
  );

  const refreshPeerIfSameDirectory = useCallback(
    (dir: string) => {
      const other = side === 'left' ? 'right' : 'left';
      const otherPath = useFileStore.getState()[other].path;
      if (otherPath && isSameDirectory(dir, otherPath)) {
        refresh(other);
      }
    },
    [side, refresh],
  );

  // 关闭右键菜单
  const closeMenu = useCallback(() => setContextMenu(null), []);
  useEffect(() => {
    if (!contextMenu) return;
    const h = () => closeMenu();
    window.addEventListener('click', h);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
    return () => { window.removeEventListener('click', h); };
  }, [contextMenu, closeMenu]);

  // 文件打开路由：左侧文件在右侧预览；右侧文件在本侧预览，避免覆盖左侧文件列表。
  const openFile = useCallback((entry: FileEntry) => {
    const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase();
    const handler = pluginManager.getFileHandlerForExtension(ext);
    if (handler) {
      const targetSide = side === 'left' ? 'right' : side;
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

  const deletePaths = useCallback(async (paths: string[], permanent = false) => {
    if (paths.length === 0) return;
    if (permanent) {
      if (!await showConfirm(`确定要永久删除 ${paths.length} 个项目吗？\n这些项目不会进入回收站。`)) return;
      if (!await showConfirm('再次确认：永久删除无法从回收站恢复。是否继续？')) return;
    } else if (!await showConfirm(`确定要将 ${paths.length} 个项目移到回收站吗？`)) {
      return;
    }

    try {
      const result = await runFileOperation(
        'file:delete',
        { paths, permanent },
        permanent ? '正在永久删除...' : '正在移到回收站...',
      );
      await reportFileOperationResult(permanent ? 'PermanentDelete' : 'Delete', result);
      clearSelection(side);
      refresh(side);
    } catch (err: any) {
      await showAlert(`删除失败：${err.message}`, 'error');
    }
  }, [side, clearSelection, refresh, showAlert, runFileOperation, reportFileOperationResult]);

  const ctxDelete = useCallback(async () => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    await deletePaths(paths, false);
    closeMenu();
  }, [contextMenu, side, closeMenu, deletePaths]);

  const ctxPermanentDelete = useCallback(async () => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    await deletePaths(paths, true);
    closeMenu();
  }, [contextMenu, side, closeMenu, deletePaths]);

  const ctxRename = useCallback(async () => {
    if (!contextMenu?.single) return;
    const newName = await showPrompt('新名称：', contextMenu.single.name);
    if (!newName || newName === contextMenu.single.name) { closeMenu(); return; }
    try {
      await ipc.invoke('file:rename', { path: contextMenu.single.path, newName });
      refresh(side);
    } catch (err: any) {
      await showAlert(`重命名失败：${err.message}`, 'error');
    }
    closeMenu();
  }, [contextMenu, side, refresh, closeMenu, showPrompt, showAlert]);

  const ctxCopy = useCallback(async () => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    const other = side === 'left' ? 'right' : 'left';
    const dest = useLayoutStore.getState().layout[other].path;
    if (!dest || paths.length === 0) { closeMenu(); return; }
    try {
      const conflictStrategy = await chooseConflictStrategy(paths, dest);
      if (!conflictStrategy) { closeMenu(); return; }
      const result = await runFileOperation(
        'file:copy',
        { sources: paths, destDir: dest, conflictStrategy },
        '正在复制...',
      );
      await reportFileOperationResult('Copy', result);
      refresh(side);
      useFileStore.getState().refresh(other);
    } catch (err: any) {
      await showAlert(`复制失败：${err.message}`, 'error');
    }
    closeMenu();
  }, [contextMenu, side, refresh, closeMenu, chooseConflictStrategy, showAlert, runFileOperation, reportFileOperationResult]);

  const ctxMove = useCallback(async () => {
    if (!contextMenu) return;
    const paths = contextMenu.single
      ? [contextMenu.single.path]
      : [...(useFileStore.getState()[side].selected)];
    const other = side === 'left' ? 'right' : 'left';
    const dest = useLayoutStore.getState().layout[other].path;
    if (!dest || paths.length === 0) { closeMenu(); return; }
    try {
      const conflictStrategy = await chooseConflictStrategy(paths, dest);
      if (!conflictStrategy) { closeMenu(); return; }
      const result = await runFileOperation(
        'file:move',
        { sources: paths, destDir: dest, conflictStrategy },
        '正在移动...',
      );
      await reportFileOperationResult('Move', result);
      refresh(side);
      useFileStore.getState().refresh(other);
    } catch (err: any) {
      await showAlert(`移动失败：${err.message}`, 'error');
    }
    closeMenu();
  }, [contextMenu, side, refresh, closeMenu, chooseConflictStrategy, showAlert, runFileOperation, reportFileOperationResult]);

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
    const name = await showPrompt('文件夹名称：', '新建文件夹');
    console.log('[ctxNewFolder] name:', name);
    if (!name) { closeMenu(); return; }
    const result = await ipc.invoke('file:mkdir', { parentPath: dir, name });
    console.log('[ctxNewFolder] result:', result);
    if (!result.success) { await showAlert(`操作失败：${result.error}`, 'error'); closeMenu(); return; }
    refresh(side);
    refreshPeerIfSameDirectory(dir);
    closeMenu();
  }, [side, refresh, closeMenu, showPrompt, showAlert, refreshPeerIfSameDirectory]);

  const ctxNewFile = useCallback(async () => {
    const dir = useFileStore.getState()[side].path;
    if (!dir) { closeMenu(); return; }
    const name = await showPrompt('文件名称：', '新建文件.txt');
    if (!name) { closeMenu(); return; }
    const result = await ipc.invoke('file:create', { parentPath: dir, name });
    if (!result.success) { await showAlert(`创建文件失败：${result.error}`, 'error'); closeMenu(); return; }
    refresh(side);
    refreshPeerIfSameDirectory(dir);
    closeMenu();
  }, [side, refresh, closeMenu, showPrompt, showAlert, refreshPeerIfSameDirectory]);

  const ctxRefresh = useCallback(() => {
    refresh(side);
    closeMenu();
  }, [side, refresh, closeMenu]);

  const ctxEmptyFolder = useCallback(async () => {
    const allPaths = useFileStore.getState()[side].entries.map((e) => e.path);
    if (allPaths.length === 0) { closeMenu(); return; }
    await deletePaths(allPaths, false);
    closeMenu();
  }, [side, closeMenu, deletePaths]);

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

  // 筛选文本/路径变化时，重置焦点并清空选择
  // focusIdxRef 同步赋值避免 React setState 异步批量更新导致 Enter 时读取到旧值
  useEffect(() => {
    setFocusIdx(0);
    focusIdxRef.current = 0;
    lastSelectedRef.current = null;
    clearSelection(side);
    // entries/clearSelection 故意不放 deps，只在 filterText/path 变化时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterText, path]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 30,
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 10,
  });

  // 加载目录大小（首次请求 + 后台补算监听）
  useEffect(() => {
    const dirs = entries.filter((e) => e.isDirectory).map((e) => e.path);
    if (dirs.length === 0) return;
    ipc.invoke('file:dirSizes', { paths: dirs }).then((sizes) => {
      setDirSizes(sizes);
    });
  }, [entries, setDirSizes]);

  // 后台补算结果推送
  useEffect(() => {
    const unsub = ipc.on('file:dirSizeUpdate', (payload) => {
      setDirSizes({ [payload.path]: { size: payload.size, partial: payload.partial } });
    });
    return unsub;
  }, [setDirSizes]);

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

  const getRangeAnchor = useCallback(() => {
    const visiblePaths = new Set(entries.map((entry) => entry.path));
    if (lastSelectedRef.current && visiblePaths.has(lastSelectedRef.current)) {
      return lastSelectedRef.current;
    }
    const selectedPath = [...selected].find((entryPath) => visiblePaths.has(entryPath));
    if (selectedPath) return selectedPath;
    return entries[focusIdxRef.current]?.path ?? entries[0]?.path ?? null;
  }, [entries, selected]);

  const selectSingleAtIndex = useCallback(
    (idx: number) => {
      const entry = entries[idx];
      if (!entry) return;
      selectSingle(side, entry.path);
      setFocusIdx(idx);
      focusIdxRef.current = idx;
      lastSelectedRef.current = entry.path;
    },
    [entries, selectSingle, side],
  );

  const selectRangeToIndex = useCallback(
    (idx: number) => {
      const entry = entries[idx];
      if (!entry) return;
      const anchor = getRangeAnchor() ?? entry.path;
      selectRange(side, anchor, entry.path, entries.map((item) => item.path));
      setFocusIdx(idx);
      focusIdxRef.current = idx;
      lastSelectedRef.current = anchor;
    },
    [entries, getRangeAnchor, selectRange, side],
  );

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
                if (idx >= 0) {
                  setFocusIdx(idx);
                  focusIdxRef.current = idx;
                }
                lastSelectedRef.current = target.path;
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
          lastSelectedRef.current = null;
          break;

        case 'ArrowDown':
          e.preventDefault();
          {
            if (entries.length === 0) break;
            const next = Math.min(focusIdxRef.current + 1, entries.length - 1);
            if (e.shiftKey) {
              selectRangeToIndex(next);
            } else {
              selectSingleAtIndex(next);
            }
            setDisableHover(true);
            (document.activeElement as HTMLElement)?.blur();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          {
            if (entries.length === 0) break;
            const next = Math.max(focusIdxRef.current - 1, 0);
            if (e.shiftKey) {
              selectRangeToIndex(next);
            } else {
              selectSingleAtIndex(next);
            }
            setDisableHover(true);
            (document.activeElement as HTMLElement)?.blur();
          }
          break;

        case 'Home':
        case 'End':
          e.preventDefault();
          {
            if (entries.length === 0) break;
            const next = e.key === 'Home' ? 0 : entries.length - 1;
            if (e.shiftKey) {
              selectRangeToIndex(next);
            } else {
              selectSingleAtIndex(next);
            }
            setDisableHover(true);
            (document.activeElement as HTMLElement)?.blur();
          }
          break;

        case 'PageDown':
        case 'PageUp':
          e.preventDefault();
          {
            if (entries.length === 0) break;
            const visibleRows = Math.max(
              1,
              Math.floor((containerRef.current?.clientHeight ?? 300) / 30) - 1,
            );
            const delta = e.key === 'PageDown' ? visibleRows : -visibleRows;
            const next = Math.max(0, Math.min(focusIdxRef.current + delta, entries.length - 1));
            if (e.shiftKey) {
              selectRangeToIndex(next);
            } else {
              selectSingleAtIndex(next);
            }
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

        case 'p':
        case 'P':
          if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            const activeTabId = useFileStore.getState()[side].activeTabId;
            if (!activeTabId) break;
            const activeTab = useFileStore.getState()[side].tabs.find((t) => t.id === activeTabId);
            if (activeTab?.pinned) {
              unpinTab(side, activeTabId);
            } else {
              pinTab(side, activeTabId);
            }
          }
          break;

        case 'r':
        case 'R':
          if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            const activeTabIdRepin = useFileStore.getState()[side].activeTabId;
            if (!activeTabIdRepin) break;
            const activeTabRepin = useFileStore.getState()[side].tabs.find((t) => t.id === activeTabIdRepin);
            if (activeTabRepin?.pinned) {
              repinTab(side, activeTabIdRepin);
            }
          }
          break;

        case 'F5': {
          const targetSide = side === 'left' ? 'right' : 'left';
          const targetPath = useLayoutStore.getState().layout[targetSide].path;
          if (targetPath && state.selected.size > 0) {
            const conflictStrategy = await chooseConflictStrategy([...state.selected], targetPath);
            if (!conflictStrategy) break;
            const result = await runFileOperation(
              'file:copy',
              {
                sources: [...state.selected],
                destDir: targetPath,
                conflictStrategy,
              },
              '正在复制...',
            );
            await reportFileOperationResult('Copy', result);
            if (result.success) {
              clearSelection(side);
              refresh(side);
              useFileStore.getState().refresh(targetSide);
            }
          }
          break;
        }
        case 'F6': {
          const targetSide = side === 'left' ? 'right' : 'left';
          const targetPath = useLayoutStore.getState().layout[targetSide].path;
          if (targetPath && state.selected.size > 0) {
            const conflictStrategy = await chooseConflictStrategy([...state.selected], targetPath);
            if (!conflictStrategy) break;
            const result = await runFileOperation(
              'file:move',
              {
                sources: [...state.selected],
                destDir: targetPath,
                conflictStrategy,
              },
              '正在移动...',
            );
            await reportFileOperationResult('Move', result);
            if (result.success) {
              clearSelection(side);
              refresh(side);
              useFileStore.getState().refresh(targetSide);
            }
          }
          break;
        }
        case 'F7': {
          if (state.path) {
            const name = await showPrompt('文件夹名称：', '新建文件夹');
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
            await deletePaths([...state.selected], e.shiftKey);
          }
          break;
        }
        case 'F8': {
          if (state.selected.size > 0) {
            await deletePaths([...state.selected], e.shiftKey);
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [side, filterText, path, entries, selected, setFilter, clearSelection, selectAll, selectSingle, selectSingleAtIndex, selectRangeToIndex, navigateToPath, navigateTo, refresh, handleOpenFolder, chooseConflictStrategy, showAlert, runFileOperation, deletePaths, reportFileOperationResult, pinTab, unpinTab, repinTab]);

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

  // 外部动作选中文件时，同步焦点并滚动到该文件
  useEffect(() => {
    if (selected.size !== 1) return;
    const selectedPath = [...selected][0];
    const idx = entries.findIndex((entry) => entry.path === selectedPath);
    if (idx < 0) return;
    setFocusIdx(idx);
    focusIdxRef.current = idx;
    lastSelectedRef.current = selectedPath;
    virtualizer.scrollToIndex(idx, { align: 'center' });
  }, [selected, entries, virtualizer]);

  // ── 渲染 ──

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        正在加载...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center px-6 text-sm">
        <div className="max-w-[520px] text-center">
          <div className="text-red-400 font-medium mb-2">目录加载失败</div>
          <div className="text-text-secondary whitespace-pre-wrap break-words">{error}</div>
          <button
            className="mt-4 px-3 py-1.5 bg-accent/20 hover:bg-accent/40 text-text-primary rounded text-xs transition-colors"
            onClick={() => refresh(side)}
          >
            重试
          </button>
        </div>
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
            打开文件夹
          </button>
          <div className="mt-2 text-xs text-text-muted">或按 Ctrl+O</div>
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
      <SortHeader side={side} />
      {filterText && (
        <div className="sticky top-7 z-10 px-2 py-0.5 bg-accent/80 text-white text-xs">
          筛选：“{filterText}”（{entries.length} 项）
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
              ref={virtualizer.measureElement}
              data-index={idx}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <FileRow
                entry={entry}
                isSelected={selected.has(entry.path)}
                isActive={idx === focusIdx}
                disableHover={disableHover}
                highlight={filterText}
                dirSize={dirSizeMap[entry.path]}
                onClick={(e: React.MouseEvent) => {
                  if (e.shiftKey) {
                    e.preventDefault();
                    selectRangeToIndex(idx);
                  } else if (e.ctrlKey || e.metaKey) {
                    toggleSelect(side, entry.path);
                    setFocusIdx(idx);
                    focusIdxRef.current = idx;
                    lastSelectedRef.current = entry.path;
                  } else {
                    selectSingleAtIndex(idx);
                  }
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

                  const isMove = e.ctrlKey || e.metaKey;
                  try {
                    const conflictStrategy = await chooseConflictStrategy(sources, entry.path);
                    if (!conflictStrategy) return;
                    const result = isMove
                      ? await runFileOperation(
                          'file:move',
                          { sources, destDir: entry.path, conflictStrategy },
                          '正在移动...',
                        )
                      : await runFileOperation(
                          'file:copy',
                          { sources, destDir: entry.path, conflictStrategy },
                          '正在复制...',
                        );
                    await reportFileOperationResult(isMove ? 'Move' : 'Copy', result);
                  } catch (err: any) {
                    await showAlert(`操作失败：${err.message}`, 'error');
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
          {filterText ? '未找到匹配' : '空文件夹'}
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
            <button className="px-3 py-1 text-xs text-text-muted hover:text-text-primary" onClick={() => { inlinePrompt.resolve(null); setInlinePrompt(null); }}>取消</button>
            <button className="px-3 py-1 text-xs bg-accent text-white rounded" onClick={() => { const el = document.getElementById('inline-prompt-input') as HTMLInputElement; inlinePrompt.resolve(el?.value || ''); setInlinePrompt(null); }}>确定</button>
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
            <button className="px-4 py-1 text-xs text-text-muted hover:text-text-primary border border-border rounded" onClick={() => { inlineConfirm.resolve(false); setInlineConfirm(null); }}>取消</button>
            <button className="px-4 py-1 text-xs bg-accent text-white rounded" onClick={() => { inlineConfirm.resolve(true); setInlineConfirm(null); }}>确定</button>
          </div>
        </div>
      </div>
    )}

    {inlineAlert && (
      <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50" onClick={() => { inlineAlert.resolve(); setInlineAlert(null); }}>
        <div className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[360px] max-w-[min(680px,90vw)]" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm font-medium text-text-primary mb-3">
            {inlineAlert.type === 'error' ? '操作失败' : inlineAlert.type === 'warning' ? '操作结果' : '提示'}
          </div>
          <div className="text-xs leading-relaxed text-text-secondary whitespace-pre-wrap max-h-[60vh] overflow-auto pr-1">
            {inlineAlert.message}
          </div>
          <div className="flex justify-end mt-4">
            <button
              className="px-4 py-1 text-xs bg-accent text-white rounded"
              onClick={() => { inlineAlert.resolve(); setInlineAlert(null); }}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    )}

    {copyConflictChoice && (
      <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50" onClick={() => { copyConflictChoice.resolve(null); setConflictHover(null); setCopyConflictChoice(null); }}>
        <div className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[560px] max-w-[min(720px,90vw)]" onClick={(e) => e.stopPropagation()}>
          <div className="text-sm text-text-primary mb-4 whitespace-pre-wrap">{copyConflictChoice.message}</div>
          <div className="grid grid-cols-4 gap-2">
            <button
              className={getConflictChoiceButtonClass('skip', conflictHover)}
              onMouseEnter={() => setConflictHover('skip')}
              onMouseLeave={() => setConflictHover(null)}
              onFocus={() => setConflictHover('skip')}
              onBlur={() => setConflictHover(null)}
              onClick={() => { copyConflictChoice.resolve('skip'); setConflictHover(null); setCopyConflictChoice(null); }}
            >
              跳过全部同名
            </button>
            <button
              className={getConflictChoiceButtonClass('rename', conflictHover)}
              onMouseEnter={() => setConflictHover('rename')}
              onMouseLeave={() => setConflictHover(null)}
              onFocus={() => setConflictHover('rename')}
              onBlur={() => setConflictHover(null)}
              onClick={() => { copyConflictChoice.resolve('rename'); setConflictHover(null); setCopyConflictChoice(null); }}
            >
              自动重命名全部
            </button>
            <button
              className={getConflictChoiceButtonClass('overwrite', conflictHover)}
              onMouseEnter={() => setConflictHover('overwrite')}
              onMouseLeave={() => setConflictHover(null)}
              onFocus={() => setConflictHover('overwrite')}
              onBlur={() => setConflictHover(null)}
              onClick={() => { copyConflictChoice.resolve('overwrite'); setConflictHover(null); setCopyConflictChoice(null); }}
            >
              覆盖全部
            </button>
            <button
              className={getConflictChoiceButtonClass('cancel', conflictHover)}
              onMouseEnter={() => setConflictHover('cancel')}
              onMouseLeave={() => setConflictHover(null)}
              onFocus={() => setConflictHover('cancel')}
              onBlur={() => setConflictHover(null)}
              onClick={() => { copyConflictChoice.resolve(null); setConflictHover(null); setCopyConflictChoice(null); }}
            >
              取消
            </button>
          </div>
        </div>
      </div>
    )}

    {pendingOperation && (
      <div className="fixed inset-0 z-[205] flex items-center justify-center bg-black/40">
        <div className="bg-surface-light border border-border rounded-lg shadow-2xl p-4 min-w-[320px]">
          <div className="text-sm text-text-primary mb-1">{pendingOperation.label}</div>
          <div className="text-xs text-text-muted mb-4">
            长任务可取消；已完成的项目会在结果报告中列出。
          </div>
          <div className="flex justify-end">
            <button
              className="px-4 py-1 text-xs text-text-secondary hover:text-text-primary border border-border rounded disabled:opacity-60"
              disabled={pendingOperation.cancelling}
              onClick={cancelPendingOperation}
            >
              {pendingOperation.cancelling ? '正在取消...' : '取消任务'}
            </button>
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
              <MenuBtn onClick={handleOpenFolder}><FolderOpen className="w-3.5 h-3.5" /> 打开文件夹...</MenuBtn>
              <MenuBtn onClick={ctxNewFolder}><FolderPlus className="w-3.5 h-3.5" /> 新建文件夹</MenuBtn>
              <MenuBtn onClick={ctxNewFile}><FilePlus className="w-3.5 h-3.5" /> 新建文件</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxRefresh}><RefreshCw className="w-3.5 h-3.5" /> 刷新</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxEmptyFolder}><Trash2 className="w-3.5 h-3.5" /> 清空文件夹</MenuBtn>
            </>
          )}
          {/* 单个文件或文件夹 */}
          {contextMenu.single && (
            <>
              <MenuBtn onClick={ctxOpen}>
                {contextMenu.single.isDirectory ? <Folder className="w-3.5 h-3.5" /> : <File className="w-3.5 h-3.5" />}
                {' '}{contextMenu.single.isDirectory ? '打开' : '打开文件'}
              </MenuBtn>
              {contextMenu.single.isDirectory && (
                <MenuBtn onClick={ctxOpenOther}>↗️ 在另一侧打开</MenuBtn>
              )}
              <MenuSep />
              <MenuBtn onClick={ctxCopy}><Copy className="w-3.5 h-3.5" /> 复制到另一侧</MenuBtn>
              <MenuBtn onClick={ctxMove}><ArrowRightLeft className="w-3.5 h-3.5" /> 移动到另一侧</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxRename}><Pencil className="w-3.5 h-3.5" /> 重命名</MenuBtn>
              <MenuBtn onClick={ctxDelete}><Trash2 className="w-3.5 h-3.5" /> 删除</MenuBtn>
              <MenuBtn onClick={ctxPermanentDelete}><Trash2 className="w-3.5 h-3.5" /> 永久删除</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxCopyName}><Clipboard className="w-3.5 h-3.5" /> 复制文件名</MenuBtn>
              <MenuBtn onClick={ctxCopyPath}><ClipboardCheck className="w-3.5 h-3.5" /> 复制路径</MenuBtn>
            </>
          )}
          {/* 多个选中 */}
          {contextMenu.count > 1 && !contextMenu.single && (
            <>
              <MenuBtn onClick={ctxCopy}><Copy className="w-3.5 h-3.5" /> 复制 {contextMenu.count} 项到另一侧</MenuBtn>
              <MenuBtn onClick={ctxMove}><ArrowRightLeft className="w-3.5 h-3.5" /> 移动 {contextMenu.count} 项到另一侧</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxDelete}><Trash2 className="w-3.5 h-3.5" /> 删除 {contextMenu.count} 项</MenuBtn>
              <MenuBtn onClick={ctxPermanentDelete}><Trash2 className="w-3.5 h-3.5" /> 永久删除 {contextMenu.count} 项</MenuBtn>
              <MenuSep />
              <MenuBtn onClick={ctxCopyName}><Clipboard className="w-3.5 h-3.5" /> 复制文件名</MenuBtn>
              <MenuBtn onClick={ctxCopyPath}><ClipboardCheck className="w-3.5 h-3.5" /> 复制路径</MenuBtn>
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

function getConflictChoiceButtonClass(
  id: FileConflictStrategy | 'cancel',
  hoveredId: FileConflictStrategy | 'cancel' | null,
): string {
  const base = 'px-4 py-1 text-xs border rounded';
  if (hoveredId === id) {
    if (id === 'overwrite') {
      return `${base} bg-red-600/80 border-red-500/80 text-white`;
    }
    return `${base} bg-accent border-accent text-white`;
  }
  if (!hoveredId && id === 'rename') {
    return `${base} bg-accent border-accent text-white`;
  }
  return `${base} text-text-secondary hover:text-text-primary border-border`;
}

// ── 列头排序 ──

const SORT_COLS: { key: import('@explore/shared').SortKey; label: string; className: string }[] = [
  { key: 'name', label: '名称', className: 'flex-1 ml-1' },
  { key: 'extension', label: '类型', className: 'w-24 text-left ml-2' },
  { key: 'size', label: '大小', className: 'w-20 text-right ml-2' },
  { key: 'modifiedAt', label: '修改时间', className: 'w-36 text-right ml-2' },
];

function SortHeader({ side }: { side: 'left' | 'right' }) {
  const sort = useFileStore((s) => s[side].sort);
  const setSort = useFileStore((s) => s.setSort);

  return (
    <div className="sticky top-0 z-10 flex items-center h-7 px-2 border-b border-border/30 bg-surface text-xs text-text-muted select-none">
      <span className="w-5 flex-shrink-0" />
      {SORT_COLS.map((col) => {
        const active = sort.key === col.key;
        return (
          <span
            key={col.key}
            className={`${col.className} cursor-pointer hover:text-text-primary transition-colors ${
              active ? 'text-text-primary font-medium' : ''
            }`}
            onClick={() => setSort(side, col.key)}
          >
            {col.label}
            {active && (
              <span className="ml-0.5">{sort.direction === 'asc' ? '▲' : '▼'}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}
