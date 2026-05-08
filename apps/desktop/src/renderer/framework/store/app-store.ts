import { create } from 'zustand';

export const useAppStore = create<{
  showPluginManager: boolean;
  setShowPluginManager: (v: boolean) => void;
}>((set) => ({
  showPluginManager: false,
  setShowPluginManager: (v) => set({ showPluginManager: v }),
}));
