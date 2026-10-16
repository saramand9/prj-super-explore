import { create } from 'zustand';
import { getIpcErrorMessage, ipc } from '../bridge/ipc-client';
import { themes } from '../themes';

let appearanceSaveQueue: Promise<boolean> = Promise.resolve(true);
let appearanceSaveVersion = 0;

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
  theme: string;
  preferencesLoaded: boolean;
  preferencesDirty: boolean;
  preferenceError: string | null;
  loadPreferences: () => Promise<void>;
  savePreferences: () => Promise<boolean>;
  setActivePanel: (id: 'left' | 'right') => void;
  setPanelPath: (side: 'left' | 'right', path: string | null) => void;
  setPanelPlugin: (side: 'left' | 'right', pluginId: string, panelId: string) => void;
  setMode: (mode: 'single' | 'dual') => void;
  setFontScale: (scale: number) => void;
  setTheme: (theme: string) => void;
}>((set, get) => ({
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
  fontScale: 130,
  theme: 'grafana',
  preferencesLoaded: false,
  preferencesDirty: false,
  preferenceError: null,

  loadPreferences: async () => {
    try {
      const appearance = await ipc.invoke('settings:getAppearance', undefined);
      set((state) => ({
        theme: Object.hasOwn(themes, appearance.theme) ? appearance.theme : 'grafana',
        fontScale: appearance.fontScale,
        layout: { ...state.layout, mode: appearance.layoutMode },
        preferencesLoaded: true,
        preferenceError: null,
      }));
    } catch (err) {
      set({ preferenceError: getIpcErrorMessage(err, '设置加载失败') });
    }
  },

  savePreferences: () => {
    const { theme, fontScale, layout } = get();
    const appearance = { theme, fontScale, layoutMode: layout.mode };
    const version = ++appearanceSaveVersion;
    appearanceSaveQueue = appearanceSaveQueue.then(async () => {
      try {
        await ipc.invoke('settings:saveAppearance', appearance);
        if (version === appearanceSaveVersion)
          set({ preferenceError: null, preferencesLoaded: true, preferencesDirty: false });
        return true;
      } catch (err) {
        set({ preferenceError: getIpcErrorMessage(err, '设置保存失败') });
        return false;
      }
    });
    return appearanceSaveQueue;
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

  setMode: (mode) => {
    set((s) => ({
      layout: { ...s.layout, mode, id: mode === 'single' ? 'left' : s.layout.id },
      preferencesDirty: true,
    }));
    void get().savePreferences();
  },

  setFontScale: (fontScale) => {
    if (!Number.isFinite(fontScale) || fontScale < 80 || fontScale > 250) return;
    set({ fontScale, preferencesDirty: true });
    void get().savePreferences();
  },
  setTheme: (theme) => {
    if (!Object.hasOwn(themes, theme)) return;
    set({ theme, preferencesDirty: true });
    void get().savePreferences();
  },
}));

export function useActivePanel() {
  const id = useLayoutStore((s) => s.layout.id);
  const set = useLayoutStore((s) => s.setActivePanel);
  return { activePanel: id, setActivePanel: set };
}
