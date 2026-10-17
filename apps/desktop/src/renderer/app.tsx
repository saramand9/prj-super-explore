import { useEffect, useCallback, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, FolderOpen, X } from 'lucide-react';
import { SplitPane, useLayoutStore } from './framework/layout';
import { pluginManager } from './framework/plugin-system';
import { setNotificationHandler } from './framework/plugin-system/plugin-context';
import { themes } from './framework/themes';
import { ErrorBoundary } from './components/error-boundary';
import { MenuBar } from './components/menu-bar';
import { ActivityBar } from './components/activity-bar';
import { Toolbar } from './components/toolbar';
import { PluginManagerDialog } from './components/plugin-manager-dialog';
import { Launcher } from './plugins/quick-launcher';
import { useFileStore, TabBar, AddressBar } from './plugins/file-explorer';
import { useSpaceStore } from './plugins/file-explorer/space-store';
import { WorkspacePersistence } from './components/workspace-persistence';
import type { Tab } from './plugins/file-explorer/store';
import { FileSearch } from './plugins/file-explorer/components/file-search';
import { TabSearch } from './plugins/file-explorer/components/tab-search';
import { SpaceSearch } from './plugins/file-explorer/components/space-search';
import { getFileDropEffect } from './plugins/file-explorer/utils/file-drag';
import { closeExplorerTab } from './plugins/file-explorer/utils/tab-actions';
import {
  getFileOpToastType,
  resolveCopyConflictStrategyWithChoice,
  summarizeFileOpResult,
  summarizeFileOpToast,
} from './plugins/file-explorer/utils/file-op-result';
import { useSearchStore } from './plugins/fulltext-search';
import { useViewerStore } from './plugins/viewer/store';
import { ipc } from './framework/bridge/ipc-client';
import { appDialog, AppDialogHost } from './framework/dialogs/app-dialog';

// ── App Shell ──

const MOUSE_GESTURE_THRESHOLD_PX = 56;
const MOUSE_GESTURE_VERTICAL_LIMIT_PX = 48;
const MOUSE_GESTURE_AXIS_RATIO = 1.25;
const WHEEL_NAVIGATION_THRESHOLD_PX = 80;
const WHEEL_NAVIGATION_COOLDOWN_MS = 650;
const MOUSE_GESTURE_TRAIL_CLEAR_MS = 180;
const MOUSE_GESTURE_DEBUG_STORAGE_KEY = 'explore:mouseGestureDebug';

type PanelSide = 'left' | 'right';
type MouseGestureAction = 'back' | 'forward';
type MouseNavigationSource = 'right-drag' | 'side-button' | 'wheel' | 'app-command';

interface MouseGestureState {
  side: PanelSide;
  startX: number;
  startY: number;
  action: MouseGestureAction | null;
  active: boolean;
}

interface MouseGestureTrail {
  side: PanelSide;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  action: MouseGestureAction | null;
  available: boolean | null;
}

interface DeferredContextMenu {
  target: EventTarget | null;
  clientX: number;
  clientY: number;
}

interface WheelNavigationState {
  accumulatedX: number;
  lastWheelAt: number;
  lastTriggerAt: number;
}

function getMouseGestureAction(deltaX: number, deltaY: number): MouseGestureAction | null {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);
  if (absX < MOUSE_GESTURE_THRESHOLD_PX) return null;
  if (absY > MOUSE_GESTURE_VERTICAL_LIMIT_PX) return null;
  if (absX < absY * MOUSE_GESTURE_AXIS_RATIO) return null;
  return deltaX < 0 ? 'back' : 'forward';
}

function getMouseGestureElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function shouldIgnoreMouseGestureTarget(target: EventTarget | null): boolean {
  const element = getMouseGestureElement(target);
  if (!element) return false;
  return Boolean(
    element.closest('button,a,input,textarea,select,summary,[role="button"],[contenteditable="true"]'),
  );
}

function getPanelSideFromTarget(target: EventTarget | null): PanelSide | null {
  const element = getMouseGestureElement(target);
  if (!element) return null;
  const panel = element.closest<HTMLElement>('[data-panel-side]');
  const side = panel?.dataset.panelSide;
  return side === 'left' || side === 'right' ? side : null;
}

function getActivePanelSide(): PanelSide {
  return useLayoutStore.getState().layout.id === 'right' ? 'right' : 'left';
}

function getNavigationSideFromTarget(target: EventTarget | null): PanelSide {
  return getPanelSideFromTarget(target) ?? getActivePanelSide();
}

function getMouseGestureTargetLabel(target: EventTarget | null): string {
  const element = getMouseGestureElement(target);
  if (!element) return 'unknown';
  const id = element.id ? `#${element.id}` : '';
  const className =
    typeof element.className === 'string'
      ? element.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((name) => `.${name}`)
          .join('')
      : '';
  return `${element.tagName.toLowerCase()}${id}${className}`;
}

function isMouseGestureDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem(MOUSE_GESTURE_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function logMouseGesture(event: string, details?: Record<string, unknown>): void {
  if (!isMouseGestureDebugEnabled()) return;
  console.debug(`[mouse-gesture] ${event}`, details ?? {});
}

function parentDir(path: string): string | null {
  const normalized = path.replace(/[\\/]+$/, '');
  const idx = Math.max(normalized.lastIndexOf('\\'), normalized.lastIndexOf('/'));
  if (idx < 0) return null;
  const dir = normalized.slice(0, idx);
  const sep = normalized[idx];
  if (/^[A-Za-z]:$/.test(dir)) return `${dir}${sep}`;
  return dir || null;
}

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
  const mouseGestureRef = useRef<MouseGestureState | null>(null);
  const suppressContextMenuRef = useRef(false);
  const deferredContextMenuRef = useRef<DeferredContextMenu | null>(null);
  const replayingContextMenuRef = useRef(false);
  const wheelNavigationRef = useRef<WheelNavigationState>({
    accumulatedX: 0,
    lastWheelAt: 0,
    lastTriggerAt: 0,
  });
  const gestureHintTimerRef = useRef<number | null>(null);
  const gestureTrailTimerRef = useRef<number | null>(null);
  const debugStatusTimerRef = useRef<number | null>(null);
  const [mouseGestureHint, setMouseGestureHint] = useState<{
    action: MouseGestureAction;
    available: boolean;
  } | null>(null);
  const [mouseGestureTrail, setMouseGestureTrail] = useState<MouseGestureTrail | null>(null);
  const [mouseGestureDebugStatus, setMouseGestureDebugStatus] = useState<{
    message: string;
    type: 'info' | 'warn' | 'error';
  } | null>(null);

  const notify = useCallback((message: string, type: 'info' | 'warn' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Wire plugin notification handler
  useEffect(() => {
    setNotificationHandler(notify);
  }, [notify]);

  const isMouseGestureAvailable = useCallback((side: PanelSide, action: MouseGestureAction) => {
    const state = useFileStore.getState()[side];
    return action === 'back' ? state.backStack.length > 0 : state.forwardStack.length > 0;
  }, []);

  const showMouseGestureHint = useCallback(
    (side: PanelSide, action: MouseGestureAction) => {
      if (gestureHintTimerRef.current !== null) {
        window.clearTimeout(gestureHintTimerRef.current);
        gestureHintTimerRef.current = null;
      }
      setMouseGestureHint({
        action,
        available: isMouseGestureAvailable(side, action),
      });
    },
    [isMouseGestureAvailable],
  );

  const clearMouseGestureHintSoon = useCallback(() => {
    if (gestureHintTimerRef.current !== null) {
      window.clearTimeout(gestureHintTimerRef.current);
    }
    gestureHintTimerRef.current = window.setTimeout(() => {
      setMouseGestureHint(null);
      gestureHintTimerRef.current = null;
    }, 420);
  }, []);

  const clearMouseGestureTrailSoon = useCallback(() => {
    if (gestureTrailTimerRef.current !== null) {
      window.clearTimeout(gestureTrailTimerRef.current);
    }
    gestureTrailTimerRef.current = window.setTimeout(() => {
      setMouseGestureTrail(null);
      gestureTrailTimerRef.current = null;
    }, MOUSE_GESTURE_TRAIL_CLEAR_MS);
  }, []);

  const clearMouseGestureTrailNow = useCallback(() => {
    if (gestureTrailTimerRef.current !== null) {
      window.clearTimeout(gestureTrailTimerRef.current);
      gestureTrailTimerRef.current = null;
    }
    setMouseGestureTrail(null);
  }, []);

  const showMouseGestureDebugStatus = useCallback(
    (message: string, type: 'info' | 'warn' | 'error' = 'info') => {
      if (debugStatusTimerRef.current !== null) {
        window.clearTimeout(debugStatusTimerRef.current);
      }
      setMouseGestureDebugStatus({ message, type });
      debugStatusTimerRef.current = window.setTimeout(() => {
        setMouseGestureDebugStatus(null);
        debugStatusTimerRef.current = null;
      }, 2500);
    },
    [],
  );

  const runMouseGestureAction = useCallback(
    async (side: PanelSide, action: MouseGestureAction, source: MouseNavigationSource = 'right-drag') => {
      const panelState = useFileStore.getState()[side];
      const available =
        action === 'back' ? panelState.backStack.length > 0 : panelState.forwardStack.length > 0;
      logMouseGesture('run-request', {
        side,
        action,
        source,
        available,
        path: panelState.path,
        backStack: panelState.backStack.length,
        forwardStack: panelState.forwardStack.length,
      });
      const actionText = action === 'back' ? '返回' : '前进';
      if (!available) {
        showMouseGestureDebugStatus(`${source} ${side}: ${actionText}失败，没有${actionText}记录`, 'warn');
        return;
      }
      showMouseGestureDebugStatus(`${source} ${side}: 执行${actionText}`);

      useLayoutStore.getState().setActivePanel(side);
      const fileStore = useFileStore.getState();
      if (action === 'back') {
        await fileStore.goBack(side);
      } else {
        await fileStore.goForward(side);
      }
      const nextPath = useFileStore.getState()[side].path;
      if (nextPath) {
        useLayoutStore.getState().setPanelPath(side, nextPath);
      }
      logMouseGesture('run-complete', { side, action, source, nextPath });
      showMouseGestureDebugStatus(`${source} ${side}: 已${actionText}`);
    },
    [showMouseGestureDebugStatus],
  );

  useEffect(() => {
    return window.explore.events['navigation:command'](({ action, source }) => {
      const side = getActivePanelSide();
      logMouseGesture('app-command', { side, action, source });
      void runMouseGestureAction(side, action, source);
    });
  }, [runMouseGestureAction, showMouseGestureDebugStatus]);

  useEffect(() => {
    const replayDeferredContextMenu = () => {
      const deferred = deferredContextMenuRef.current;
      deferredContextMenuRef.current = null;
      if (!deferred) return;

      const target =
        deferred.target instanceof Element && document.contains(deferred.target)
          ? deferred.target
          : document.elementFromPoint(deferred.clientX, deferred.clientY);
      if (!target) return;

      suppressContextMenuRef.current = false;
      logMouseGesture('contextmenu-replay', {
        target: getMouseGestureTargetLabel(target),
        clientX: deferred.clientX,
        clientY: deferred.clientY,
      });
      replayingContextMenuRef.current = true;
      try {
        target.dispatchEvent(
          new MouseEvent('contextmenu', {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 0,
            clientX: deferred.clientX,
            clientY: deferred.clientY,
          }),
        );
      } finally {
        replayingContextMenuRef.current = false;
      }
    };

    const cancelGesture = (reason: string) => {
      if (!mouseGestureRef.current) return;
      logMouseGesture('cancel', { reason });
      mouseGestureRef.current = null;
      deferredContextMenuRef.current = null;
      setMouseGestureHint(null);
      clearMouseGestureTrailNow();
    };

    const finishGesture = (e: MouseEvent, source: 'mouseup' | 'contextmenu') => {
      const gesture = mouseGestureRef.current;
      if (!gesture) return false;

      const action = gesture.active ? gesture.action : null;
      mouseGestureRef.current = null;
      if (!action) {
        logMouseGesture('finish-without-action', { source });
        setMouseGestureHint(null);
        clearMouseGestureTrailSoon();
        if (source === 'mouseup') {
          window.setTimeout(replayDeferredContextMenu, 0);
        }
        return false;
      }

      deferredContextMenuRef.current = null;
      if (source === 'mouseup') {
        suppressContextMenuRef.current = true;
        window.setTimeout(() => {
          suppressContextMenuRef.current = false;
        }, 750);
      } else {
        suppressContextMenuRef.current = false;
      }
      logMouseGesture('finish-action', { source, side: gesture.side, action });
      void runMouseGestureAction(gesture.side, action);
      clearMouseGestureHintSoon();
      clearMouseGestureTrailSoon();
      e.preventDefault();
      e.stopPropagation();
      return true;
    };

    const startGesture = (e: MouseEvent) => {
      if (e.button !== 2) return;
      if (shouldIgnoreMouseGestureTarget(e.target)) {
        logMouseGesture('start-ignored', { target: getMouseGestureTargetLabel(e.target) });
        return;
      }

      const side =
        getPanelSideFromTarget(e.target) ??
        (useLayoutStore.getState().layout.id === 'right' ? 'right' : 'left');
      mouseGestureRef.current = {
        side,
        startX: e.clientX,
        startY: e.clientY,
        action: null,
        active: false,
      };
      deferredContextMenuRef.current = null;
      if (gestureTrailTimerRef.current !== null) {
        window.clearTimeout(gestureTrailTimerRef.current);
        gestureTrailTimerRef.current = null;
      }
      setMouseGestureTrail({
        side,
        startX: e.clientX,
        startY: e.clientY,
        currentX: e.clientX,
        currentY: e.clientY,
        action: null,
        available: null,
      });
      useLayoutStore.getState().setActivePanel(side);
      logMouseGesture('start', {
        side,
        target: getMouseGestureTargetLabel(e.target),
        clientX: e.clientX,
        clientY: e.clientY,
        buttons: e.buttons,
      });
    };

    const updateGesture = (e: MouseEvent) => {
      const gesture = mouseGestureRef.current;
      if (!gesture) return;

      const deltaX = e.clientX - gesture.startX;
      const deltaY = e.clientY - gesture.startY;
      const action = getMouseGestureAction(deltaX, deltaY);
      setMouseGestureTrail({
        side: gesture.side,
        startX: gesture.startX,
        startY: gesture.startY,
        currentX: e.clientX,
        currentY: e.clientY,
        action,
        available: action ? isMouseGestureAvailable(gesture.side, action) : null,
      });
      if (!action) return;

      const previousAction = gesture.action;
      gesture.active = true;
      gesture.action = action;
      suppressContextMenuRef.current = true;
      showMouseGestureHint(gesture.side, action);
      if (previousAction !== action) {
        logMouseGesture('active', {
          side: gesture.side,
          action,
          deltaX,
          deltaY,
          buttons: e.buttons,
        });
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const runMouseButtonNavigation = (e: MouseEvent, source: 'mouseup' | 'auxclick') => {
      if (e.button !== 3 && e.button !== 4) return false;

      const action: MouseGestureAction = e.button === 3 ? 'back' : 'forward';
      const side = getNavigationSideFromTarget(e.target);
      logMouseGesture('side-button', {
        source,
        side,
        action,
        button: e.button,
        target: getMouseGestureTargetLabel(e.target),
      });
      void runMouseGestureAction(side, action, 'side-button');
      e.preventDefault();
      e.stopPropagation();
      return true;
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (runMouseButtonNavigation(e, 'mouseup')) return;
      finishGesture(e, 'mouseup');
    };

    const handleAuxClick = (e: MouseEvent) => {
      runMouseButtonNavigation(e, 'auxclick');
    };

    const handleWheel = (e: WheelEvent) => {
      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      if (absX < 8 || absX < absY * MOUSE_GESTURE_AXIS_RATIO) return;

      const now = Date.now();
      const wheel = wheelNavigationRef.current;
      if (now - wheel.lastWheelAt > 240) {
        wheel.accumulatedX = 0;
      }
      wheel.lastWheelAt = now;
      wheel.accumulatedX += e.deltaX;

      if (now - wheel.lastTriggerAt < WHEEL_NAVIGATION_COOLDOWN_MS) return;
      if (Math.abs(wheel.accumulatedX) < WHEEL_NAVIGATION_THRESHOLD_PX) return;

      const action: MouseGestureAction = wheel.accumulatedX < 0 ? 'back' : 'forward';
      const side = getNavigationSideFromTarget(e.target);
      logMouseGesture('wheel', {
        side,
        action,
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        accumulatedX: wheel.accumulatedX,
        target: getMouseGestureTargetLabel(e.target),
      });
      wheel.accumulatedX = 0;
      wheel.lastTriggerAt = now;
      void runMouseGestureAction(side, action, 'wheel');
      e.preventDefault();
      e.stopPropagation();
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (replayingContextMenuRef.current) {
        logMouseGesture('contextmenu-allow-replay', { target: getMouseGestureTargetLabel(e.target) });
        return;
      }

      const gesture = mouseGestureRef.current;
      if (gesture) {
        e.preventDefault();
        e.stopPropagation();
        if (gesture.active && gesture.action) {
          finishGesture(e, 'contextmenu');
          return;
        }
        deferredContextMenuRef.current = {
          target: e.target,
          clientX: e.clientX,
          clientY: e.clientY,
        };
        showMouseGestureDebugStatus('右键菜单延迟 ' + gesture.side + ': 等待滑动');
        logMouseGesture('contextmenu-deferred', {
          side: gesture.side,
          target: getMouseGestureTargetLabel(e.target),
          buttons: e.buttons,
        });
        return;
      }

      if (!suppressContextMenuRef.current) return;
      suppressContextMenuRef.current = false;
      logMouseGesture('contextmenu-suppressed-after-action', {
        target: getMouseGestureTargetLabel(e.target),
      });
      e.preventDefault();
      e.stopPropagation();
    };

    const handleBlur = () => cancelGesture('window-blur');

    window.addEventListener('mousedown', startGesture, true);
    window.addEventListener('mousemove', updateGesture, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('auxclick', handleAuxClick, true);
    window.addEventListener('wheel', handleWheel, { capture: true, passive: false });
    window.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousedown', startGesture, true);
      window.removeEventListener('mousemove', updateGesture, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('auxclick', handleAuxClick, true);
      window.removeEventListener('wheel', handleWheel, true);
      window.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('blur', handleBlur);
    };
  }, [
    clearMouseGestureHintSoon,
    clearMouseGestureTrailNow,
    clearMouseGestureTrailSoon,
    isMouseGestureAvailable,
    runMouseGestureAction,
    showMouseGestureHint,
  ]);

  useEffect(
    () => () => {
      if (gestureHintTimerRef.current !== null) {
        window.clearTimeout(gestureHintTimerRef.current);
      }
      if (gestureTrailTimerRef.current !== null) {
        window.clearTimeout(gestureTrailTimerRef.current);
      }
      if (debugStatusTimerRef.current !== null) {
        window.clearTimeout(debugStatusTimerRef.current);
      }
    },
    [],
  );

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
    const prev = Object.values(themes)
      .map((x) => x.className)
      .filter(Boolean);
    document.body.classList.remove(...prev);
    if (t.className) document.body.classList.add(t.className);
  }, [theme]);

  const activePanel = layout.id;
  const activePath =
    activePanel === 'left' ? layout.left.path : activePanel === 'right' ? layout.right.path : null;
  const leftSelectedCount = useFileStore((s) => s.left.selected.size);
  const rightSelectedCount = useFileStore((s) => s.right.selected.size);
  const leftEntryCount = useFileStore((s) => s.left.entries.length);
  const rightEntryCount = useFileStore((s) => s.right.entries.length);
  const activeSelectedCount = activePanel === 'right' ? rightSelectedCount : leftSelectedCount;
  const activeEntryCount = activePanel === 'right' ? rightEntryCount : leftEntryCount;
  const activePanelLabel = activePanel === 'right' ? '右侧' : '左侧';
  const handlePanelClick = useCallback((side: 'left' | 'right') => {
    useLayoutStore.getState().setActivePanel(side);
  }, []);

  const handlePluginChange = useCallback((side: 'left' | 'right', pluginId: string, panelId: string) => {
    const store = useLayoutStore.getState();
    const previous = store.layout[side];
    if (previous.pluginId === 'viewer' && previous.path) {
      if (pluginId === 'fulltext-search') store.setPanelPath(side, parentDir(previous.path));
      if (pluginId === 'file-explorer') {
        store.setPanelPath(side, useFileStore.getState()[side].path ?? parentDir(previous.path));
      }
    }
    store.setPanelPlugin(side, pluginId, panelId);
  }, []);

  // Ctrl+Shift+F: 在当前活跃面板打开全文搜索
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        document.querySelector('[aria-modal="true"], [data-testid="workspace-search"]')
      )
        return;
      if (e.key.toLowerCase() === 'f' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
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

  // Ctrl+Shift+W: 快速搜索/切换工作区（Ctrl+W 保留给关闭标签）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      if (e.key.toLowerCase() === 'w' && (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        e.preventDefault();
        setShowSpaceSearch((s) => !s);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="h-full flex flex-col bg-surface">
      <div data-testid="application-chrome" className="application-chrome">
        <MenuBar />
        <Toolbar />
      </div>
      <WorkspacePersistence />
      <div className="flex-1 flex overflow-hidden">
        <ActivityBar onPluginChange={handlePluginChange} />
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
      <div className="flex h-6 flex-shrink-0 items-center gap-3 border-t border-border bg-surface-light px-3 text-xs text-text-muted">
        <span className="rounded bg-accent/10 px-1.5 py-px text-[11px] font-medium text-accent">
          {activePanelLabel}
        </span>
        <span className="min-w-0 flex-1 truncate text-text-secondary" title={activePath ?? undefined}>
          {activePath ?? '未打开文件夹'}
        </span>
        <span className="text-text-muted/80">
          {activeSelectedCount > 0 ? `已选 ${activeSelectedCount} 项` : `${activeEntryCount} 项`}
        </span>
        <span className="hidden text-text-muted/70 md:inline">F5 复制</span>
        <span className="hidden text-text-muted/70 md:inline">F6 移动</span>
        <span className="hidden text-text-muted/70 lg:inline">Ctrl+F 搜索</span>
        <span className="hidden text-text-muted/70 lg:inline">Ctrl+Shift+W 工作区</span>
      </div>

      {mouseGestureTrail &&
        (() => {
          const dx = mouseGestureTrail.currentX - mouseGestureTrail.startX;
          const dy = mouseGestureTrail.currentY - mouseGestureTrail.startY;
          const distance = Math.hypot(dx, dy);
          const color =
            mouseGestureTrail.available === false
              ? 'rgba(245, 158, 11, 0.95)'
              : mouseGestureTrail.action === 'back'
                ? 'rgba(96, 165, 250, 0.95)'
                : mouseGestureTrail.action === 'forward'
                  ? 'rgba(52, 211, 153, 0.95)'
                  : 'rgba(148, 163, 184, 0.7)';
          const label =
            mouseGestureTrail.action === 'back'
              ? mouseGestureTrail.available === false
                ? '无返回记录'
                : '返回'
              : mouseGestureTrail.action === 'forward'
                ? mouseGestureTrail.available === false
                  ? '无前进记录'
                  : '前进'
                : '滑动';
          const labelX = mouseGestureTrail.currentX + (dx < 0 ? -58 : 14);
          const labelY = mouseGestureTrail.currentY - 12;

          return (
            <svg
              data-testid="mouse-gesture-trail"
              className="fixed inset-0 z-[225] pointer-events-none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="mouse-gesture-trail-arrow"
                  markerWidth="9"
                  markerHeight="9"
                  refX="7"
                  refY="4.5"
                  orient="auto"
                  markerUnits="strokeWidth"
                >
                  <path d="M0,0 L8,4.5 L0,9 Z" fill={color} />
                </marker>
              </defs>
              <line
                x1={mouseGestureTrail.startX}
                y1={mouseGestureTrail.startY}
                x2={mouseGestureTrail.currentX}
                y2={mouseGestureTrail.currentY}
                stroke="rgba(0, 0, 0, 0.35)"
                strokeWidth="8"
                strokeLinecap="round"
              />
              <line
                x1={mouseGestureTrail.startX}
                y1={mouseGestureTrail.startY}
                x2={mouseGestureTrail.currentX}
                y2={mouseGestureTrail.currentY}
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
                markerEnd={distance > 24 ? 'url(#mouse-gesture-trail-arrow)' : undefined}
              />
              <circle cx={mouseGestureTrail.startX} cy={mouseGestureTrail.startY} r="4" fill={color} />
              <circle cx={mouseGestureTrail.currentX} cy={mouseGestureTrail.currentY} r="5" fill={color} />
              {distance > 18 && (
                <g>
                  <rect
                    x={labelX - 8}
                    y={labelY - 17}
                    width={label.length * 13 + 16}
                    height="24"
                    rx="4"
                    fill="rgba(15, 23, 42, 0.82)"
                    stroke="rgba(255, 255, 255, 0.18)"
                  />
                  <text x={labelX} y={labelY} fill="white" fontSize="12" fontWeight="600">
                    {label}
                  </text>
                </g>
              )}
            </svg>
          );
        })()}

      {mouseGestureDebugStatus && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[230] pointer-events-none">
          <div
            className={`rounded border px-3 py-1.5 text-xs shadow-lg ${
              mouseGestureDebugStatus.type === 'error'
                ? 'border-red-500/50 bg-red-600/80 text-white'
                : mouseGestureDebugStatus.type === 'warn'
                  ? 'border-yellow-500/50 bg-yellow-600/80 text-white'
                  : 'border-border/60 bg-surface-light/95 text-text-primary'
            }`}
          >
            {mouseGestureDebugStatus.message}
          </div>
        </div>
      )}

      {mouseGestureHint && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-[220] pointer-events-none">
          <div
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs shadow-lg ${
              mouseGestureHint.available
                ? 'border-accent/40 bg-accent/20 text-text-primary'
                : 'border-border/60 bg-surface-light/95 text-text-muted'
            }`}
          >
            {mouseGestureHint.action === 'back' ? (
              <ArrowLeft className="h-3.5 w-3.5" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            {mouseGestureHint.available
              ? mouseGestureHint.action === 'back'
                ? '返回'
                : '前进'
              : mouseGestureHint.action === 'back'
                ? '无返回记录'
                : '无前进记录'}
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] pointer-events-none">
          <div
            className={`px-4 py-2 rounded-lg shadow-lg text-sm whitespace-pre-line max-w-[min(720px,90vw)] ${
              toast.type === 'error'
                ? 'bg-red-600/90 text-white'
                : toast.type === 'warn'
                  ? 'bg-yellow-600/90 text-white'
                  : 'bg-accent/90 text-white'
            }`}
          >
            {toast.message}
          </div>
        </div>
      )}

      <PluginManagerDialog />
      <SpaceSearch open={showSpaceSearch} onClose={() => setShowSpaceSearch(false)} />
      <AppDialogHost />
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
  const viewerDir = pluginId === 'viewer' && panel.path ? parentDir(panel.path) : null;
  const panelDirectoryPath = pluginId === 'viewer' ? viewerDir : panel.path;
  // A preview is not a destination folder: transfers keep using this pane's browsing directory.
  const dropDirectoryPath = useFileStore((state) => state[side].path);
  const showExplorerChrome = pluginId === 'file-explorer' || pluginId === 'viewer';

  const tabActionPending = useRef(false);

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

  const switchToFileExplorer = useCallback(
    async (targetDir: string | null | undefined) => {
      const fileStore = useFileStore.getState();

      if (pluginId === 'viewer') {
        useViewerStore.getState().clear(side);
      }

      useLayoutStore.getState().setPanelPlugin(side, 'file-explorer', 'browser');
      useLayoutStore.getState().setActivePanel(side);
      if (targetDir) {
        if (fileStore[side].tabs.length === 0) {
          fileStore.addTab(side, targetDir);
        }
        useLayoutStore.getState().setPanelPath(side, targetDir);
        if (fileStore[side].path !== targetDir) {
          await fileStore.navigateTo(side, targetDir, false);
        }
      }
    },
    [side, pluginId],
  );

  const handleViewerChromeNavigate = useCallback(
    (targetDir: string) => {
      switchToFileExplorer(targetDir);
    },
    [switchToFileExplorer],
  );

  // 打开文件夹
  const handleOpenFolder = useCallback(async () => {
    const result = await ipc.invoke('dialog:openFolder', {
      defaultPath: panelDirectoryPath ?? undefined,
    });
    if (result) {
      useFileStore.getState().addTab(side, result);
      await switchToFileExplorer(result);
    }
  }, [side, panelDirectoryPath, switchToFileExplorer]);

  const handleClosePluginPanel = useCallback(async () => {
    const fileStore = useFileStore.getState();
    const previousDir = fileStore[side].path;
    const fallbackDir = pluginId === 'viewer' && panel.path ? parentDir(panel.path) : panel.path;
    await switchToFileExplorer(previousDir ?? fallbackDir);
  }, [side, pluginId, panel.path, switchToFileExplorer]);

  const handleNewTab = useCallback(async () => {
    const directory = panelDirectoryPath ?? useFileStore.getState()[side].path;
    if (!directory) {
      await handleOpenFolder();
      return;
    }
    const store = useFileStore.getState();
    const existing = store[side].tabs.find((tab) => tab.path === directory);
    if (existing) store.forkTab(side, existing.id);
    else store.addTab(side, directory);
    setShowTabSearch(false);
    setShowFileSearch(false);
    await switchToFileExplorer(directory);
  }, [side, panelDirectoryPath, handleOpenFolder, switchToFileExplorer]);

  const handleCloseTab = useCallback(async () => {
    if (showTabSearch || showFileSearch) {
      setShowTabSearch(false);
      setShowFileSearch(false);
      return;
    }
    if (pluginId !== 'file-explorer') {
      await handleClosePluginPanel();
      return;
    }
    const activeTabId = useFileStore.getState()[side].activeTabId;
    if (activeTabId) await closeExplorerTab(side, activeTabId);
  }, [side, pluginId, showTabSearch, showFileSearch, handleClosePluginPanel]);

  // 标准标签快捷键；菜单也走同一操作入口。
  useEffect(() => {
    if (!isActive) return;
    const runTabAction = async (action: () => Promise<void>) => {
      if (tabActionPending.current) return;
      tabActionPending.current = true;
      try {
        await action();
      } catch (error) {
        notify(`标签操作失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      } finally {
        tabActionPending.current = false;
      }
    };
    const newTab = () => {
      void runTabAction(handleNewTab);
    };
    const closeTab = () => {
      void runTabAction(handleCloseTab);
    };
    const handler = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      // 弹窗打开时不操作它后面的目录或标签。
      if (document.querySelector('[aria-modal="true"], [data-testid="workspace-search"]')) return;
      const key = e.key.toLowerCase();
      if (!['t', 'w', 'p', 'f'].includes(key)) return;
      e.preventDefault();
      if (key === 't') newTab();
      else if (key === 'w') closeTab();
      else {
        void runTabAction(async () => {
          await switchToFileExplorer(panelDirectoryPath ?? useFileStore.getState()[side].path);
          if (key === 'p') {
            setShowFileSearch(false);
            setShowTabSearch((open) => !open);
          } else {
            setShowTabSearch(false);
            setShowFileSearch((open) => !open);
          }
        });
      }
    };
    window.addEventListener('keydown', handler);
    window.addEventListener('explore:new-tab', newTab);
    window.addEventListener('explore:close-tab', closeTab);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('explore:new-tab', newTab);
      window.removeEventListener('explore:close-tab', closeTab);
    };
  }, [isActive, side, panelDirectoryPath, handleNewTab, handleCloseTab, switchToFileExplorer, notify]);

  // 拖放处理
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!dropDirectoryPath) {
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      e.dataTransfer.dropEffect = getFileDropEffect(e);
    },
    [dropDirectoryPath],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      if (!dropDirectoryPath) {
        notify('目标面板没有打开文件夹', 'warn');
        return;
      }
      const data = e.dataTransfer.getData('application/x-explore-files');
      if (!data) return;
      let sources: string[];
      try {
        const payload: unknown = JSON.parse(data);
        if (!Array.isArray(payload) || !payload.every((path) => typeof path === 'string')) return;
        sources = payload;
      } catch {
        return;
      }
      if (sources.length === 0) return;

      const targetDir = dropDirectoryPath;

      // 同一目录忽略
      if (
        sources.every((s) => {
          const parent = s.replace(/[/\\][^/\\]*$/, '');
          return parent === targetDir || s === targetDir;
        })
      ) {
        notify('已经在同一目录中', 'info');
        return;
      }

      // 拖文件夹到自己子目录 → 阻止
      if (sources.some((s) => targetDir.startsWith(s + '\\') || targetDir.startsWith(s + '/'))) {
        notify('不能把文件夹复制到它自己里面', 'error');
        return;
      }

      const isMove = getFileDropEffect(e) === 'move';
      try {
        const conflictStrategy = await resolveCopyConflictStrategyWithChoice(
          sources,
          targetDir,
          (p) => ipc.invoke('file:readDir', { path: p }),
          (message, buttons) =>
            appDialog.choice({
              title: '同名冲突',
              message,
              buttons,
              defaultId: 'rename',
              cancelId: 'cancel',
            }),
        );
        if (!conflictStrategy) {
          notify('已取消', 'info');
          return;
        }

        const result = isMove
          ? await ipc.invoke('file:move', { sources, destDir: targetDir, conflictStrategy })
          : await ipc.invoke('file:copy', { sources, destDir: targetDir, conflictStrategy });
        const summary = summarizeFileOpResult(isMove ? 'Move' : 'Copy', result);
        if (summary) {
          notify(summary, getFileOpToastType(result));
        } else {
          notify(summarizeFileOpToast(isMove ? 'Move' : 'Copy', result), getFileOpToastType(result));
        }
      } catch (err: any) {
        notify(`操作失败：${err.message}`, 'error');
      }
      useFileStore.getState().refresh(side);
      const otherSide = side === 'left' ? 'right' : 'left';
      useFileStore.getState().refresh(otherSide);
    },
    [side, dropDirectoryPath, notify],
  );

  return (
    <div className="h-full flex flex-col" data-panel-side={side} onClick={onClick}>
      {/* Tab Bar + Panel Header — 统一背景 */}
      <div
        className={`flex-shrink-0 border-t ${isActive ? 'border-accent/40 bg-surface-lighter' : 'border-transparent bg-surface'}`}
      >
        <ErrorBoundary name={`TabBar-${side}`}>
          {showExplorerChrome ? (
            <TabBar
              side={side}
              keepEmpty={pluginId === 'viewer'}
              onTabClick={
                pluginId === 'viewer'
                  ? (tab) => {
                      switchToFileExplorer(tab.path);
                    }
                  : undefined
              }
            />
          ) : (
            <div className="h-8 flex items-center px-3 text-[11px] text-text-muted/50 select-none">
              {pluginId === 'fulltext-search' && '全文搜索'}
              {pluginId === 'viewer' && '文件预览'}
              {pluginId === 'bookmarks' && '收藏夹'}
            </div>
          )}
        </ErrorBoundary>

        {/* Panel Header — 地址栏区 */}
        <div className="h-8 flex items-center px-2 text-sm border-b border-border/30">
          {/* 地址栏 / 路径面包屑 */}
          {showExplorerChrome && panelDirectoryPath && (
            <AddressBar
              side={side}
              pathOverride={pluginId === 'viewer' ? panelDirectoryPath : undefined}
              onNavigate={pluginId === 'viewer' ? handleViewerChromeNavigate : undefined}
            />
          )}
          {!showExplorerChrome && panel.path && <PathBreadcrumb path={panel.path} />}
          {(!panel.path || (showExplorerChrome && !panelDirectoryPath)) && <span className="flex-1" />}

          {/* 工具栏 — 最右 */}
          <div className="flex items-center gap-1 flex-shrink-0 ml-auto">
            {pluginId !== 'file-explorer' && (
              <button
                className="text-text-muted hover:text-text-primary hover:bg-white/5 rounded p-0.5 cursor-pointer transition-colors"
                title={pluginId === 'viewer' ? '关闭预览' : '关闭面板'}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClosePluginPanel();
                }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              className="text-text-muted hover:text-text-primary hover:bg-white/5 rounded p-0.5 cursor-pointer transition-colors"
              title="打开文件夹 (Ctrl+O)"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenFolder();
              }}
            >
              <FolderOpen className="w-4 h-4" />
            </button>

            {isActive && <div className="active-dot" title="当前面板" />}
          </div>
        </div>
      </div>

      {/* Panel Content */}
      <div
        data-testid={`panel-content-${side}`}
        className="flex-1 overflow-hidden bg-surface relative"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {showFileSearch && pluginId === 'file-explorer' && (
          <FileSearch side={side} open={showFileSearch} onClose={() => setShowFileSearch(false)} />
        )}
        {showTabSearch && (
          <TabSearch side={side} open={showTabSearch} onClose={() => setShowTabSearch(false)} />
        )}
        <ErrorBoundary name={`Panel-${side}`} resetKey={`${pluginId}:${panel.panelId}:${panel.path ?? ''}`}>
          {renderPanel()}
        </ErrorBoundary>
        {!isActive && <div className="absolute inset-0 bg-black/10 pointer-events-none" />}
      </div>
    </div>
  );
}

// ── 路径面包屑（非文件管理器面板用，末段不截断） ──

const SEP_REGEX = /[/\\]/g;

function PathBreadcrumb({ path }: { path: string }) {
  return (
    <span
      className="flex-1 min-w-0 text-[11px] text-text-muted truncate select-text"
      style={{ direction: 'rtl', textAlign: 'left' }}
      title={path}
    >
      {path}
    </span>
  );
}
