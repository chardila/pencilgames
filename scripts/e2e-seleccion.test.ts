import { afterEach, describe, expect, it } from 'vitest';
import { slugsDelCatalogo } from '../e2e/catalogo';
import { slugsActivos, suiteActiva } from '../e2e/seleccion';

afterEach(() => {
  delete process.env.E2E_SUITES;
  delete process.env.E2E_SLUGS;
});

describe('slugsActivos', () => {
  it('sin E2E_SLUGS devuelve todo el catálogo', () => {
    expect(slugsActivos()).toEqual(slugsDelCatalogo());
  });

  it('ignora slugs que no están en el catálogo (juego borrado)', () => {
    process.env.E2E_SLUGS = 'hex,juego-borrado';
    expect(slugsActivos()).toEqual(['hex']);
  });

  it('solo slugs borrados deja la lista vacía, no todo el catálogo', () => {
    process.env.E2E_SLUGS = 'juego-borrado';
    expect(slugsActivos()).toEqual([]);
  });
});

describe('suiteActiva', () => {
  it('vacío o «todas» activa todo', () => {
    expect(suiteActiva('portada')).toBe(true);
    process.env.E2E_SUITES = 'todas';
    expect(suiteActiva('juegos')).toBe(true);
  });

  it('solo las nombradas', () => {
    process.env.E2E_SUITES = 'portada,juegos';
    expect(suiteActiva('portada')).toBe(true);
    expect(suiteActiva('remoto')).toBe(false);
  });
});
