import { describe, expect, it } from 'vitest';
import { COLOR_BARRA } from './tema';

// Sin @types/node: se lee con import.meta.glob ?raw (patrón de catalogo.test.ts).
const crudo = Object.values(
  import.meta.glob<string>('../../public/manifest.webmanifest', {
    query: '?raw',
    import: 'default',
    eager: true,
  })
)[0];
const manifiesto = JSON.parse(crudo);

describe('manifest.webmanifest', () => {
  it('no fija la orientación (los juegos funcionan en las dos)', () => {
    expect(manifiesto.orientation).toBe('any');
  });
  it('conserva display standalone y los iconos 192/512', () => {
    expect(manifiesto.display).toBe('standalone');
    expect(manifiesto.icons.map((i: { sizes: string }) => i.sizes)).toEqual([
      '192x192',
      '512x512',
    ]);
  });
  it('theme_color y background_color son el crema del tema claro', () => {
    expect(manifiesto.theme_color).toBe(COLOR_BARRA.claro);
    expect(manifiesto.background_color).toBe(COLOR_BARRA.claro);
  });
});
