import { create } from 'zustand';

export interface PanelState {
  id: string | null; // 当前活跃面板 'left' | 'right'
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
  setActivePanel: (id: 'left' | 'right') => void;
  setPanelPath: (side: 'left' | 'right', path: string) => void;
  setPanelPlugin: (side: 'left' | 'right', pluginId: string, panelId: string) => void;
}>((set) => ({
  layout: {
    id: 'left',
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

  setActivePanel: (id) => set((s) => ({ layout: { ...s.layout, id } })),

  setPanelPath: (side, path) =>
    set((s) => ({
      layout: { ...s.layout, [side]: { ...s.layout[side], path } },
    })),

  setPanelPlugin: (side, pluginId, panelId) =>
    set((s) => ({
      layout: { ...s.layout, [side]: { ...s.layout[side], pluginId, panelId } },
    })),
}));

export function useActivePanel() {
  const id = useLayoutStore((s) => s.layout.id);
  const set = useLayoutStore((s) => s.setActivePanel);
  return { activePanel: id, setActivePanel: set };
}
