import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  TAMANO,
} from './engine';

describe('createInitialState', () => {
  it('crea un tablero vacío de 81 casillas, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.board).toHaveLength(TAMANO * TAMANO);
    expect(state.board.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.winningLine).toBeNull();
    expect(state.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros dentro de [0, 80]', () => {
    expect(esJugadaValida(0)).toBe(true);
    expect(esJugadaValida(80)).toBe(true);
    expect(esJugadaValida(40)).toBe(true);
  });

  it('rechaza fuera de rango, no enteros y no números', () => {
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(81)).toBe(false);
    expect(esJugadaValida(3.5)).toBe(false);
    expect(esJugadaValida('2')).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
  });
});

describe('playMove — colocación y turno', () => {
  it('coloca la ficha del jugador actual y pasa el turno', () => {
    const state = playMove(createInitialState(), 0);
    expect(state.board[0]).toBe(1);
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');
    expect(state.lastMove).toBe(0);

    const state2 = playMove(state, 1);
    expect(state2.board[1]).toBe(2);
    expect(state2.currentPlayer).toBe(1);
    expect(state2.lastMove).toBe(1);
  });

  it('ignora jugada sobre casilla ocupada', () => {
    const state = playMove(createInitialState(), 0);
    const sinCambio = playMove(state, 0);
    expect(sinCambio).toBe(state);
  });

  it('ignora jugada fuera de rango', () => {
    const state = createInitialState();
    expect(playMove(state, -1)).toBe(state);
    expect(playMove(state, 81)).toBe(state);
    expect(playMove(state, 2.5)).toBe(state);
  });

  it('no muta el estado de entrada', () => {
    const state = createInitialState();
    const boardRef = state.board;
    playMove(state, 40);
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});
