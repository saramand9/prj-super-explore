import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
  workers: 1,
  reporter: [['list']],
});
