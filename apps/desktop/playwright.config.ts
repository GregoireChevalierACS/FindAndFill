import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Une seule application Electron à la fois : lancées en parallèle, elles se disputent le binaire
  // (« spawn ETXTBSY » sous Linux), les dossiers temporaires et les boîtes de dialogue remplacées.
  workers: 1,
  fullyParallel: false,
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: process.env['CI'] === undefined ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: { trace: 'retain-on-failure' },
});
