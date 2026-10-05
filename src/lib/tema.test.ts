import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_TEMA,
  COLOR_BARRA,
  aplicarTema,
  guardarTema,
  obtenerTema,
  siguienteTema,
  type MetaColor,
} from './tema';

function stubStorage(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
    removeItem: (k: string) => void datos.delete(k),
  });
  return datos;
}

afterEach(() => vi.unstubAllGlobals());

describe('obtenerTema', () => {
  it('sin valor guardado es auto', () => {
    stubStorage();
    expect(obtenerTema()).toBe('auto');
  });
  it('devuelve claro y oscuro guardados', () => {
    stubStorage({ [CLAVE_TEMA]: 'oscuro' });
    expect(obtenerTema()).toBe('oscuro');
    stubStorage({ [CLAVE_TEMA]: 'claro' });
    expect(obtenerTema()).toBe('claro');
  });
  it('un valor corrupto cae a auto', () => {
    stubStorage({ [CLAVE_TEMA]: 'violeta' });
    expect(obtenerTema()).toBe('auto');
  });
  it('si localStorage lanza, es auto', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(obtenerTema()).toBe('auto');
  });
});

describe('guardarTema', () => {
  it('guarda claro/oscuro y borra la clave en auto', () => {
    const datos = stubStorage();
    guardarTema('oscuro');
    expect(datos.get(CLAVE_TEMA)).toBe('oscuro');
    guardarTema('auto');
    expect(datos.has(CLAVE_TEMA)).toBe(false);
  });
  it('no lanza si localStorage falla', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('cuota');
      },
      removeItem: () => {
        throw new Error('cuota');
      },
    });
    expect(() => guardarTema('claro')).not.toThrow();
    expect(() => guardarTema('auto')).not.toThrow();
  });
});

describe('siguienteTema', () => {
  it('cicla auto → claro → oscuro → auto', () => {
    expect(siguienteTema('auto')).toBe('claro');
    expect(siguienteTema('claro')).toBe('oscuro');
    expect(siguienteTema('oscuro')).toBe('auto');
  });
});

describe('aplicarTema', () => {
  function raizFalsa() {
    const attrs = new Map<string, string>();
    return {
      attrs,
      setAttribute: (n: string, v: string) => void attrs.set(n, v),
      removeAttribute: (n: string) => void attrs.delete(n),
    };
  }
  const metas = (): MetaColor[] => [
    { content: COLOR_BARRA.claro, dataset: { esquema: 'claro' } },
    { content: COLOR_BARRA.oscuro, dataset: { esquema: 'oscuro' } },
  ];

  it('claro/oscuro fijan data-tema y fuerzan el theme-color en ambas metas', () => {
    const raiz = raizFalsa();
    const m = metas();
    aplicarTema('oscuro', raiz, m);
    expect(raiz.attrs.get('data-tema')).toBe('oscuro');
    expect(m.map(x => x.content)).toEqual([COLOR_BARRA.oscuro, COLOR_BARRA.oscuro]);
    aplicarTema('claro', raiz, m);
    expect(raiz.attrs.get('data-tema')).toBe('claro');
    expect(m.map(x => x.content)).toEqual([COLOR_BARRA.claro, COLOR_BARRA.claro]);
  });
  it('auto quita data-tema y restaura el color propio de cada meta', () => {
    const raiz = raizFalsa();
    const m = metas();
    aplicarTema('oscuro', raiz, m);
    aplicarTema('auto', raiz, m);
    expect(raiz.attrs.has('data-tema')).toBe(false);
    expect(m.map(x => x.content)).toEqual([COLOR_BARRA.claro, COLOR_BARRA.oscuro]);
  });
});
