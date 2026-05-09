import { create } from 'zustand';

export interface PanelState {
  id: string | null; // 当前活跃面板 'left' | 'right'
  mode: 'single' | 'dual';
  left: {
    path: string | null;
    pluginId: string;
    panelId: string;
  };
  right: {
    path: string | null;
    pluginId: string;
    panelId: string;
  };
}

export const useLayoutStore = create<{
  layout: PanelState;
  fontScale: number;
  setActivePanel: (id: 'left' | 'right') => void;
  setPanelPath: (side: 'left' | 'right', path: string) => void;
  setPanelPlugin: (side: 'left' | 'right', pluginId: string, panelId: string) => void;
  setMode: (mode: 'single' | 'dual') => void;
  setFontScale: (scale: number) => void;
}>((set) => ({
  layout: {
    id: 'left',
    mode: 'dual',
    left: {
      path: null,
      pluginId: 'file-explorer',
      panelId: 'browser',
    },
    right: {
      path: null,
      pluginId: 'file-explorer',
      panelId: 'browser',
    },
  },
  fontScale: 160,

  setActivePanel: (id) => set((s) => ({ layout: { ...s.layout, id } })),

  setPanelPath: (side, path) =>
    set((s) => ({
      layout: { ...s.layout, [side]: { ...s.layout[side], path } },
    })),

  setPanelPlugin: (side, pluginId, panelId) =>
    set((s) => ({
      layout: { ...s.layout, [side]: { ...s.layout[side], pluginId, panelId } },
    })),

  setMode: (mode) =>
    set((s) => ({
      layout: { ...s.layout, mode, id: mode === 'single' ? 'left' : s.layout.id },
    })),

  setFontScale: (fontScale) => set({ fontScale }),
}));

export function useActivePanel() {
  const id = useLayoutStore((s) => s.layout.id);
  const set = useLayoutStore((s) => s.setActivePanel);
  return { activePanel: id, setActivePanel: set };
}
