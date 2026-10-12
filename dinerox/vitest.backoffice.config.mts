import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Back-office : Cloud Functions `bo…` + règles + moteur de synchro de l'app, sur les
// émulateurs Auth, Firestore et Storage (lancés par `npm run test:backoffice`).
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/backoffice/**/*.test.ts'], environment: 'node', testTimeout: 60_000, hookTimeout: 60_000, fileParallelism: false,
    setupFiles: ['tests/backoffice/setup.ts'],
    // Clé de TEST (émulateurs seulement) ; la vraie clé vit dans Secret Manager.
    env: { BO_MFA_KEY: Buffer.alloc(32, 7).toString('base64') },
  },
});
