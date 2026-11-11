import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Les tests de bout en bout (e2e/) passent par Playwright, pas par Vitest.
    include: ['src/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: [
        'src/main/service.ts',
        'src/main/schema-modele.ts',
        'src/main/demonstration.ts',
        'src/renderer/src/messages.ts',
        'src/renderer/src/brouillon.ts',
      ],
      reporter: ['text', 'html'],
      thresholds: { lines: 100, functions: 100, branches: 95, statements: 100 },
    },
  },
});
