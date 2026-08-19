import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    // worker/ es un proyecto npm independiente con su propio vitest.config.ts
    // (pool @cloudflare/vitest-pool-workers, necesario para `cloudflare:test`).
    // Sin esta exclusión, el glob por defecto de este config también intenta
    // correr worker/test/*.test.ts con el pool de Node normal y falla en los
    // archivos que importan `cloudflare:test` (index.test.ts, room.test.ts).
    exclude: ['**/node_modules/**', 'worker/**'],
  },
});
