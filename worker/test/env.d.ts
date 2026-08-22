import type { Env as WorkerEnv } from '../src/index';

// Desde @cloudflare/vitest-pool-workers@0.13+ (Vitest 4), `env` importado
// desde 'cloudflare:test' (o 'cloudflare:workers') está tipado como
// Cloudflare.Env — un namespace global, ya no la interfaz ProvidedEnv de
// 'cloudflare:test' que se aumentaba antes. Se aumenta acá para que `env`
// tenga el tipado correcto (ROOMS, TURN_KEY_ID, ALLOWED_ORIGIN, etc.) en
// los tests.
// El `import` de arriba convierte este archivo en módulo, así que la
// declaración de namespace necesita `declare global` para fusionarse con
// el namespace ambiental Cloudflare (si no, TypeScript crea un Cloudflare
// local a este módulo en vez de aumentar el global).
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
