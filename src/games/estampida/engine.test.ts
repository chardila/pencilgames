import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  celdasQueCopian,
  hayMovimientoPosible,
  contar,
  TAMANO,
  FICHAS_POR_JUGADOR,
  type Cell,
  type Direccion,
} from './engine';

// Helpers compartidos por todas las tasks.
const idx = (fila: number, col: number) => fila * TAMANO + col;
const tableroVacio = (): Cell[] => Array<Cell>(TAMANO * TAMANO).fill(null);

describe('createInitialState', () => {
  it('crea un tablero vacío de 64 casillas en fase setup, turno del jugador 1', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(64);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.fase).toBe('setup');
    expect(s.currentPlayer).toBe(1);
    expect(s.colocadas).toEqual({ 1: 0, 2: 0 });
    expect(s.winner).toBeNull();
    expect(s.ultimasCopias).toEqual([]);
    expect(s.ultimaDireccion).toBeNull();
  });

  it('FICHAS_POR_JUGADOR es 5 y TAMANO es 8', () => {
    expect(FICHAS_POR_JUGADOR).toBe(5);
    expect(TAMANO).toBe(8);
  });
});

describe('esJugadaValida', () => {
  it('acepta colocar con celda entera en [0, 64)', () => {
    expect(esJugadaValida({ tipo: 'colocar', celda: 0 })).toBe(true);
    expect(esJugadaValida({ tipo: 'colocar', celda: 63 })).toBe(true);
  });

  it('acepta estampida con cualquiera de las 4 direcciones', () => {
    for (const dir of ['arriba', 'abajo', 'izquierda', 'derecha']) {
      expect(esJugadaValida({ tipo: 'estampida', dir })).toBe(true);
    }
  });

  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar' })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: -1 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: 64 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: 1.5 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: '3' })).toBe(false);
    expect(esJugadaValida({ tipo: 'estampida' })).toBe(false);
    expect(esJugadaValida({ tipo: 'estampida', dir: 'diagonal' })).toBe(false);
    expect(esJugadaValida({ tipo: 'otro', celda: 3 })).toBe(false);
  });
});

describe('celdasQueCopian', () => {
  it('una ficha con la casilla derecha libre → esa casilla', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 1)]);
  });

  it('no hay envolvimiento de borde: ficha en la columna 7, dirección derecha → []', () => {
    const board = tableroVacio();
    board[idx(0, 7)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([]);
  });

  it('no hay envolvimiento de borde: ficha en la columna 0, dirección izquierda → []', () => {
    const board = tableroVacio();
    board[idx(3, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'izquierda')).toEqual([]);
  });

  it('una casilla ocupada por el rival bloquea la copia', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(0, 1)] = 2;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([]);
  });

  it('una casilla ocupada propia bloquea, pero la ficha de más allá sí copia (snapshot)', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(0, 1)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 2)]);
  });

  it('varias fichas copian simultáneamente en una dirección', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(2, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 1), idx(2, 1)]);
  });

  it('solo considera las fichas del jugador indicado', () => {
    const board = tableroVacio();
    board[idx(4, 4)] = 2;
    expect(celdasQueCopian(board, 1, 'abajo')).toEqual([]);
    expect(celdasQueCopian(board, 2, 'abajo')).toEqual([idx(5, 4)]);
  });
});

describe('hayMovimientoPosible', () => {
  it('una ficha suelta en el centro → true', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    expect(hayMovimientoPosible(board, 1)).toBe(true);
  });

  it('sin fichas del jugador → false', () => {
    expect(hayMovimientoPosible(tableroVacio(), 1)).toBe(false);
  });

  it('una ficha con las 4 casillas contiguas ocupadas → false', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    board[idx(2, 3)] = 2;
    board[idx(4, 3)] = 2;
    board[idx(3, 2)] = 2;
    board[idx(3, 4)] = 2;
    expect(hayMovimientoPosible(board, 1)).toBe(false);
  });
});

describe('contar', () => {
  it('cuenta las casillas de cada jugador', () => {
    const board = tableroVacio();
    board[0] = 1;
    board[1] = 1;
    board[2] = 2;
    expect(contar(board)).toEqual({ 1: 2, 2: 1 });
  });

  it('tablero vacío → { 1: 0, 2: 0 }', () => {
    expect(contar(tableroVacio())).toEqual({ 1: 0, 2: 0 });
  });
});
