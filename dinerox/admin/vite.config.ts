import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/**
 * Portail back-office : paquet séparé de l'app mobile (aucune dépendance ajoutée à l'app).
 * Il lit directement deux modules PURS de l'app : la marque (src/config/brand.ts) et le
 * formatage des montants (src/core/money.ts), plus des données (catalogue, pays).
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@app': fileURLToPath(new URL('../src', import.meta.url)) } },
  server: { port: 5175, strictPort: true, fs: { allow: ['..'] } },
  preview: { port: 5176, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
