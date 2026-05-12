import { useEffect, useCallback, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { SplitPane, useLayoutStore } from './framework/layout';
import { pluginManager } from './framework/plugin-system';
import { setNotificationHandler } from './framework/plugin-system/plugin-context';
import { themes } from './framework/themes';
import { ErrorBoundary } from './components/error-boundary';
import { MenuBar } from './components/menu-bar';
import { ActivityBar } from './components/activity-bar';
import { PluginManagerDialog } from './components/plugin-manager-dialog';
import { Launcher } from './plugins/quick-launcher';
import { useFileStore, TabBar, AddressBar } from './plugins/file-explorer';
import { useSpaceStore, restoreState, initAutoSave } from './plugins/file-explorer/space-store';
import type { Tab } from './plugins/file-explorer/store';
import { FileSearch } from './plugins/file-explorer/components/file-search';
import { TabSearch } from './plugins/file-explorer/components/tab-search';
import { SpaceSearch } from './plugins/file-explorer/components/space-search';
import { useSearchStore } from './plugins/fulltext-search';
import { ipc } from './framework/bridge/ipc-client';

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
  const fontScale = useLayoutStore((s) => s.fontScale);
  const theme = useLayoutStore((s) => s.theme);
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'warn' | 'error' } | null>(null);
  const [showSpaceSearch, setShowSpaceSearch] = useState(false);

  const notify = useCallback((message: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Wire plugin notification handler
  useEffect(() => {
    setNotificationHandler(notify);
  }, [notify]);

  // Sync font size to CSS variable
  useEffect(() => {
    document.documentElement.style.setProperty('--font-scale', `${fontScale}`);
  }, [fontScale]);

  // Sync theme to CSS variables
  useEffect(() => {
    const t = themes[theme as keyof typeof themes] ?? themes.linear;
    for (const [key, value] of Object.entries(t.vars)) {
      document.documentElement.style.setProperty(key, value);
    }
    const prev = Object.values(themes).map((x) => x.className).filter(Boolean);
    document.body.classList.remove(...prev);
    if (t.className) document.body.classList.add(t.className);
  }, [theme]);

  // 启动时恢复 Space 标签 / 固定标签
  useEffect(() => {
    async function init() {
      await useFileStore.getState().loadPinnedTabs();
      await useSpaceStore.getState().loadSpaces();

      const spaceStore = useSpaceStore.getState();
      const activeSpace = spaceStore.spaces.find((s) => s.id === spaceStore.activeSpaceId);

      // 如果活跃 Space 有标签，优先恢复 Space 中的标签
      const leftTabs = activeSpace?.left.tabs ?? [];
      const rightTabs = activeSpace?.right.tabs ?? [];

      if (leftTabs.length > 0) {
        await restoreState('left', activeSpace!.left);
      } else {
        const fileStore = useFileStore.getState();
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

      if (rightTabs.length > 0) {
        await restoreState('right', activeSpace!.right);
      } else {
        const fileStore = useFileStore.getState();
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
    initAutoSave();
  }, []);

  // 关闭前保存当前 Space
  useEffect(() => {
    const handleBeforeUnload = () => {
      useSpaceStore.getState().saveCurrentSpace();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
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

  const handlePluginChange = useCallback(
    (side: 'left' | 'right', pluginId: string, panelId: string) => {
      useLayoutStore.getState().setPanelPlugin(side, pluginId, panelId);
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
          handlePluginChange(activeSide, 'fulltext-search', 'search');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePluginChange]);

  // Ctrl+W: 快速搜索/切换工作区
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'w' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        setShowSpaceSearch((s) => !s);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-full flex flex-col bg-surface">
      <MenuBar />
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar />
        <div className="flex-1 flex flex-col overflow-hidden">
        {layout.mode === 'single' ? (
          <PanelSlot
            side="left"
            pluginId={layout.left.pluginId}
            onClick={() => handlePanelClick('left')}
            onPluginChange={(pluginId, panelId) => handlePluginChange('left', pluginId, panelId)}
            notify={notify}
          />
        ) : (
        <SplitPane defaultSplit={50} minSize={200}>
          <PanelSlot
            side="left"
            pluginId={layout.left.pluginId}
            onClick={() => handlePanelClick('left')}
            onPluginChange={(pluginId, panelId) => handlePluginChange('left', pluginId, panelId)}
            notify={notify}
          />
          <PanelSlot
            side="right"
            pluginId={layout.right.pluginId}
            onClick={() => handlePanelClick('right')}
            onPluginChange={(pluginId, panelId) => handlePluginChange('right', pluginId, panelId)}
            notify={notify}
          />
        </SplitPane>
        )}
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
        <span>Ctrl+Shift+P Pin</span>
        <span>Ctrl+Shift+R Re-pin</span>
        <span>Ctrl+W Workspace</span>
        <span>Ctrl+Shift+F Search</span>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
          <div className={`px-4 py-2 rounded-lg shadow-lg text-sm ${
            toast.type === 'error' ? 'bg-red-600/90 text-white' :
            toast.type === 'warn' ? 'bg-yellow-600/90 text-white' :
            'bg-accent/90 text-white'
          }`}>
            {toast.message}
          </div>
        </div>
      )}

      <PluginManagerDialog />
      <SpaceSearch open={showSpaceSearch} onClose={() => setShowSpaceSearch(false)} />
    </div>
  );
}

// ── 面板插槽 ──

function PanelSlot({
  side,
  pluginId,
  onClick,
  onPluginChange,
  notify,
}: {
  side: 'left' | 'right';
  pluginId: string;
  onClick: () => void;
  onPluginChange: (pluginId: string, panelId: string) => void;
  notify: (message: string, type?: 'info' | 'warn' | 'error') => void;
}) {
  const layout = useLayoutStore((s) => s.layout);
  const panel = layout[side];
  const isActive = layout.id === side;
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
  }, [panel.path, pluginId, side]);

  // 当切换到全文搜索面板时，自动设置搜索目录
  useEffect(() => {
    if (pluginId === 'fulltext-search') {
      const searchDir = panel.path ?? undefined;
      useSearchStore.getState().setSearchDir(searchDir ?? null);
    }
  }, [pluginId, panel.path]);

  const renderPanel = () => {
    const entry = pluginManager.getPanel(`${pluginId}:${panel.panelId}`);
    if (!entry?.renderer) {
      return (
        <div className="h-full flex items-center justify-center text-text-muted text-sm">
          Unknown plugin: {pluginId}
        </div>
      );
    }
    const Renderer = entry.renderer;
    return <Renderer side={side} />;
  };

  // 打开文件夹
  const handleOpenFolder = useCallback(async () => {
    const result = await ipc.invoke('dialog:openFolder', {
      defaultPath: panel.path ?? undefined,
    });
    if (result) {
      useFileStore.getState().addTab(side, result);
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

    // 同名冲突确认
    const sourceNames = new Set(sources.map((s) => s.split(/[/\\]/).pop()?.toLowerCase()));
    const destEntries = await ipc.invoke('file:readDir', { path: targetDir });
    const conflicts = destEntries.filter((de) => sourceNames.has(de.name.toLowerCase()));
    if (conflicts.length > 0) {
      const names = conflicts.map((c) => c.name).join(', ');
      if (!await ipc.invoke('dialog:confirm', { message: `Overwrite existing files?\n${names}` })) {
        notify('Cancelled', 'info');
        return;
      }
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
      {/* Tab Bar + Panel Header — 统一背景 */}
      <div className={`flex-shrink-0 ${isActive ? 'bg-surface-lighter' : 'bg-surface'}`}>
      <ErrorBoundary name={`TabBar-${side}`}>
        {pluginId === 'file-explorer' && <TabBar side={side} />}
      </ErrorBoundary>

      {/* Panel Header — 地址栏区 */}
      <div
        className="h-8 flex items-center px-2 text-sm border-b border-border/30"
      >
        {/* 地址栏 / 路径面包屑 */}
        {pluginId === 'file-explorer' && panel.path && (
          <AddressBar side={side} />
        )}
        {((!pluginId || pluginId !== 'file-explorer' || !panel.path)) && (
          <span className="flex-1" />
        )}

        {/* 工具栏 — 最右 */}
        <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
          <button
            className="text-text-muted hover:text-text-primary hover:bg-white/5 rounded p-0.5 cursor-pointer transition-colors"
            title="Open folder (Ctrl+O)"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFolder();
            }}
          >
            <FolderOpen className="w-4 h-4" />
          </button>

          {isActive && (
            <div className="active-dot" title="Active panel" />
          )}
        </div>
      </div>
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
