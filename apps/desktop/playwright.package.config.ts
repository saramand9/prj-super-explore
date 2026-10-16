import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/package',
  testMatch: '**/*.smoke.ts',
  timeout: 30000,
  workers: 1,
  reporter: [['list']],
});
