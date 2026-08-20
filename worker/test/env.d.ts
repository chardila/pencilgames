import type { Env } from '../src/index';

// Aumenta ProvidedEnv (declarada como interfaz vacía por
// @cloudflare/vitest-pool-workers) con nuestro Env real, para que `env`
// importado desde 'cloudflare:test' tenga el tipado correcto (ROOMS,
// TURN_KEY_ID, ALLOWED_ORIGIN, etc.) en los tests.
declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
