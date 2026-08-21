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
    // Patrón `**/worker/**` (no solo `worker/**`) porque este repo también se
    // corre desde herramientas de worktree que anidan una copia completa del
    // checkout bajo `.claude/worktrees/<nombre>/` dentro del mismo árbol —
    // sin el `**/` inicial, ese `worker/` anidado no quedaba excluido y
    // `npm test` desde la raíz del checkout principal volvía a chocar con
    // `cloudflare:test` al recoger los tests del worktree anidado.
    exclude: ['**/node_modules/**', '**/worker/**'],
  },
});
