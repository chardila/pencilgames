import { describe, expect, it } from 'vitest';

const archivos = import.meta.glob<string>('../**/*.astro', {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Colores neutros que ya tienen variable en BaseLayout: usarlos fijos rompe el
// tema oscuro. (BaseLayout los define con 6 dígitos y no casa con estos patrones.)
const PROHIBIDOS = [/#ddd\b/i, /#b00020\b/i, /#666\b/, /#bbb\b/i];

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
    });
  }
});
