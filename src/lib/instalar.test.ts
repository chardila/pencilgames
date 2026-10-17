import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_INSTALAR_VISTO,
  ayudaManual,
  debeMostrarAviso,
  instalarVisto,
  marcarInstalarVisto,
} from './instalar';

afterEach(() => vi.unstubAllGlobals());

function stubStorage(inicial: Record<string, string> = {}) {
  const datos = new Map(Object.entries(inicial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => void datos.set(k, v),
  });
  return datos;
}

describe('instalarVisto / marcarInstalarVisto', () => {
  it('al principio no está visto; tras marcar, sí', () => {
    stubStorage();
    expect(instalarVisto()).toBe(false);
    marcarInstalarVisto();
    expect(instalarVisto()).toBe(true);
  });
  it('si localStorage lanza al leer cuenta como visto (no insistir)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqueado');
      },
    });
    expect(instalarVisto()).toBe(true);
  });
  it('marcar no lanza si falla el guardado', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('cuota');
      },
    });
    expect(() => marcarInstalarVisto()).not.toThrow();
  });
  it('usa la clave documentada', () => {
    const datos = stubStorage();
    marcarInstalarVisto();
    expect(datos.get(CLAVE_INSTALAR_VISTO)).toBe('1');
  });
});

describe('debeMostrarAviso', () => {
  it('solo si no se vio y no está instalada', () => {
    expect(debeMostrarAviso({ visto: false, standalone: false })).toBe(true);
    expect(debeMostrarAviso({ visto: true, standalone: false })).toBe(false);
    expect(debeMostrarAviso({ visto: false, standalone: true })).toBe(false);
  });
});

describe('ayudaManual', () => {
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
  const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0';

  it('en iPhone indica el botón Compartir', () => {
    expect(ayudaManual({ userAgent: IPHONE, puntosTactiles: 5 })).toMatch(/Compartir/);
  });
  it('un iPad que se anuncia como Mac también', () => {
    expect(ayudaManual({ userAgent: MAC, puntosTactiles: 5 })).toMatch(/Compartir/);
  });
  it('un Mac de escritorio y otros navegadores reciben la ayuda genérica', () => {
    expect(ayudaManual({ userAgent: MAC, puntosTactiles: 0 })).toMatch(/menú del navegador/);
    expect(ayudaManual({ userAgent: FIREFOX, puntosTactiles: 0 })).toMatch(/menú del navegador/);
  });
});
