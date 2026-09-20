import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatearMarcador,
  limpiarMarcador,
  obtenerMarcador,
  registrarVictoria,
} from './marcador';

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

describe('marcador', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, devuelve 0 a 0', () => {
    expect(obtenerMarcador('gomoku')).toEqual({ 1: 0, 2: 0 });
  });

  it('registrarVictoria suma solo al ganador', () => {
    registrarVictoria('gomoku', 1);
    registrarVictoria('gomoku', 1);
    registrarVictoria('gomoku', 2);
    expect(obtenerMarcador('gomoku')).toEqual({ 1: 2, 2: 1 });
  });

  it('un empate (ganador null) no suma a nadie', () => {
    registrarVictoria('gomoku', 1);
    registrarVictoria('gomoku', null);
    expect(obtenerMarcador('gomoku')).toEqual({ 1: 1, 2: 0 });
  });

  it('el marcador es independiente por slug', () => {
    registrarVictoria('gomoku', 1);
    registrarVictoria('sos', 2);
    expect(obtenerMarcador('gomoku')).toEqual({ 1: 1, 2: 0 });
    expect(obtenerMarcador('sos')).toEqual({ 1: 0, 2: 1 });
  });

  it('limpiarMarcador vuelve a 0 a 0', () => {
    registrarVictoria('gomoku', 1);
    limpiarMarcador('gomoku');
    expect(obtenerMarcador('gomoku')).toEqual({ 1: 0, 2: 0 });
  });

  it('si el JSON guardado está corrupto, devuelve 0 a 0 sin lanzar', () => {
    localStorage.setItem('pencilgames:marcador:gomoku', '{esto no es json');
    expect(() => obtenerMarcador('gomoku')).not.toThrow();
    expect(obtenerMarcador('gomoku')).toEqual({ 1: 0, 2: 0 });
  });

  it('formatearMarcador arma "Nombre puntaje · Nombre puntaje"', () => {
    const marcador = { 1: 2, 2: 1 };
    expect(formatearMarcador(marcador, { 1: 'Carlos', 2: 'Simón' })).toBe(
      'Carlos 2 · Simón 1'
    );
  });
});
