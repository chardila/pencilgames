import { describe, expect, it } from 'vitest';

const archivos = import.meta.glob<string>('../**/*.astro', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Colores neutros que ya tienen variable en BaseLayout: usarlos fijos rompe el
// tema oscuro. (BaseLayout los define con 6 dígitos y no casa con estos patrones.)
const PROHIBIDOS = [/#ddd\b/i, /#b00020\b/i, /#666\b/, /#bbb\b/i];

// Blanco fijo como relleno o color de texto: sobre las fichas de jugador y las
// superficies cambia de fondo entre temas (usar --color-on-player o
// --color-surface). Los trazos blancos de resalte (`stroke`) son aceptables, y
// Chomp pinta sobre una tableta de chocolate que es oscura en ambos temas.
const BLANCO_FIJO = /(fill|color):\s*#fff(fff)?\b/i;
const SIN_BLANCO_FIJO_EXCLUIDOS = ['games/chomp/Board.astro'];

describe('colores neutros sin variable', () => {
  it('encuentra los componentes a revisar', () => {
    expect(Object.keys(archivos).length).toBeGreaterThan(30);
  });

  for (const [ruta, fuente] of Object.entries(archivos)) {
    // BaseLayout es quien define la paleta.
    if (ruta.endsWith('BaseLayout.astro')) continue;
    it(ruta.replace('../', 'src/'), () => {
      for (const patron of PROHIBIDOS) {
        expect(fuente, `${patron} fijo: usa una variable --color-*`).not.toMatch(patron);
      }
      if (!SIN_BLANCO_FIJO_EXCLUIDOS.some(e => ruta.endsWith(e))) {
        expect(
          fuente,
          'fill/color blanco fijo: usa --color-on-player o --color-surface'
        ).not.toMatch(BLANCO_FIJO);
      }
    });
  }
});
