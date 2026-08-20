import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
        // Requerido por WebSocket + Durable Objects: la Tarea 4 prueba `Room`
        // conectándose directamente al Durable Object dos veces en el mismo
        // test (crear + unirse), y el aislamiento de storage por test de
        // @cloudflare/vitest-pool-workers no soporta WebSockets con Durable
        // Objects (limitación documentada, ver
        // https://developers.cloudflare.com/workers/testing/vitest-integration/known-issues/#isolated-storage
        // — "Using WebSockets with Durable Objects is not supported with
        // per-file storage isolation"). Sin esto, cada test de Room falla al
        // cerrar con "Isolated storage failed... unable to pop Durable
        // Objects storage". `singleWorker` va junto porque `isolatedStorage`
        // por sí solo (sin correr todo en un único worker) hace que workerd
        // falle al arrancar ("inserted row already exists in table") cuando
        // hay clases de Durable Object respaldadas por SQLite.
        isolatedStorage: false,
        singleWorker: true,
        // ALLOWED_ORIGIN se define solo para el entorno de test, encima de
        // wrangler.toml (que la deja sin configurar a propósito: hasta que
        // se configure como var/secret en producción, el Worker real omite
        // la verificación de Origin). Fijarla acá permite probar el rechazo
        // por Origin sin tocar la config de despliegue.
        miniflare: {
          bindings: { ALLOWED_ORIGIN: 'https://ejemplo.test' },
        },
      },
    },
  },
});
