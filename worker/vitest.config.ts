import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.toml' },
      // ALLOWED_ORIGIN se define solo para el entorno de test, encima de
      // wrangler.toml (que la deja sin configurar a propósito: hasta que
      // se configure como var/secret en producción, el Worker real omite
      // la verificación de Origin). Fijarla acá permite probar el rechazo
      // por Origin sin tocar la config de despliegue.
      miniflare: {
        bindings: { ALLOWED_ORIGIN: 'https://ejemplo.test' },
      },
    }),
  ],
});
