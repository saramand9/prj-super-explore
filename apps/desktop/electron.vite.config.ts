import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@explore/shared': resolve('../../packages/shared/src'),
      },
    },
    build: {
      rollupOptions: {
        external: ['@explore/shared'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@explore/shared': resolve('../../packages/shared/src'),
      },
    },
    build: {
      rollupOptions: {
        external: ['@explore/shared'],
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@explore/shared': resolve('../../packages/shared/src'),
      },
    },
    plugins: [react()],
    css: {
      postcss: resolve('postcss.config.js'),
    },
  },
});
