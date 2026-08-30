import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  FILAS,
  COLUMNAS,
  TOTAL_CASILLAS,
  INDICE_VENENO,
} from './engine';

describe('createInitialState', () => {
  it('crea un tablero de 28 casillas activas, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.board).toHaveLength(TOTAL_CASILLAS);
    expect(state.board.every(casilla => casilla === true)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.lastEaten).toEqual([]);
    expect(state.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros dentro de [1, 27]', () => {
    expect(esJugadaValida(1)).toBe(true);
    expect(esJugadaValida(27)).toBe(true);
    expect(esJugadaValida(14)).toBe(true);
  });

  it('rechaza el veneno (0), fuera de rango y no enteros', () => {
    expect(esJugadaValida(0)).toBe(false); // casilla envenenada no se juega directamente
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(28)).toBe(false);
    expect(esJugadaValida(3.14)).toBe(false);
    expect(esJugadaValida('5')).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
  });
});

describe('playMove — mecánica de mordiscos', () => {
  it('morder la esquina inferior derecha (3, 6 = 27) elimina solo esa casilla', () => {
    const state = playMove(createInitialState(), 27);
    expect(state.board[27]).toBe(false);
    expect(state.board.filter(c => c === true)).toHaveLength(27);
    expect(state.lastEaten).toEqual([27]);
    expect(state.lastMove).toBe(27);
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');
  });

  it('morder (1, 1 = 8) elimina todo el cuadrante r >= 1 y c >= 1', () => {
    // Filas 1..3 y Columnas 1..6 son 3 * 6 = 18 casillas eliminadas.
    // Quedan 28 - 18 = 10 casillas (fila 0 completa [7] + col 0 en filas 1,2,3 [3]).
    const state = playMove(createInitialState(), 8);
    expect(state.lastEaten).toHaveLength(18);
    expect(state.board.filter(c => c === true)).toHaveLength(10);
    // Casillas intactas: fila 0 (0..6)
    for (let c = 0; c < 7; c++) {
      expect(state.board[c]).toBe(true);
    }
    // Casillas intactas: col 0 (0, 7, 14, 21)
    expect(state.board[7]).toBe(true);
    expect(state.board[14]).toBe(true);
    expect(state.board[21]).toBe(true);
    // Casilla mordida y vecinas
    expect(state.board[8]).toBe(false);
    expect(state.board[27]).toBe(false);
  });

  it('ignora jugada sobre casilla ya comida', () => {
    const state1 = playMove(createInitialState(), 27);
    const state2 = playMove(state1, 27);
    expect(state2).toBe(state1);
  });

  it('ignora jugada sobre la casilla 0 (veneno)', () => {
    const state = createInitialState();
    const resultado = playMove(state, 0);
    expect(resultado).toBe(state);
  });

  it('ignora jugadas fuera de rango', () => {
    const state = createInitialState();
    expect(playMove(state, -5)).toBe(state);
    expect(playMove(state, 100)).toBe(state);
  });

  it('no muta el estado de entrada ni su array board', () => {
    const state = createInitialState();
    const boardOriginal = state.board;
    playMove(state, 15);
    expect(boardOriginal.every(c => c === true)).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});

describe('playMove — condición de victoria y fin de partida', () => {
  it('morder (0, 1 = 1) y luego (1, 0 = 7) deja solo el veneno y declara ganador al jugador 2', () => {
    // J1 come toda la derecha (cols 1..6)
    const state1 = playMove(createInitialState(), 1);
    expect(state1.status).toBe('playing');
    expect(state1.currentPlayer).toBe(2);

    // J2 come toda la parte inferior (filas 1..3 en col 0)
    const state2 = playMove(state1, 7);
    expect(state2.status).toBe('won');
    expect(state2.winner).toBe(2);
    expect(state2.currentPlayer).toBe(2); // no alterna tras victoria
    expect(state2.board.filter(c => c === true)).toHaveLength(1);
    expect(state2.board[0]).toBe(true);
  });

  it('no permite movimientos posteriores una vez que alguien ganó', () => {
    const state1 = playMove(createInitialState(), 1);
    const state2 = playMove(state1, 7);
    expect(state2.status).toBe('won');

    // Intentar mover de nuevo
    const state3 = playMove(state2, 0);
    expect(state3).toBe(state2);
  });

  it('partida completa simulada', () => {
    let state = createInitialState();
    // J1 come (2, 2 = 16)
    state = playMove(state, 16);
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(2);

    // J2 come (1, 3 = 10)
    state = playMove(state, 10);
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(1);

    // J1 come (0, 1 = 1) -> deja solo la columna 0
    state = playMove(state, 1);
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(2);

    // J2 come (1, 0 = 7) -> deja solo (0, 0)
    state = playMove(state, 7);
    expect(state.status).toBe('won');
    expect(state.winner).toBe(2);
    expect(state.board[0]).toBe(true);
  });
});

