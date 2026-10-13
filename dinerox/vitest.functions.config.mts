import { defineConfig } from 'vitest/config';

// Cloud Functions de bout en bout : émulateurs auth + firestore + functions
// (lancés par `npm run test:functions`, qui compile les fonctions avant).
export default defineConfig({
  test: { include: ['tests/functions/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false },
});
