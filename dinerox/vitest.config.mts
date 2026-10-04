import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Tests des modules PURS (src/core) et du moteur de synchro : aucune dépendance React Native.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/rules/**', 'node_modules/**'], environment: 'node' },
});
