import { describe, expect, it } from 'vitest';
import { createInitialState, playMove } from './engine';

describe('tres en raya engine', () => {
  it('empieza con tablero vacío y le toca a X', () => {
    const state = createInitialState();
    expect(state.board).toEqual(Array(9).fill(null));
    expect(state.currentPlayer).toBe('X');
    expect(state.status).toBe('playing');
  });

  it('coloca la ficha del jugador actual y pasa el turno', () => {
    const state = createInitialState();
    const next = playMove(state, 0);
    expect(next.board[0]).toBe('X');
    expect(next.currentPlayer).toBe('O');
    expect(next.status).toBe('playing');
  });

  it('ignora una jugada sobre una casilla ocupada', () => {
    const state = playMove(createInitialState(), 0);
    const next = playMove(state, 0);
    expect(next).toEqual(state);
  });

  it('ignora una jugada fuera de rango', () => {
    const state = createInitialState();
    const next = playMove(state, 9);
    expect(next).toEqual(state);
  });

  it('detecta una fila ganadora', () => {
    let state = createInitialState();
    state = playMove(state, 0); // X
    state = playMove(state, 3); // O
    state = playMove(state, 1); // X
    state = playMove(state, 4); // O
    state = playMove(state, 2); // X gana fila superior
    expect(state.status).toBe('won');
    expect(state.winner).toBe('X');
    expect(state.winningLine).toEqual([0, 1, 2]);
  });

  it('detecta un empate', () => {
    // Resultado final:
    // X O X
    // X O O
    // O X X
    const jugadas = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    let state = createInitialState();
    for (const jugada of jugadas) {
      state = playMove(state, jugada);
    }
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
  });

  it('no permite jugar después de terminada la partida', () => {
    let state = createInitialState();
    state = playMove(state, 0);
    state = playMove(state, 3);
    state = playMove(state, 1);
    state = playMove(state, 4);
    state = playMove(state, 2); // X gana
    const next = playMove(state, 5);
    expect(next).toEqual(state);
  });
});
