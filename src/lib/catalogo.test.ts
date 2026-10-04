import { describe, expect, it } from 'vitest';
import {
  DURACIONES,
  DURACION_INFO,
  EDADES,
  TIPOS,
  TIPO_INFO,
  textoEdad,
} from './catalogo';

const archivos = import.meta.glob<string>('../content/juegos/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

function campo(texto: string, nombre: string): string | undefined {
  const frontmatter = texto.split('---')[1] ?? '';
  return frontmatter.match(new RegExp(`^${nombre}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'))?.[1];
}

const juegos = Object.entries(archivos).map(([ruta, texto]) => ({
  slug: ruta.replace(/^.*\//, '').replace(/\.md$/, ''),
  texto,
}));

describe('catalogo', () => {
  it('cada duración y tipo tiene icono y texto', () => {
    for (const d of DURACIONES) {
      expect(DURACION_INFO[d].icono).not.toBe('');
      expect(DURACION_INFO[d].texto).not.toBe('');
    }
    for (const t of TIPOS) {
      expect(TIPO_INFO[t].icono).not.toBe('');
      expect(TIPO_INFO[t].texto).not.toBe('');
    }
  });

  it('textoEdad formatea la edad mínima', () => {
    expect(textoEdad(5)).toBe('5+ años');
    expect(textoEdad(9)).toBe('9+ años');
  });

  it('hay 21 juegos', () => {
    expect(juegos).toHaveLength(21);
  });

  it.each(juegos)('$slug declara duracion, edad y tipo válidos', ({ texto }) => {
    expect(DURACIONES as readonly string[]).toContain(campo(texto, 'duracion'));
    expect(EDADES.map(String)).toContain(campo(texto, 'edad'));
    expect(TIPOS as readonly string[]).toContain(campo(texto, 'tipo'));
  });

  it('cada duración y cada tipo lo usa al menos un juego (los filtros nunca nacen vacíos)', () => {
    for (const d of DURACIONES) {
      expect(juegos.some(j => campo(j.texto, 'duracion') === d)).toBe(true);
    }
    for (const t of TIPOS) {
      expect(juegos.some(j => campo(j.texto, 'tipo') === t)).toBe(true);
    }
  });
});
