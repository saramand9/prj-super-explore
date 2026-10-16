import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@explore/shared'] })],
    resolve: {
      alias: {
        '@explore/shared': resolve('../../packages/shared/src'),
      },
    },
    build: {
      rollupOptions: {
        external: [],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@explore/shared'] })],
    resolve: {
      alias: {
        '@explore/shared': resolve('../../packages/shared/src'),
      },
    },
    build: {
      rollupOptions: {
        external: [],
        output: { format: 'cjs', entryFileNames: 'index.cjs' },
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
    plugins: [
      react(),
      {
        name: 'development-csp',
        apply: 'serve',
        transformIndexHtml: (html) =>
          html
            .replace("script-src 'self' blob:", "script-src 'self' blob: 'unsafe-inline'")
            .replace("connect-src 'none'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*"),
      },
    ],
    css: {
      postcss: resolve('postcss.config.js'),
    },
  },
});
