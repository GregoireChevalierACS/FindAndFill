import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure' },
});
