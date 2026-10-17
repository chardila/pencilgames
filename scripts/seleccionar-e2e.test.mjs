import { describe, expect, it } from 'vitest';
import { seleccionarSuites, slugsDeArchivos } from './seleccionar-e2e.mjs';

const TODAS = { todas: true, portada: false, juegos: [], remoto: false };
const NINGUNA = { todas: false, portada: false, juegos: [], remoto: false };

describe('seleccionarSuites', () => {
  const casos = [
    ['diff no calculable (null)', null, TODAS],
    ['lista vacía', [], TODAS],
    ['solo specs', ['docs/superpowers/specs/x.md'], NINGUNA],
    ['solo markdown de la raíz y specs', ['README.md', 'specs/a.md'], NINGUNA],
    [
      'un juego',
      ['src/games/hex/Board.astro'],
      { todas: false, portada: true, juegos: ['hex'], remoto: false },
    ],
    [
      'tests de un juego + md de otro (ordenados)',
      ['src/games/hex/engine.test.ts', 'src/content/juegos/nim.md'],
      { todas: false, portada: true, juegos: ['hex', 'nim'], remoto: false },
    ],
    [
      'archivo movido entre juegos',
      ['src/games/hex/Board.astro', 'src/games/nim/Board.astro'],
      { todas: false, portada: true, juegos: ['hex', 'nim'], remoto: false },
    ],
    ['núcleo: lib', ['src/lib/gameSession.ts'], TODAS],
    ['núcleo: lockfile', ['package-lock.json'], TODAS],
    ['núcleo: workflows', ['.github/workflows/ci.yml'], TODAS],
    ['núcleo: páginas', ['src/pages/index.astro'], TODAS],
    ['núcleo: scripts', ['scripts/seleccionar-e2e.mjs'], TODAS],
    ['núcleo: e2e', ['e2e/portada.spec.ts'], TODAS],
    ['núcleo gana a juego', ['src/lib/a.ts', 'src/games/hex/Board.astro'], TODAS],
    ['archivo desconocido', ['archivo-raro.xyz'], TODAS],
    ['desconocido junto a docs', ['README.md', 'archivo-raro.xyz'], TODAS],
    ['archivo suelto en src/games', ['src/games/suelto.ts'], TODAS],
    ['solo worker', ['worker/src/index.ts'], { ...NINGUNA, remoto: true }],
    [
      'worker + juego',
      ['worker/src/index.ts', 'src/games/hex/Board.astro'],
      { todas: false, portada: true, juegos: ['hex'], remoto: true },
    ],
    [
      'docs + juego ignora los docs',
      ['docs/a.md', 'src/games/hex/Board.astro'],
      { todas: false, portada: true, juegos: ['hex'], remoto: false },
    ],
    [
      'rutas con espacios y no ASCII',
      ['src/games/mi juego/ñ.astro'],
      { todas: false, portada: true, juegos: ['mi juego'], remoto: false },
    ],
  ];

  it.each(casos)('%s', (_nombre, archivos, esperado) => {
    expect(seleccionarSuites(archivos)).toEqual(esperado);
  });
});

describe('slugsDeArchivos', () => {
  it('extrae slugs únicos y ordenados de juegos y de su md del catálogo', () => {
    expect(
      slugsDeArchivos([
        'src/games/nim/Board.astro',
        'src/games/nim/engine.ts',
        'src/content/juegos/hex.md',
        'src/lib/x.ts',
      ]),
    ).toEqual(['hex', 'nim']);
  });
});
