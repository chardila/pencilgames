import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPlayerNames, hasStoredPlayerNames, nombresColisionan, savePlayerNames } from './players';

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

describe('players', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, devuelve los nombres por defecto', () => {
    expect(getPlayerNames()).toEqual({ 1: 'Jugador 1', 2: 'Jugador 2' });
  });

  it('guarda y vuelve a leer los nombres, recortando espacios', () => {
    savePlayerNames({ 1: '  Ana  ', 2: 'Luis' });
    expect(getPlayerNames()).toEqual({ 1: 'Ana', 2: 'Luis' });
  });

  it('si un nombre queda vacío tras recortar espacios, usa el default de ese jugador', () => {
    savePlayerNames({ 1: '   ', 2: 'Luis' });
    expect(getPlayerNames()).toEqual({ 1: 'Jugador 1', 2: 'Luis' });
  });

  it('si el JSON guardado está corrupto, devuelve los defaults sin lanzar', () => {
    localStorage.setItem('pencilgames:jugadores', '{esto no es json');
    expect(() => getPlayerNames()).not.toThrow();
    expect(getPlayerNames()).toEqual({ 1: 'Jugador 1', 2: 'Jugador 2' });
  });

  it('savePlayerNames aplica trim y defaults sobre el valor crudo guardado', () => {
    savePlayerNames({ 1: '  Ana  ', 2: '   ' });
    expect(localStorage.getItem('pencilgames:jugadores')).toBe('{"1":"Ana","2":"Jugador 2"}');
  });

  it('hasStoredPlayerNames refleja si ya se guardó algo', () => {
    expect(hasStoredPlayerNames()).toBe(false);
    savePlayerNames({ 1: 'Ana', 2: 'Luis' });
    expect(hasStoredPlayerNames()).toBe(true);
  });
});

describe('nombresColisionan', () => {
  it('detecta nombres idénticos', () => {
    expect(nombresColisionan('Ana', 'Ana')).toBe(true);
  });

  it('no distingue mayúsculas ni espacios al borde', () => {
    expect(nombresColisionan('Ana', ' ana ')).toBe(true);
  });

  it('no colisiona si los nombres son distintos', () => {
    expect(nombresColisionan('Ana', 'Luis')).toBe(false);
  });

  it('no colisiona entre los dos defaults', () => {
    expect(nombresColisionan('Jugador 1', 'Jugador 2')).toBe(false);
  });
});
