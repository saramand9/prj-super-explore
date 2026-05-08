import { useState, useCallback, useEffect, useRef } from 'react';
import { useLayoutStore } from '../framework/layout';
import { useFileStore } from '../plugins/file-explorer/store';
import { useAppStore } from '../framework/store/app-store';
import { ipc } from '../framework/bridge/ipc-client';

interface MenuItem {
  label?: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!openMenu) return;
    const handler = () => setOpenMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [openMenu]);

  const activeSide = useCallback(() => {
    const side = useLayoutStore.getState().layout.id;
    return side === 'left' || side === 'right' ? side : 'left';
  }, []);

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        {
          label: 'Open Folder',
          shortcut: 'Ctrl+O',
          action: async () => {
            const side = activeSide();
            const state = useFileStore.getState()[side as 'left' | 'right'];
            const result = await ipc.invoke('dialog:openFolder', { defaultPath: state.path ?? undefined });
            if (result) {
              useFileStore.getState().addTab(side as 'left' | 'right', result);
              useFileStore.getState().navigateTo(side as 'left' | 'right', result, true);
              useLayoutStore.getState().setPanelPath(side as 'left' | 'right', result);
            }
          },
        },
        {
          label: 'New Folder',
          shortcut: 'F7',
          action: async () => {
            const side = activeSide();
            const state = useFileStore.getState()[side as 'left' | 'right'];
            if (!state.path) return;
            // TODO: Replace with inline prompt
            const name = ''; // FIXME
            if (name) {
              await ipc.invoke('file:mkdir', { parentPath: state.path, name });
              useFileStore.getState().refresh(side as 'left' | 'right');
            }
          },
        },
        { separator: true },
        {
          label: 'Exit',
          action: () => window.close(),
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Copy to other panel',
          shortcut: 'F5',
          action: async () => {
            const side = activeSide() as 'left' | 'right';
            const target = side === 'left' ? 'right' : 'left';
            const state = useFileStore.getState()[side];
            const targetPath = useLayoutStore.getState().layout[target].path;
            if (targetPath && state.selected.size > 0) {
              await ipc.invoke('file:copy', { sources: [...state.selected], destDir: targetPath });
              useFileStore.getState().clearSelection(side);
              useFileStore.getState().refresh(side);
            }
          },
        },
        {
          label: 'Move to other panel',
          shortcut: 'F6',
          action: async () => {
            const side = activeSide() as 'left' | 'right';
            const target = side === 'left' ? 'right' : 'left';
            const state = useFileStore.getState()[side];
            const targetPath = useLayoutStore.getState().layout[target].path;
            if (targetPath && state.selected.size > 0) {
              await ipc.invoke('file:move', { sources: [...state.selected], destDir: targetPath });
              useFileStore.getState().clearSelection(side);
              useFileStore.getState().refresh(side);
            }
          },
        },
        {
          label: 'Delete',
          shortcut: 'F8',
          action: async () => {
            const side = activeSide() as 'left' | 'right';
            const state = useFileStore.getState()[side];
            if (state.selected.size === 0) return;
            const names = [...state.selected].map((p) => p.split(/[/\\]/).pop()).join(', ');
            if (confirm(`Delete ${names}?`)) {
              await ipc.invoke('file:delete', { paths: [...state.selected] });
              useFileStore.getState().clearSelection(side);
              useFileStore.getState().refresh(side);
            }
          },
        },
        { separator: true },
        {
          label: 'Select All',
          shortcut: 'Ctrl+A',
          action: () => {
            const side = activeSide() as 'left' | 'right';
            useFileStore.getState().selectAll(side);
          },
        },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Toggle Hidden Files',
          shortcut: 'Ctrl+H',
          action: () => {
            const side = activeSide() as 'left' | 'right';
            useFileStore.getState().toggleHidden(side);
          },
        },
        {
          label: 'Refresh',
          shortcut: 'Ctrl+R',
          action: () => {
            const side = activeSide() as 'left' | 'right';
            useFileStore.getState().refresh(side);
          },
        },
        { separator: true },
        {
          label: 'Manage Plugins...',
          action: () => {
            useAppStore.getState().setShowPluginManager(true);
          },
        },
        { separator: true },
        {
          label: 'Focus Left Panel',
          shortcut: 'Left',
          action: () => useLayoutStore.getState().setActivePanel('left'),
        },
        {
          label: 'Focus Right Panel',
          shortcut: 'Right',
          action: () => useLayoutStore.getState().setActivePanel('right'),
        },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'About Explore',
          action: async () => {
            const version = await ipc.invoke('app:getVersion', undefined);
            alert(`Explore v${version}\nDual-pane file manager`);
          },
        },
      ],
    },
  ];

  return (
    <div ref={menuRef} className="flex items-center h-7 bg-surface-light border-b border-border px-1 flex-shrink-0 select-none">
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            className={`px-2 py-0.5 text-xs rounded transition-colors ${
              openMenu === menu.label
                ? 'bg-accent/20 text-accent'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-lighter'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenu(openMenu === menu.label ? null : menu.label);
            }}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <div className="absolute left-0 top-full mt-0.5 z-50 bg-surface-light border border-border rounded shadow-lg py-1 min-w-[200px] text-xs">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={`sep-${i}`} className="border-t border-border/50 my-0.5" />
                ) : (
                  <button
                    key={item.label}
                    className="w-full text-left px-3 py-1 flex items-center justify-between hover:bg-accent/20 text-text-secondary hover:text-text-primary"
                    onClick={() => {
                      item.action?.();
                      setOpenMenu(null);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-text-muted text-[10px] ml-4">{item.shortcut}</span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
      <span className="flex-1" />
      <LayoutModeToggle />
    </div>
  );
}

function LayoutModeToggle() {
  const mode = useLayoutStore((s) => s.layout.mode);
  const setMode = useLayoutStore((s) => s.setMode);

  return (
    <button
      className="px-1.5 py-0.5 text-base rounded text-text-secondary hover:text-text-primary hover:bg-surface-lighter transition-colors"
      title={mode === 'dual' ? 'Switch to single panel' : 'Switch to dual panel'}
      onClick={() => setMode(mode === 'dual' ? 'single' : 'dual')}
    >
      {mode === 'dual' ? '◫' : '▣'}
    </button>
  );
}
