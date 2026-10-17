import { readdirSync } from 'node:fs';

const DIR_JUEGOS = new URL('../src/content/juegos/', import.meta.url);

/** Slugs de los juegos del catálogo: la misma fuente que usa el sitio. */
export function slugsDelCatalogo(): string[] {
  return readdirSync(DIR_JUEGOS)
    .filter(nombre => nombre.endsWith('.md'))
    .map(nombre => nombre.slice(0, -'.md'.length))
    .sort();
}
