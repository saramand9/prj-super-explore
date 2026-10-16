import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/installer',
  testMatch: '**/*.e2e.ts',
  timeout: 360000,
  workers: 1,
  reporter: [['list']],
});
