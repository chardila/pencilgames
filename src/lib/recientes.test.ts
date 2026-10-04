import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_RECIENTES,
  MAX_RECIENTES,
  obtenerRecientes,
  registrarReciente,
} from './recientes';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe('recientes', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado devuelve lista vacía', () => {
    expect(obtenerRecientes()).toEqual([]);
  });

  it('registra el más reciente primero', () => {
    registrarReciente('hex');
    registrarReciente('nim');
    expect(obtenerRecientes()).toEqual(['nim', 'hex']);
  });

  it('abrir de nuevo un juego lo sube al frente sin duplicarlo', () => {
    registrarReciente('hex');
    registrarReciente('nim');
    registrarReciente('hex');
    expect(obtenerRecientes()).toEqual(['hex', 'nim']);
  });

  it('guarda como máximo MAX_RECIENTES y descarta el más antiguo', () => {
    for (const s of ['a', 'b', 'c', 'd', 'e']) registrarReciente(s);
    expect(MAX_RECIENTES).toBe(4);
    expect(obtenerRecientes()).toEqual(['e', 'd', 'c', 'b']);
  });

  it('registrarReciente devuelve la lista nueva', () => {
    registrarReciente('hex');
    expect(registrarReciente('nim')).toEqual(['nim', 'hex']);
  });

  it('un slug vacío no se registra', () => {
    registrarReciente('hex');
    expect(registrarReciente('')).toEqual(['hex']);
    expect(obtenerRecientes()).toEqual(['hex']);
  });

  it('JSON corrupto cuenta como sin recientes y se puede volver a registrar', () => {
    storage.setItem(CLAVE_RECIENTES, '{no es json');
    expect(obtenerRecientes()).toEqual([]);
    expect(registrarReciente('hex')).toEqual(['hex']);
  });

  it('un valor guardado que no es array cuenta como sin recientes', () => {
    storage.setItem(CLAVE_RECIENTES, JSON.stringify({ hex: 1 }));
    expect(obtenerRecientes()).toEqual([]);
  });

  it('ignora elementos que no son cadenas, vacíos o repetidos, y recorta a MAX_RECIENTES', () => {
    storage.setItem(
      CLAVE_RECIENTES,
      JSON.stringify(['hex', 3, null, '', 'hex', 'nim', 'a', 'b', 'c'])
    );
    expect(obtenerRecientes()).toEqual(['hex', 'nim', 'a', 'b']);
  });

  it('si localStorage lanza, no rompe: lee [] y registrar devuelve la lista en memoria', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
    } as unknown as Storage);
    expect(obtenerRecientes()).toEqual([]);
    expect(registrarReciente('hex')).toEqual(['hex']);
  });
});
