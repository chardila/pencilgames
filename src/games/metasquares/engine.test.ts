import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  movimientosLegales,
  TODOS_LOS_CUADRADOS,
  TAMANO,
  OBJETIVO,
  type MetaSquaresState,
} from './engine';

describe('metasquares engine - geometría', () => {
  it('la retícula 7x7 tiene exactamente 196 cuadrados posibles', () => {
    // Σ_{k=1}^{6} k·(7-k)² = 36+50+48+36+20+6 = 196
    expect(TODOS_LOS_CUADRADOS).toHaveLength(196);
  });

  it('cada cuadrado tiene 4 esquinas distintas, en rango y ordenadas asc', () => {
    for (const sq of TODOS_LOS_CUADRADOS) {
      expect(sq.corners).toHaveLength(4);
      const set = new Set(sq.corners);
      expect(set.size).toBe(4);
      for (const c of sq.corners) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(TAMANO * TAMANO);
      }
      const ordenadas = [...sq.corners].sort((a, b) => a - b);
      expect(sq.corners).toEqual(ordenadas);
    }
  });

  it('no hay dos cuadrados con el mismo conjunto de esquinas', () => {
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(new Set(claves).size).toBe(TODOS_LOS_CUADRADOS.length);
  });

  it('incluye el cuadrado axis-aligned 1x1 de la esquina (0,0)', () => {
    // celdas 0,1,7,8 → ordenadas [0,1,7,8]
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(claves).toContain('0,1,7,8');
  });

  it('incluye un cuadrado inclinado (vector de borde (1,2))', () => {
    // ancla (2,0): (2,0),(3,2),(1,3),(0,1) → celdas 2,17,22,7 → [2,7,17,22]
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(claves).toContain('2,7,17,22');
  });
});

describe('metasquares engine - estado inicial', () => {
  it('empieza vacío, turno del jugador 1, marcador 0-0', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(49);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.scores).toEqual({ 1: 0, 2: 0 });
    expect(s.claimed).toEqual([]);
    expect(s.lastMove).toBeNull();
    expect(s.status).toEqual({ kind: 'playing' });
    expect(OBJETIVO).toBe(5);
  });

  it('movimientosLegales devuelve las 49 celdas al empezar', () => {
    expect(movimientosLegales(createInitialState())).toHaveLength(49);
  });

  it('esJugadaValida acepta { celda: 0..48 } y rechaza el resto', () => {
    expect(esJugadaValida({ celda: 0 })).toBe(true);
    expect(esJugadaValida({ celda: 48 })).toBe(true);
    expect(esJugadaValida({ celda: 49 })).toBe(false);
    expect(esJugadaValida({ celda: -1 })).toBe(false);
    expect(esJugadaValida({ celda: 1.5 })).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({ cell: 3 })).toBe(false);
  });
});
