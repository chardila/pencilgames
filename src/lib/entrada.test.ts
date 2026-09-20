import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getModoGuardado,
  guardarModo,
  haVistoReglas,
  marcarReglasVistas,
  olvidarModo,
  olvidarReglasVistas,
} from './entrada';

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

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

describe('reglas vistas', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, no se han visto las reglas de ningún juego', () => {
    expect(haVistoReglas('gomoku')).toBe(false);
  });

  it('tras marcar un slug, haVistoReglas lo reconoce', () => {
    marcarReglasVistas('gomoku');
    expect(haVistoReglas('gomoku')).toBe(true);
    expect(haVistoReglas('hex')).toBe(false);
  });

  it('marcar el mismo slug dos veces no lo duplica', () => {
    marcarReglasVistas('gomoku');
    marcarReglasVistas('gomoku');
    expect(JSON.parse(localStorage.getItem('pencilgames:reglas-vistas')!)).toEqual(['gomoku']);
  });

  it('marcar varios slugs distintos los acumula', () => {
    marcarReglasVistas('gomoku');
    marcarReglasVistas('hex');
    expect(haVistoReglas('gomoku')).toBe(true);
    expect(haVistoReglas('hex')).toBe(true);
  });

  it('si el JSON guardado está corrupto, haVistoReglas devuelve false sin lanzar', () => {
    localStorage.setItem('pencilgames:reglas-vistas', '{esto no es json');
    expect(() => haVistoReglas('gomoku')).not.toThrow();
    expect(haVistoReglas('gomoku')).toBe(false);
  });

  it('si el JSON guardado no es un array, marcarReglasVistas lo reemplaza por uno válido', () => {
    localStorage.setItem('pencilgames:reglas-vistas', '{"no":"array"}');
    marcarReglasVistas('gomoku');
    expect(JSON.parse(localStorage.getItem('pencilgames:reglas-vistas')!)).toEqual(['gomoku']);
  });

  it('olvidarReglasVistas revierte una marca previa, dejando el resto intacto', () => {
    marcarReglasVistas('gomoku');
    marcarReglasVistas('hex');
    olvidarReglasVistas('gomoku');
    expect(haVistoReglas('gomoku')).toBe(false);
    expect(haVistoReglas('hex')).toBe(true);
  });

  it('olvidarReglasVistas sin nada guardado no lanza', () => {
    expect(() => olvidarReglasVistas('gomoku')).not.toThrow();
    expect(haVistoReglas('gomoku')).toBe(false);
  });

  it('olvidarReglasVistas con JSON corrupto no lanza', () => {
    localStorage.setItem('pencilgames:reglas-vistas', '{esto no es json');
    expect(() => olvidarReglasVistas('gomoku')).not.toThrow();
  });
});

describe('modo guardado', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, devuelve null', () => {
    expect(getModoGuardado()).toBeNull();
  });

  it('guarda y vuelve a leer el modo local', () => {
    guardarModo('local');
    expect(getModoGuardado()).toBe('local');
  });

  it('guarda y vuelve a leer el modo remoto', () => {
    guardarModo('remoto');
    expect(getModoGuardado()).toBe('remoto');
  });

  it('si el valor guardado no es un modo válido, devuelve null', () => {
    localStorage.setItem('pencilgames:modo', 'lo-que-sea');
    expect(getModoGuardado()).toBeNull();
  });

  it('olvidarModo revierte un modo guardado', () => {
    guardarModo('remoto');
    olvidarModo();
    expect(getModoGuardado()).toBeNull();
  });

  it('olvidarModo sin nada guardado no lanza', () => {
    expect(() => olvidarModo()).not.toThrow();
    expect(getModoGuardado()).toBeNull();
  });
});
