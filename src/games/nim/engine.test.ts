import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  FILAS_INICIALES,
  TOTAL_FICHAS,
  type NimState,
} from './engine';

describe('createInitialState', () => {
  it('crea montones [1, 3, 5, 7], turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.montones).toEqual([1, 3, 5, 7]);
    expect(state.montones.reduce((a, b) => a + b, 0)).toBe(TOTAL_FICHAS);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.lastMove).toBeNull();
  });

  it('FILAS_INICIALES es [1, 3, 5, 7]', () => {
    expect([...FILAS_INICIALES]).toEqual([1, 3, 5, 7]);
  });
});

describe('esJugadaValida', () => {
  it('acepta objetos { fila, dejar } bien formados', () => {
    expect(esJugadaValida({ fila: 0, dejar: 0 })).toBe(true);
    expect(esJugadaValida({ fila: 3, dejar: 6 })).toBe(true);
    expect(esJugadaValida({ fila: 2, dejar: 1 })).toBe(true);
  });

  it('rechaza forma inválida', () => {
    expect(esJugadaValida({ fila: -1, dejar: 0 })).toBe(false);
    expect(esJugadaValida({ fila: 4, dejar: 0 })).toBe(false);
    expect(esJugadaValida({ fila: 0, dejar: -1 })).toBe(false);
    expect(esJugadaValida({ fila: 1.5, dejar: 0 })).toBe(false);
    expect(esJugadaValida({ fila: 0, dejar: 2.5 })).toBe(false);
    expect(esJugadaValida({ fila: 0 })).toBe(false);
    expect(esJugadaValida({ dejar: 0 })).toBe(false);
    expect(esJugadaValida([0, 0])).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida('fila 0')).toBe(false);
    expect(esJugadaValida(3)).toBe(false);
    expect(esJugadaValida({ fila: NaN, dejar: 0 })).toBe(false);
  });
});

describe('playMove — mecánica de retirada', () => {
  it('{ fila: 3, dejar: 4 } deja montones [1, 3, 5, 4] y pasa el turno', () => {
    const state = playMove(createInitialState(), { fila: 3, dejar: 4 });
    expect(state.montones).toEqual([1, 3, 5, 4]);
    expect(state.lastMove).toEqual({ fila: 3, quitadas: 3 });
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
  });

  it('{ fila: 0, dejar: 0 } retira la única estrella de la fila 0', () => {
    const state = playMove(createInitialState(), { fila: 0, dejar: 0 });
    expect(state.montones).toEqual([0, 3, 5, 7]);
    expect(state.lastMove).toEqual({ fila: 0, quitadas: 1 });
    expect(state.currentPlayer).toBe(2);
  });

  it('no muta el estado ni el array montones de entrada', () => {
    const state = createInitialState();
    const montonesOriginal = state.montones;
    playMove(state, { fila: 2, dejar: 1 });
    expect(montonesOriginal).toEqual([1, 3, 5, 7]);
    expect(state.currentPlayer).toBe(1);
    expect(state.lastMove).toBeNull();
  });
});

describe('playMove — movimientos inválidos devuelven el mismo estado', () => {
  it('dejar igual al montón actual (no retira nada)', () => {
    const state = createInitialState();
    expect(playMove(state, { fila: 1, dejar: 3 })).toBe(state);
  });

  it('dejar mayor que el montón actual', () => {
    const state = createInitialState();
    expect(playMove(state, { fila: 0, dejar: 5 })).toBe(state);
  });

  it('payload con forma inválida', () => {
    const state = createInitialState();
    expect(playMove(state, { fila: 9, dejar: 0 } as unknown as import('./engine').NimMove)).toBe(state);
  });

  it('jugar cuando ya hay ganador', () => {
    // Vaciar el tablero en secuencia hasta la victoria
    let s = createInitialState();
    s = playMove(s, { fila: 0, dejar: 0 }); // [0,3,5,7]
    s = playMove(s, { fila: 1, dejar: 0 }); // [0,0,5,7]
    s = playMove(s, { fila: 2, dejar: 0 }); // [0,0,0,7]
    s = playMove(s, { fila: 3, dejar: 0 }); // [0,0,0,0] -> won
    expect(s.status).toBe('won');
    expect(playMove(s, { fila: 3, dejar: 0 })).toBe(s);
  });
});

describe('playMove — condición de victoria', () => {
  it('retirar la última estrella del tablero gana; el turno no alterna', () => {
    let s = createInitialState();
    s = playMove(s, { fila: 3, dejar: 0 }); // [1,3,5,0] J1 -> J2
    s = playMove(s, { fila: 2, dejar: 0 }); // [1,3,0,0] J2 -> J1
    s = playMove(s, { fila: 1, dejar: 0 }); // [1,0,0,0] J1 -> J2
    expect(s.status).toBe('playing');
    expect(s.currentPlayer).toBe(2);
    s = playMove(s, { fila: 0, dejar: 0 }); // [0,0,0,0] J2 gana
    expect(s.status).toBe('won');
    expect(s.winner).toBe(2);
    expect(s.currentPlayer).toBe(2);
    expect(s.lastMove).toEqual({ fila: 0, quitadas: 1 });
  });

  it('vaciar un solo montón (quedando otros) no termina la partida', () => {
    const s = playMove(createInitialState(), { fila: 2, dejar: 0 });
    expect(s.montones).toEqual([1, 3, 0, 7]);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
  });
});

describe('playMove — partida completa simulada', () => {
  it('alterna turnos y actualiza montones en cada paso', () => {
    let s = createInitialState();
    expect(s.currentPlayer).toBe(1);

    s = playMove(s, { fila: 3, dejar: 2 }); // [1,3,5,2]
    expect(s.montones).toEqual([1, 3, 5, 2]);
    expect(s.currentPlayer).toBe(2);

    s = playMove(s, { fila: 2, dejar: 1 }); // [1,3,1,2]
    expect(s.montones).toEqual([1, 3, 1, 2]);
    expect(s.currentPlayer).toBe(1);

    s = playMove(s, { fila: 1, dejar: 0 }); // [1,0,1,2]
    expect(s.montones).toEqual([1, 0, 1, 2]);
    expect(s.currentPlayer).toBe(2);

    s = playMove(s, { fila: 3, dejar: 0 }); // [1,0,1,0]
    s = playMove(s, { fila: 0, dejar: 0 }); // [0,0,1,0]
    s = playMove(s, { fila: 2, dejar: 0 }); // [0,0,0,0] -> J2 gana
    expect(s.status).toBe('won');
    expect(s.winner).toBe(2);
  });
});
