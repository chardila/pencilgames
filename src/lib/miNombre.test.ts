import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMiNombre, setMiNombre } from './miNombre';
import { savePlayerNames } from './players';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe('miNombre', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, devuelve null', () => {
    expect(getMiNombre()).toBeNull();
  });

  it('guarda y vuelve a leer el nombre, recortando espacios', () => {
    setMiNombre('  Ana  ');
    expect(getMiNombre()).toBe('Ana');
  });

  it('no guarda un nombre vacío tras recortar espacios', () => {
    setMiNombre('   ');
    expect(getMiNombre()).toBeNull();
  });

  it('sin mi-nombre guardado, recurre al nombre del Jugador 1 de players.ts si fue personalizado', () => {
    savePlayerNames({ 1: 'Ana', 2: 'Jugador 2' });
    expect(getMiNombre()).toBe('Ana');
  });

  it('sin mi-nombre guardado, NO recurre a players.ts si el Jugador 1 sigue en el valor por defecto', () => {
    savePlayerNames({ 1: 'Jugador 1', 2: 'Jugador 2' });
    expect(getMiNombre()).toBeNull();
  });

  it('sin mi-nombre guardado y sin players.ts guardado tampoco, devuelve null', () => {
    expect(getMiNombre()).toBeNull();
  });

  it('mi-nombre explícito tiene prioridad sobre el nombre de players.ts', () => {
    savePlayerNames({ 1: 'Ana', 2: 'Jugador 2' });
    setMiNombre('Beto');
    expect(getMiNombre()).toBe('Beto');
  });
});
