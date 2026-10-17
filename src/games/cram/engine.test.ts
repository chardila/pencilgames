import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  dominosLegalesEn,
  playMove,
  tieneJugadaLegal,
  TAMANO,
  type CellValue,
} from './engine';

const idx = (fila: number, col: number) => fila * TAMANO + col;
const tableroVacio = (): CellValue[] => Array<CellValue>(TAMANO * TAMANO).fill(null);

describe('createInitialState', () => {
  it('crea un tablero vacío de 36 casillas, turno del jugador 1', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(36);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.dominos).toEqual([]);
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta pares a, b enteros en [0, 36) y distintos', () => {
    expect(esJugadaValida({ a: 0, b: 1 })).toBe(true);
    expect(esJugadaValida({ a: 35, b: 29 })).toBe(true);
  });
  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({ a: 0 })).toBe(false);
    expect(esJugadaValida({ a: 3, b: 3 })).toBe(false);
    expect(esJugadaValida({ a: -1, b: 0 })).toBe(false);
    expect(esJugadaValida({ a: 0, b: 36 })).toBe(false);
    expect(esJugadaValida({ a: 0.5, b: 1 })).toBe(false);
  });
});

describe('dominosLegalesEn', () => {
  it('en el centro hay 4 opciones, normalizadas a < b', () => {
    const r = dominosLegalesEn(tableroVacio(), idx(2, 2));
    expect(r).toHaveLength(4);
    expect(r.every(m => m.a < m.b)).toBe(true);
  });
  it('en una esquina hay 2 y no cruza bordes', () => {
    expect(dominosLegalesEn(tableroVacio(), 0)).toHaveLength(2);
    // fin de fila 0 no se une con el inicio de fila 1
    const r = dominosLegalesEn(tableroVacio(), idx(0, 5));
    expect(r).toEqual([
      { a: idx(0, 4), b: idx(0, 5) },
      { a: idx(0, 5), b: idx(1, 5) },
    ]);
  });
  it('descarta las que chocan con casillas ocupadas', () => {
    const b = tableroVacio();
    b[idx(2, 3)] = 1;
    b[idx(3, 2)] = 2;
    const r = dominosLegalesEn(b, idx(2, 2));
    expect(r).toEqual([
      { a: idx(1, 2), b: idx(2, 2) },
      { a: idx(2, 1), b: idx(2, 2) },
    ]);
  });
  it('devuelve [] si el ancla está ocupada o fuera de rango', () => {
    const b = tableroVacio();
    b[0] = 1;
    expect(dominosLegalesEn(b, 0)).toEqual([]);
    expect(dominosLegalesEn(b, -1)).toEqual([]);
    expect(dominosLegalesEn(b, 36)).toEqual([]);
  });
});

describe('playMove', () => {
  it('ambos jugadores pueden colocar en horizontal y en vertical', () => {
    let s = playMove(createInitialState(), { a: idx(0, 0), b: idx(0, 1) });
    expect(s.board[0]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    s = playMove(s, { a: idx(1, 0), b: idx(2, 0) });
    expect(s.board[idx(1, 0)]).toBe(2);
    s = playMove(s, { a: idx(3, 0), b: idx(4, 0) });
    expect(s.board[idx(3, 0)]).toBe(1);
    expect(s.dominos).toHaveLength(3);
    expect(s.lastMove).toEqual({ a: idx(3, 0), b: idx(4, 0) });
  });
  it('normaliza a < b', () => {
    const s = playMove(createInitialState(), { a: 7, b: 6 });
    expect(s.lastMove).toEqual({ a: 6, b: 7 });
  });
  it('rechaza diagonal, no adyacentes y envoltura de fila', () => {
    const s = createInitialState();
    expect(playMove(s, { a: 0, b: 7 })).toBe(s);
    expect(playMove(s, { a: 0, b: 2 })).toBe(s);
    expect(playMove(s, { a: idx(0, 5), b: idx(1, 0) })).toBe(s);
  });
  it('rechaza casillas ocupadas y movimientos mal formados', () => {
    const s = playMove(createInitialState(), { a: 0, b: 1 });
    expect(playMove(s, { a: 1, b: 2 })).toBe(s);
    expect(playMove(s, { a: 0, b: 0 } as never)).toBe(s);
  });
  it('no muta el estado anterior', () => {
    const s = createInitialState();
    playMove(s, { a: 0, b: 1 });
    expect(s.board[0]).toBeNull();
    expect(s.dominos).toEqual([]);
  });
  it('gana quien hace la última jugada', () => {
    // Quedan libres solo las casillas 0 y 1.
    const board = Array<CellValue>(36).fill(1);
    board[0] = null;
    board[1] = null;
    const s = playMove(
      { ...createInitialState(), board, currentPlayer: 2 },
      { a: 0, b: 1 },
    );
    expect(s.status).toBe('won');
    expect(s.winner).toBe(2);
    expect(s.currentPlayer).toBe(2);
  });
  it('no ocurre victoria mientras aún quede alguna jugada', () => {
    const board = Array<CellValue>(36).fill(1);
    [0, 1, 2, 3].forEach(i => (board[i] = null));
    const s = playMove({ ...createInitialState(), board }, { a: 0, b: 1 });
    expect(s.status).toBe('playing');
    expect(s.currentPlayer).toBe(2);
  });
  it('tras el fin ignora más jugadas', () => {
    const board = Array<CellValue>(36).fill(1);
    board[0] = null;
    board[1] = null;
    const fin = playMove({ ...createInitialState(), board }, { a: 0, b: 1 });
    expect(playMove(fin, { a: 2, b: 3 })).toBe(fin);
  });
});

describe('tieneJugadaLegal', () => {
  it('tablero vacío sí; lleno no', () => {
    expect(tieneJugadaLegal(tableroVacio())).toBe(true);
    expect(tieneJugadaLegal(Array<CellValue>(36).fill(1))).toBe(false);
  });
  it('casillas libres aisladas (sin vecina libre) no cuentan', () => {
    const b = Array<CellValue>(36).fill(1);
    b[idx(0, 5)] = null;
    b[idx(1, 0)] = null; // contiguas en índice, pero no adyacentes
    expect(tieneJugadaLegal(b)).toBe(false);
  });
});

describe('partidas aleatorias', () => {
  it('siempre terminan, el ganador es quien jugó último y los dominós cubren el tablero ocupado', () => {
    for (let p = 0; p < 300; p++) {
      let s = createInitialState();
      let jugadas = 0;
      while (s.status === 'playing') {
        const libres = s.board.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
        const movs = libres.flatMap(i => dominosLegalesEn(s.board, i));
        expect(movs.length).toBeGreaterThan(0);
        s = playMove(s, movs[Math.floor(Math.random() * movs.length)]);
        jugadas++;
        expect(jugadas).toBeLessThanOrEqual(18);
      }
      expect(s.winner).toBe(s.currentPlayer);
      expect(s.board.filter(c => c !== null)).toHaveLength(s.dominos.length * 2);
    }
  });
});
