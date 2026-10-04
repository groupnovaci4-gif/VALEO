import { defineConfig } from 'vitest/config';

// Tests des règles de sécurité : nécessitent l'émulateur Firestore
// (lancés par `npm run test:rules`, qui démarre l'émulateur).
export default defineConfig({
  test: { include: ['tests/rules/**/*.test.ts'], environment: 'node', testTimeout: 20_000, hookTimeout: 30_000, fileParallelism: false },
});
