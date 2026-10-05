import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_INSTALAR_VISTO,
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
