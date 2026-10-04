import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests des modules PURS (src/core) : aucune dépendance React Native.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['tests/**/*.test.ts'], exclude: ['tests/rules/**'], environment: 'node' },
});
