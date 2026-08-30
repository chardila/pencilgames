import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  getNeighbors,
  playMove,
  type BoardSize,
} from './engine';

const idx = (r: number, c: number, size: BoardSize = 7) => r * size + c;

describe('createInitialState', () => {
  it('crea un estado inicial 7x7 por defecto con 49 celdas vacías y turno del Jugador 1', () => {
    const state = createInitialState();
    expect(state.size).toBe(7);
    expect(state.board).toHaveLength(49);
    expect(state.board.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.winningPath).toBeNull();
    expect(state.lastMove).toBeNull();
  });

  it('permite crear tableros de tamaño 5x5 y 9x9', () => {
    const state5 = createInitialState(5);
    expect(state5.size).toBe(5);
    expect(state5.board).toHaveLength(25);

    const state9 = createInitialState(9);
    expect(state9.size).toBe(9);
    expect(state9.board).toHaveLength(81);
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros en el rango [0, size*size - 1]', () => {
    expect(esJugadaValida(0, 7)).toBe(true);
    expect(esJugadaValida(48, 7)).toBe(true);
    expect(esJugadaValida(24, 5)).toBe(true);
  });

  it('rechaza índices fuera de rango, floats, strings y otros tipos', () => {
    expect(esJugadaValida(-1, 7)).toBe(false);
    expect(esJugadaValida(49, 7)).toBe(false);
    expect(esJugadaValida(3.2, 7)).toBe(false);
    expect(esJugadaValida('5', 7)).toBe(false);
    expect(esJugadaValida(null, 7)).toBe(false);
    expect(esJugadaValida({}, 7)).toBe(false);
    expect(esJugadaValida(NaN, 7)).toBe(false);
  });
});

describe('getNeighbors', () => {
  it('una celda central (2,2) en 5x5 tiene exactamente 6 vecinos correctos', () => {
    const neighbors = getNeighbors(idx(2, 2, 5), 5);
    expect(neighbors.sort((a, b) => a - b)).toEqual(
      [
        idx(1, 2, 5), // [-1, 0] Noroeste
        idx(1, 3, 5), // [-1, 1] Noreste
        idx(2, 1, 5), // [0, -1] Oeste
        idx(2, 3, 5), // [0, 1] Este
        idx(3, 1, 5), // [1, -1] Suroeste
        idx(3, 2, 5), // [1, 0] Sureste
      ].sort((a, b) => a - b)
    );
  });

  it('la esquina superior izquierda (0,0) solo tiene 2 vecinos reales (Oeste y Sureste)', () => {
    const neighbors = getNeighbors(idx(0, 0, 5), 5);
    expect(neighbors.sort((a, b) => a - b)).toEqual(
      [
        idx(0, 1, 5), // [0, 1] Este
        idx(1, 0, 5), // [1, 0] Sureste
      ].sort((a, b) => a - b)
    );
  });

  it('la esquina superior derecha (0, 4) en 5x5 tiene 3 vecinos reales', () => {
    const neighbors = getNeighbors(idx(0, 4, 5), 5);
    expect(neighbors.sort((a, b) => a - b)).toEqual(
      [
        idx(0, 3, 5), // [0, -1]
        idx(1, 3, 5), // [1, -1]
        idx(1, 4, 5), // [1, 0]
      ].sort((a, b) => a - b)
    );
  });

  it('una celda en el borde izquierdo (2, 0) no desborda a la fila anterior al buscar Oeste', () => {
    const neighbors = getNeighbors(idx(2, 0, 5), 5);
    // Vecinos: (1,0), (1,1), (2,1), (3,0) -> 4 vecinos
    expect(neighbors.sort((a, b) => a - b)).toEqual(
      [
        idx(1, 0, 5),
        idx(1, 1, 5),
        idx(2, 1, 5),
        idx(3, 0, 5),
      ].sort((a, b) => a - b)
    );
  });
});

describe('playMove — colocación básica', () => {
  it('coloca la ficha del jugador actual, actualiza lastMove y alterna el turno', () => {
    const state = playMove(createInitialState(5), idx(0, 0, 5));
    expect(state.board[0]).toBe(1);
    expect(state.lastMove).toBe(0);
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');

    const state2 = playMove(state, idx(1, 1, 5));
    expect(state2.board[idx(1, 1, 5)]).toBe(2);
    expect(state2.lastMove).toBe(idx(1, 1, 5));
    expect(state2.currentPlayer).toBe(1);
  });

  it('ignora jugada en celda ocupada y devuelve el mismo estado', () => {
    const state = playMove(createInitialState(5), 0);
    expect(playMove(state, 0)).toBe(state);
  });

  it('ignora jugada fuera de rango y devuelve el mismo estado', () => {
    const state = createInitialState(5);
    expect(playMove(state, -1)).toBe(state);
    expect(playMove(state, 25)).toBe(state);
    expect(playMove(state, 3.5)).toBe(state);
  });

  it('no muta el estado ni el array original', () => {
    const state = createInitialState(5);
    const boardRef = state.board;
    playMove(state, 12);
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});
