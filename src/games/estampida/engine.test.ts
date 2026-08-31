import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  celdasQueCopian,
  hayMovimientoPosible,
  contar,
  playMove,
  TAMANO,
  FICHAS_POR_JUGADOR,
  type Cell,
  type Direccion,
  type EstampidaState,
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

// Coloca 5 fichas de cada jugador (alternando J1, J2) en las casillas dadas
// y devuelve el estado resultante (fase 'playing').
function correrSetup(celdas1: number[], celdas2: number[]): EstampidaState {
  let s = createInitialState();
  for (let k = 0; k < FICHAS_POR_JUGADOR; k++) {
    s = playMove(s, { tipo: 'colocar', celda: celdas1[k] });
    s = playMove(s, { tipo: 'colocar', celda: celdas2[k] });
  }
  return s;
}

describe('playMove — fase setup', () => {
  it('coloca la ficha del jugador en turno, incrementa su contador y alterna', () => {
    const s = playMove(createInitialState(), { tipo: 'colocar', celda: idx(2, 3) });
    expect(s.board[idx(2, 3)]).toBe(1);
    expect(s.colocadas).toEqual({ 1: 1, 2: 0 });
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('setup');
    expect(s.ultimasCopias).toEqual([idx(2, 3)]);
    expect(s.ultimaDireccion).toBeNull();
  });

  it('rechaza colocar sobre una casilla ocupada (misma referencia)', () => {
    const s1 = playMove(createInitialState(), { tipo: 'colocar', celda: 10 });
    expect(playMove(s1, { tipo: 'colocar', celda: 10 })).toBe(s1);
  });

  it('rechaza una estampida durante el setup (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'estampida', dir: 'arriba' })).toBe(s);
  });

  it('rechaza payload inválido (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'colocar', celda: 99 } as never)).toBe(s);
    expect(playMove(s, 5 as never)).toBe(s);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState();
    const boardRef = s.board;
    playMove(s, { tipo: 'colocar', celda: 0 });
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(s.colocadas).toEqual({ 1: 0, 2: 0 });
  });

  it('al completar 5+5 pasa a fase playing con el turno del jugador 1', () => {
    const s = correrSetup(
      [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4)],
      [idx(7, 0), idx(7, 1), idx(7, 2), idx(7, 3), idx(7, 4)],
    );
    expect(s.fase).toBe('playing');
    expect(s.currentPlayer).toBe(1);
    expect(s.colocadas).toEqual({ 1: 5, 2: 5 });
    expect(contar(s.board)).toEqual({ 1: 5, 2: 5 });
    // la última colocación (5.ª de J2) queda resaltada
    expect(s.ultimasCopias).toEqual([idx(7, 4)]);
  });

  it('la 9.ª colocación (J1) todavía es fase setup', () => {
    let s = createInitialState();
    const c1 = [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4)];
    const c2 = [idx(7, 0), idx(7, 1), idx(7, 2), idx(7, 3)];
    for (let k = 0; k < 4; k++) {
      s = playMove(s, { tipo: 'colocar', celda: c1[k] });
      s = playMove(s, { tipo: 'colocar', celda: c2[k] });
    }
    s = playMove(s, { tipo: 'colocar', celda: c1[4] }); // 9.ª ficha, J1
    expect(s.fase).toBe('setup');
    expect(s.currentPlayer).toBe(2);
    expect(s.colocadas).toEqual({ 1: 5, 2: 4 });
  });
});
