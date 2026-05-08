import { useEffect, useCallback, useState } from 'react';
import { SplitPane, useLayoutStore } from './framework/layout';
import { ErrorBoundary } from './components/error-boundary';
import { MenuBar } from './components/menu-bar';
import { ActivityBar } from './components/activity-bar';
import { Launcher } from './plugins/quick-launcher';
import { FileList, useFileStore, AddressBar, TabBar } from './plugins/file-explorer';
import { FileSearch } from './plugins/file-explorer/components/file-search';
import { TabSearch } from './plugins/file-explorer/components/tab-search';
import { SearchPanel, useSearchStore } from './plugins/fulltext-search';
import { BookmarkPanel } from './plugins/bookmarks';
import { ipc } from './framework/bridge/ipc-client';

type PanelType = 'file-explorer' | 'fulltext-search' | 'bookmarks';

// ── App Shell ──

export function App() {
  const hash = window.location.hash;
  const isLauncher = hash === '#/launcher';

  if (isLauncher) {
    return <Launcher />;
  }

  return <MainApp />;
}

// ── 主窗口 ──

function MainApp() {
  const layout = useLayoutStore((s) => s.layout);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warn' | 'error' } | null>(null);

  const notify = useCallback((message: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // 启动时恢复固定标签，打开第一个标签或默认目录
  useEffect(() => {
    async function init() {
      await useFileStore.getState().loadPinnedTabs();

      const currentLayout = useLayoutStore.getState().layout;
      const fileStore = useFileStore.getState();

      // 左面板
      if (!currentLayout.left.path) {
        const leftPinned = fileStore.left.tabs.filter((t) => t.pinned);
        const leftTarget = leftPinned.length > 0 ? leftPinned[leftPinned.length - 1].path : null;
        if (leftTarget) {
          fileStore.addTab('left', leftTarget);
          await fileStore.navigateTo('left', leftTarget, false);
          useLayoutStore.getState().setPanelPath('left', leftTarget);
        } else {
          const homeDir = await ipc.invoke('app:getHomeDir', undefined);
          fileStore.addTab('left', homeDir);
          await fileStore.navigateTo('left', homeDir, true);
          useLayoutStore.getState().setPanelPath('left', homeDir);
        }
      }

      // 右面板
      if (!currentLayout.right.path) {
        const rightPinned = fileStore.right.tabs.filter((t) => t.pinned);
        const rightTarget = rightPinned.length > 0 ? rightPinned[rightPinned.length - 1].path : null;
        if (rightTarget) {
          fileStore.addTab('right', rightTarget);
          await fileStore.navigateTo('right', rightTarget, false);
          useLayoutStore.getState().setPanelPath('right', rightTarget);
        }
      }
    }
    init();
  }, []);
  const activePanel = layout.id;
  const activePath =
    activePanel === 'left'
      ? layout.left.path
      : activePanel === 'right'
        ? layout.right.path
        : null;

  const handlePanelClick = useCallback(
    (side: 'left' | 'right') => {
      useLayoutStore.getState().setActivePanel(side);
    },
    [],
  );

  const handlePanelTypeChange = useCallback(
    (side: 'left' | 'right', type: PanelType) => {
      useLayoutStore.getState().setPanelPlugin(
        side,
        type,
        type === 'file-explorer' ? 'browser' : type === 'fulltext-search' ? 'search' : 'list',
      );
    },
    [],
  );

  // Ctrl+Shift+F: 在当前活跃面板打开全文搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        const activeSide = useLayoutStore.getState().layout.id;
        if (activeSide === 'left' || activeSide === 'right') {
          handlePanelTypeChange(activeSide, 'fulltext-search');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePanelTypeChange]);

  return (
    <div className="h-full flex flex-col bg-surface">
      <MenuBar />
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar />
        <div className="flex-1 flex flex-col overflow-hidden">
        <SplitPane defaultSplit={50} minSize={200}>
          <PanelSlot
            side="left"
            pluginId={layout.left.pluginId}
            onClick={() => handlePanelClick('left')}
            onTypeChange={(t) => handlePanelTypeChange('left', t)}
            notify={notify}
          />
          <PanelSlot
            side="right"
            pluginId={layout.right.pluginId}
            onClick={() => handlePanelClick('right')}
            onTypeChange={(t) => handlePanelTypeChange('right', t)}
            notify={notify}
          />
        </SplitPane>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex-shrink-0 h-6 flex items-center px-3 bg-surface-light border-t border-border text-xs text-text-muted gap-3">
        <span className="text-text-primary font-medium truncate max-w-[50%]">
          {activePath ?? 'No folder open'}
        </span>
        <span className="flex-1" />
        <span>F5 Copy</span>
        <span>F6 Move</span>
        <span>F7 New Folder</span>
        <span>F8 Delete</span>
        <span>Ctrl+Shift+F Search</span>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
          <div className={`px-4 py-2 rounded-lg shadow-lg text-sm ${
            toast.type === 'error' ? 'bg-red-600/90 text-white' :
            toast.type === 'warn' ? 'bg-yellow-600/90 text-white' :
            'bg-accent/90 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 面板插槽 ──

const PANEL_TYPES: { id: PanelType; label: string }[] = [
  { id: 'file-explorer', label: 'Files' },
  { id: 'fulltext-search', label: 'Search' },
  { id: 'bookmarks', label: 'Bookmarks' },
];

function PanelSlot({
  side,
  pluginId,
  onClick,
  onTypeChange,
  notify,
}: {
  side: 'left' | 'right';
  pluginId: string;
  onClick: () => void;
  onTypeChange: (type: PanelType) => void;
  notify: (message: string, type?: 'info' | 'warn' | 'error') => void;
}) {
  const layout = useLayoutStore((s) => s.layout);
  const panel = layout[side];
  const isActive = layout.id === side;
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTabSearch, setShowTabSearch] = useState(false);
  const [showFileSearch, setShowFileSearch] = useState(false);

  // Ctrl+T / Ctrl+P 搜索标签
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 't' || e.key === 'p') && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        setShowTabSearch((s) => !s);
      }
      if (e.key === 'f' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        setShowFileSearch((s) => !s);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive]);

  // 当 layout 中该面板的路径变化时，同步到 file-explorer store
  useEffect(() => {
    if (pluginId === 'file-explorer' && panel.path) {
      const fileStore = useFileStore.getState();
      if (fileStore[side].path !== panel.path) {
        fileStore.navigateTo(side, panel.path);
      }
    }
  }, [panel.path, pluginId]);

  // 当切换到全文搜索面板时，自动设置搜索目录
  useEffect(() => {
    if (pluginId === 'fulltext-search') {
      const searchDir = panel.path ?? undefined;
      useSearchStore.getState().setSearchDir(searchDir ?? null);
    }
  }, [pluginId, panel.path]);

  const renderPanel = () => {
    if (pluginId === 'file-explorer') {
      return <FileList side={side} />;
    }
    if (pluginId === 'fulltext-search') {
      return <SearchPanel />;
    }
    if (pluginId === 'bookmarks') {
      return <BookmarkPanel />;
    }

    return (
      <div className="h-full flex items-center justify-center text-text-muted text-sm">
        Unknown plugin: {pluginId}
      </div>
    );
  };

  const currentType = PANEL_TYPES.find((t) => t.id === pluginId);

  // 打开文件夹
  const handleOpenFolder = useCallback(async () => {
    const result = await ipc.invoke('dialog:openFolder', {
      defaultPath: panel.path ?? undefined,
    });
    if (result) {
      // 先用同步 action 创建标签，确保即时可见
      useFileStore.getState().addTab(side, result);
      // 再异步导航加载目录
      useFileStore.getState().navigateTo(side, result, false);
      useLayoutStore.getState().setPanelPath(side, result);
    }
  }, [side, panel.path]);

  // 拖放处理
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!panel.path) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? 'move' : 'copy';
  }, [panel.path]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    if (!panel.path) {
      notify('No folder open in target panel', 'warn');
      return;
    }
    const data = e.dataTransfer.getData('application/x-explore-files');
    if (!data) return;
    const sources: string[] = JSON.parse(data);
    if (sources.length === 0) return;

    const targetDir = panel.path;

    // 同一目录忽略
    if (sources.every((s) => {
      const parent = s.replace(/[/\\][^/\\]*$/, '');
      return parent === targetDir || s === targetDir;
    })) {
      notify('Already in the same directory', 'info');
      return;
    }

    // 拖文件夹到自己子目录 → 阻止
    if (sources.some((s) => targetDir.startsWith(s + '\\') || targetDir.startsWith(s + '/'))) {
      notify('Cannot copy a folder into itself', 'error');
      return;
    }

    const isMove = e.ctrlKey || e.metaKey;
    try {
      if (isMove) {
        const result = await ipc.invoke('file:move', { sources, destDir: targetDir });
        if (!result.success && result.skipped?.length) {
          await ipc.invoke('file:copy', { sources: result.skipped, destDir: targetDir });
          await ipc.invoke('file:delete', { paths: result.skipped });
          notify(`Moved ${sources.length} item(s) (cross-drive fallback)`, 'info');
        } else if (result.success) {
          notify(`Moved ${sources.length} item(s)`, 'info');
        } else {
          notify(`Move failed: ${result.error || 'unknown'}`, 'error');
        }
      } else {
        await ipc.invoke('file:copy', { sources, destDir: targetDir });
        notify(`Copied ${sources.length} item(s)`, 'info');
      }
    } catch (err: any) {
      notify(`Operation failed: ${err.message}`, 'error');
    }
    useFileStore.getState().refresh(side);
    const otherSide = side === 'left' ? 'right' : 'left';
    useFileStore.getState().refresh(otherSide);
  }, [side, panel.path, notify]);

  return (
    <div
      className="h-full flex flex-col"
      onClick={onClick}
    >
      {/* Tab Bar */}
      <ErrorBoundary name={`TabBar-${side}`}>
        {pluginId === 'file-explorer' && <TabBar side={side} />}
      </ErrorBoundary>

      {/* Panel Header */}
      <div
        className={`flex-shrink-0 h-9 flex items-center px-2 text-sm border-b border-border relative gap-1.5 ${
          isActive ? 'bg-accent/30' : 'bg-surface-light'
        }`}
      >
        {/* Side indicator */}
        <span className="text-text-secondary text-xs flex-shrink-0">
          {side === 'left' ? '◀' : '▶'}
        </span>

        {/* Panel type dropdown */}
        <button
          className="text-text-primary font-medium hover:text-accent cursor-pointer flex-shrink-0 text-sm"
          onClick={(e) => {
            e.stopPropagation();
            setShowDropdown(!showDropdown);
          }}
          title="Click to change panel type"
        >
          {currentType?.label ?? pluginId}
          <span className="ml-0.5 text-[10px] text-text-muted">▼</span>
        </button>

        {/* 地址栏 / 路径面包屑 */}
        {pluginId === 'file-explorer' && panel.path && (
          <AddressBar side={side} />
        )}
        {(!pluginId || pluginId !== 'file-explorer' || !panel.path) && (
          <span className="flex-1" />
        )}

        {/* 工具栏 — 最右 */}
        <div className="flex items-center gap-0.5 flex-shrink-0 ml-auto">
          {/* Open Folder button */}
          <button
            className="text-text-muted hover:text-accent hover:bg-accent/10 rounded px-1.5 py-0.5 cursor-pointer text-base leading-none transition-colors"
            title="Open folder (Ctrl+O)"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFolder();
            }}
          >
            📂
          </button>

          {isActive && (
            <span className="text-xs text-accent font-medium">◉ 活跃</span>
          )}
        </div>

        {/* Dropdown menu */}
        {showDropdown && (
          <div
            className="absolute left-8 top-7 z-50 bg-surface-light border border-border rounded shadow-lg py-1 min-w-[120px]"
            onClick={(e) => e.stopPropagation()}
          >
            {PANEL_TYPES.map((t) => (
              <button
                key={t.id}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent/20 ${
                  t.id === pluginId ? 'text-accent' : 'text-text-secondary'
                }`}
                onClick={() => {
                  onTypeChange(t.id);
                  setShowDropdown(false);
                }}
              >
                {t.label}
                {t.id === pluginId && (
                  <span className="ml-1">✓</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Click-away to close dropdown */}
        {showDropdown && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowDropdown(false)}
          />
        )}
      </div>

      {/* Panel Content */}
      <div
        className="flex-1 overflow-hidden bg-surface relative"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {showFileSearch && pluginId === 'file-explorer' && (
          <FileSearch
            side={side}
            open={showFileSearch}
            onClose={() => setShowFileSearch(false)}
          />
        )}
        {showTabSearch && (
          <TabSearch
            side={side}
            open={showTabSearch}
            onClose={() => setShowTabSearch(false)}
          />
        )}
        {renderPanel()}
        {!isActive && <div className="absolute inset-0 bg-black/30 pointer-events-none" />}
      </div>
    </div>
  );
}
