import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMiNombre, setMiNombre } from './miNombre';

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
});
