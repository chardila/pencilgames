// Decide qué suites e2e correr según los archivos cambiados (spec e2e).
// Criterio conservador: ante la duda, todas. La lógica es pura; el CLI solo
// lee el diff de git y escribe las salidas para GitHub Actions.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PREFIJOS_NUCLEO = [
  'src/lib/',
  'src/components/',
  'src/layouts/',
  'src/pages/',
  'public/',
  '.github/',
  'scripts/',
  'e2e/',
];
const ARCHIVOS_NUCLEO = new Set([
  'src/content.config.ts',
  'package.json',
  'package-lock.json',
  'astro.config.mjs',
  'tsconfig.json',
  '.node-version',
  'playwright.config.ts',
  'vitest.config.ts',
]);
const PREFIJOS_DOCS = ['docs/', 'specs/', 'abstract-games-by-category/'];

/** @returns {{tipo: 'docs'|'nucleo'|'worker'|'desconocido'} | {tipo: 'juego', slug: string}} */
function clasificar(ruta) {
  const juego = /^src\/games\/([^/]+)\/./.exec(ruta) ?? /^src\/content\/juegos\/([^/]+)\.md$/.exec(ruta);
  if (juego) return { tipo: 'juego', slug: juego[1] };
  if (ARCHIVOS_NUCLEO.has(ruta) || PREFIJOS_NUCLEO.some(p => ruta.startsWith(p))) {
    return { tipo: 'nucleo' };
  }
  if (ruta.startsWith('worker/')) return { tipo: 'worker' };
  if (PREFIJOS_DOCS.some(p => ruta.startsWith(p)) || (!ruta.includes('/') && ruta.endsWith('.md'))) {
    return { tipo: 'docs' };
  }
  return { tipo: 'desconocido' };
}

/** Slugs únicos y ordenados de los juegos tocados. */
export function slugsDeArchivos(archivos) {
  const slugs = archivos.map(clasificar).filter(c => c.tipo === 'juego').map(c => c.slug);
  return [...new Set(slugs)].sort();
}

/**
 * @param {string[] | null} archivos `null` = diff no calculable
 * @param {string[]} [catalogo] slugs del catálogo. Si se pasa y algún juego tocado
 *   no figura en él (p. ej. el directorio `src/games/y` es el slug `juego-y`), no
 *   se puede saber qué probar: todas.
 * @returns {{todas: boolean, portada: boolean, juegos: string[], remoto: boolean}}
 */
export function seleccionarSuites(archivos, catalogo) {
  const todas = { todas: true, portada: false, juegos: [], remoto: false };
  if (archivos === null || archivos.length === 0) return todas;

  const tipos = archivos.map(clasificar).map(c => c.tipo);
  if (tipos.includes('desconocido') || tipos.includes('nucleo')) return todas;

  const juegos = slugsDeArchivos(archivos);
  if (catalogo && juegos.some(slug => !catalogo.includes(slug))) return todas;
  return {
    todas: false,
    portada: juegos.length > 0,
    juegos,
    remoto: tipos.includes('worker'),
  };
}

function archivosCambiados(base) {
  if (!base || /^0+$/.test(base)) return null;
  try {
    const salida = execFileSync('git', ['diff', '--name-only', '--no-renames', '-z', `${base}...HEAD`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return salida.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function slugsDelCatalogo() {
  return readdirSync('src/content/juegos')
    .filter(nombre => nombre.endsWith('.md'))
    .map(nombre => nombre.slice(0, -'.md'.length));
}

function main() {
  const i = process.argv.indexOf('--base');
  const seleccion = seleccionarSuites(
    archivosCambiados(i === -1 ? '' : process.argv[i + 1]),
    slugsDelCatalogo(),
  );

  const suites = seleccion.todas
    ? 'todas'
    : [seleccion.portada && 'portada', seleccion.juegos.length > 0 && 'juegos', seleccion.remoto && 'remoto']
        .filter(Boolean)
        .join(',');
  const slugs = seleccion.todas ? '' : seleccion.juegos.join(',');

  console.log(JSON.stringify(seleccion));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `suites=${suites}\nslugs=${slugs}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
