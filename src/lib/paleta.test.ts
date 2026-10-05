import { describe, expect, it } from 'vitest';
import { contraste } from './contraste';
import { CLAVE_TEMA, COLOR_BARRA } from './tema';

// Sin @types/node en el proyecto: se lee el fuente con import.meta.glob ?raw
// (mismo patrón que catalogo.test.ts).
const fuente = Object.values(
  import.meta.glob<string>('../layouts/BaseLayout.astro', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
)[0];

function variables(bloque: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of bloque.matchAll(/--([\w-]+):\s*([^;]+);/g)) vars[m[1]] = m[2].trim();
  return vars;
}
function bloque(re: RegExp): string {
  const m = fuente.match(re);
  if (!m) throw new Error(`bloque no encontrado: ${re}`);
  return m[1];
}

const claro = variables(bloque(/:root\s*\{([^}]*)\}/));
const oscuroSistema = variables(
  bloque(
    /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-tema="claro"\]\)\s*\{([^}]*)\}/
  )
);
const oscuroForzado = variables(bloque(/:root\[data-tema="oscuro"\]\s*\{([^}]*)\}/));

const temas = { claro, oscuro: oscuroSistema } as const;

describe('paleta', () => {
  it('el oscuro del sistema y el oscuro forzado son idénticos', () => {
    expect(oscuroForzado).toEqual(oscuroSistema);
  });

  for (const [nombre, t] of Object.entries(temas)) {
    describe(`tema ${nombre}`, () => {
      const pares: [string, string][] = [
        ['text', 'bg'],
        ['text', 'surface'],
        ['muted', 'bg'],
        ['muted', 'surface'],
        ['error', 'bg'],
        ['error', 'surface'],
        ['player-1', 'bg'],
        ['player-1', 'surface'],
        ['player-2', 'bg'],
        ['player-2', 'surface'],
        ['on-accent', 'accent'],
        ['on-player', 'player-1'],
        ['on-player', 'player-2'],
      ];
      for (const [fg, bg] of pares) {
        it(`${fg} sobre ${bg} cumple AA (≥ 4.5:1)`, () => {
          expect(t[`color-${fg}`], `falta --color-${fg}`).toBeDefined();
          expect(t[`color-${bg}`], `falta --color-${bg}`).toBeDefined();
          expect(contraste(t[`color-${fg}`], t[`color-${bg}`])).toBeGreaterThanOrEqual(4.5);
        });
      }
    });
  }

  it('el script inline usa la clave de tema y los dos colores de COLOR_BARRA', () => {
    // Se aísla el texto del script: los colores también aparecen en las metas y
    // en :root, así que buscarlos en todo el archivo no detectaría un desajuste.
    const inline = fuente.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
    expect(inline, 'falta el <script is:inline> anti-destello').toBeDefined();
    expect(inline).toContain(`'${CLAVE_TEMA}'`);
    expect(inline).toContain(`'${COLOR_BARRA.claro}'`);
    expect(inline).toContain(`'${COLOR_BARRA.oscuro}'`);
  });

  it('las metas theme-color y el fondo de cada tema usan los colores de COLOR_BARRA', () => {
    expect(fuente).toContain(`content="${COLOR_BARRA.claro}" media="(prefers-color-scheme: light)"`);
    expect(fuente).toContain(`content="${COLOR_BARRA.oscuro}" media="(prefers-color-scheme: dark)"`);
    expect(claro['color-bg']).toBe(COLOR_BARRA.claro);
    expect(oscuroSistema['color-bg']).toBe(COLOR_BARRA.oscuro);
  });
});
