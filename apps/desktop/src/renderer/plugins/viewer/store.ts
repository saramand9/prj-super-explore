import { create } from 'zustand';
import { ipc } from '../../framework/bridge/ipc-client';

interface ViewerState {
  filePath: string | null;
  content: string;
  loading: boolean;
  error: string | null;
  loadFile: (path: string) => Promise<void>;
  clear: () => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
  filePath: null,
  content: '',
  loading: false,
  error: null,

  loadFile: async (path) => {
    set({ filePath: path, loading: true, error: null, content: '' });
    try {
      const result = await ipc.invoke('file:read', { path });
      set({ content: result.content, loading: false });
    } catch (err: any) {
      set({ error: err.message, loading: false });
    }
  },

  clear: () => set({ filePath: null, content: '', error: null }),
}));
