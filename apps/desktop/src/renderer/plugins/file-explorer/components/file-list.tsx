import { useCallback, useEffect, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useFileStore, useFilteredEntries } from '../store';
import { FileRow } from './file-row';
import { ipc } from '../../../framework/bridge/ipc-client';
import { useLayoutStore } from '../../../framework/store/layout-store';

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
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [dropFlashPath, setDropFlashPath] = useState<string | null>(null);
  const lastBackspaceRef = useRef<string | null>(null);
  const [disableHover, setDisableHover] = useState(false);

  // 筛选文本/条目变化时，重置焦点
  useEffect(() => {
    setFocusIdx(0);
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

  // ── 封装 navigateTo：同时更新 FileStore 和 LayoutStore ──

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
            lastBackspaceRef.current = state.path;
            const parent = state.path.split(/[/\\]/).slice(0, -1).join('\\') || state.path.slice(0, 2) + '\\';
            navigateToPath(parent);
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
            const next = Math.min(focusIdx + 1, entries.length - 1);
            selectSingle(side, entries[next].path);
            setFocusIdx(next);
            setDisableHover(true);
            (document.activeElement as HTMLElement)?.blur();
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          {
            const next = Math.max(focusIdx - 1, 0);
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
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            {
              const tabs = useFileStore.getState()[side].tabs;
              if (tabs.length > 1) {
                const curIdx = tabs.findIndex((t) => t.id === useFileStore.getState()[side].activeTabId);
                const next = e.shiftKey
                  ? (curIdx - 1 + tabs.length) % tabs.length
                  : (curIdx + 1) % tabs.length;
                const target = tabs[next];
                useFileStore.getState().activateTab(side, target.id);
                navigateTo(side, target.path);
                useLayoutStore.getState().setPanelPath(side, target.path);
              }
            }
          }
          break;

        case 'Enter': {
          // 有选中项：打开选中项
          if (entries.length > 0 && state.selected.size === 1) {
            const selPath = [...state.selected][0];
            const entry = entries.find((e) => e.path === selPath);
            if (entry?.isDirectory) {
              navigateToPath(entry.path);
            } else if (entry) {
              ipc.invoke('file:open', { path: entry.path });
            }
          } else if (entries.length > 0 && focusIdx < entries.length) {
            // 无选中但有焦点项：打开焦点项
            const entry = entries[focusIdx];
            if (entry.isDirectory) {
              navigateToPath(entry.path);
            } else {
              ipc.invoke('file:open', { path: entry.path });
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
            const name = prompt('Folder name:');
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
            if (confirm(`Delete ${names}?`)) {
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
  }, [side, filterText, path, entries, selected, setFilter, clearSelection, navigateToPath, refresh, handleOpenFolder]);

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

  return (
    <div ref={containerRef} className="h-full overflow-auto">
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
                    ipc.invoke('file:open', { path: entry.path });
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!selected.has(entry.path)) {
                    clearSelection(side);
                    toggleSelect(side, entry.path);
                  }
                }}
                onDragStart={(e) => {
                  const paths = selected.has(entry.path)
                    ? [...selected]
                    : [entry.path];
                  e.dataTransfer.setData('application/x-explore-files', JSON.stringify(paths));
                }}
                dragOver={dragOverPath === entry.path}
                dropFlash={dropFlashPath === entry.path}
                onDrop={async (e) => {
                  const data = e.dataTransfer.getData('application/x-explore-files');
                  if (!data) return;
                  const sources: string[] = JSON.parse(data);
                  const isMove = e.ctrlKey || e.metaKey;
                  if (isMove) {
                    await ipc.invoke('file:move', { sources, destDir: entry.path });
                  } else {
                    await ipc.invoke('file:copy', { sources, destDir: entry.path });
                  }
                  refresh(side);
                  const otherSide = side === 'left' ? 'right' : 'left';
                  useFileStore.getState().refresh(otherSide);
                  // flash feedback
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
  );
}
