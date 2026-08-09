import { defineConfig } from 'astro/config';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/** @type {import('astro').AstroIntegration} */
const swVersionStamp = {
  name: 'sw-version-stamp',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const swPath = fileURLToPath(new URL('sw.js', dir));
      const contents = await readFile(swPath, 'utf-8');
      await writeFile(swPath, contents.replace('__CACHE_VERSION__', String(Date.now())));
    },
  },
};

export default defineConfig({
  // TODO(carlos): reemplaza esta URL por tu subdominio real antes del primer
  // despliegue (Task 8). Necesaria para que el sitemap/PWA generen URLs absolutas correctas.
  site: 'https://juegos.tudominio.com',
  integrations: [swVersionStamp],
});
