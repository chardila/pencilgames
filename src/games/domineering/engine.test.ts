import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  orientacionDe,
  dominosLegalesEn,
  dominosEnTablero,
  playMove,
  tieneJugadaLegal,
  TAMANO,
  type CellValue,
  type DomineeringState,
} from './engine';

// Helper: índice fila-mayor en un tablero 8×8.
const idx = (fila: number, col: number) => fila * TAMANO + col;
const tableroVacio = (): CellValue[] => Array<CellValue>(TAMANO * TAMANO).fill(null);

describe('createInitialState', () => {
  it('crea un tablero vacío de 64 casillas, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.board).toHaveLength(64);
    expect(state.board.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.lastMove).toBeNull();
  });
});

describe('orientacionDe', () => {
  it('jugador 1 es vertical, jugador 2 es horizontal', () => {
    expect(orientacionDe(1)).toBe('vertical');
    expect(orientacionDe(2)).toBe('horizontal');
  });
});

describe('esJugadaValida', () => {
  it('acepta objetos con a, b enteros en [0, 64) y distintos', () => {
    expect(esJugadaValida({ a: 0, b: 8 })).toBe(true);
    expect(esJugadaValida({ a: 63, b: 62 })).toBe(true);
  });

  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({ a: 0 })).toBe(false);
    expect(esJugadaValida({ a: 0, b: 0 })).toBe(false);
    expect(esJugadaValida({ a: -1, b: 7 })).toBe(false);
    expect(esJugadaValida({ a: 0, b: 64 })).toBe(false);
    expect(esJugadaValida({ a: 1.5, b: 2 })).toBe(false);
    expect(esJugadaValida({ a: '0', b: '8' })).toBe(false);
  });
});

describe('dominosLegalesEn', () => {
  it('vertical, ancla en el centro con vecinos libres → 2 dominós (arriba y abajo)', () => {
    const board = tableroVacio();
    const a = idx(3, 3);
    expect(dominosLegalesEn(board, 1, a)).toEqual([
      { a: a - TAMANO, b: a },
      { a, b: a + TAMANO },
    ]);
  });

  it('vertical, ancla en la fila 0 → solo el dominó de abajo', () => {
    const board = tableroVacio();
    expect(dominosLegalesEn(board, 1, idx(0, 4))).toEqual([{ a: idx(0, 4), b: idx(1, 4) }]);
  });

  it('vertical, ancla en la fila 7 → solo el dominó de arriba', () => {
    const board = tableroVacio();
    expect(dominosLegalesEn(board, 1, idx(7, 4))).toEqual([{ a: idx(6, 4), b: idx(7, 4) }]);
  });

  it('horizontal, ancla en el centro → 2 dominós (izquierda y derecha)', () => {
    const board = tableroVacio();
    const a = idx(3, 3);
    expect(dominosLegalesEn(board, 2, a)).toEqual([
      { a: a - 1, b: a },
      { a, b: a + 1 },
    ]);
  });

  it('horizontal, ancla en la columna 7 → solo el dominó de la izquierda', () => {
    const board = tableroVacio();
    expect(dominosLegalesEn(board, 2, idx(3, 7))).toEqual([{ a: idx(3, 6), b: idx(3, 7) }]);
  });

  it('excluye el dominó cuyo vecino está ocupado', () => {
    const board = tableroVacio();
    const a = idx(3, 3);
    board[a + TAMANO] = 2; // vecino de abajo ocupado
    expect(dominosLegalesEn(board, 1, a)).toEqual([{ a: a - TAMANO, b: a }]);
  });

  it('ancla ocupada → []', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    expect(dominosLegalesEn(board, 1, idx(3, 3))).toEqual([]);
  });
});

describe('dominosEnTablero', () => {
  it('reconstruye dominós verticales y horizontales sin solaparlos', () => {
    const board = tableroVacio();
    // vertical del jugador 1 en (0,0)-(1,0)
    board[idx(0, 0)] = 1;
    board[idx(1, 0)] = 1;
    // vertical del jugador 1 apilado en (2,0)-(3,0)
    board[idx(2, 0)] = 1;
    board[idx(3, 0)] = 1;
    // horizontal del jugador 2 en (5,2)-(5,3)
    board[idx(5, 2)] = 2;
    board[idx(5, 3)] = 2;
    expect(dominosEnTablero(board)).toEqual([
      { a: idx(0, 0), b: idx(1, 0) },
      { a: idx(2, 0), b: idx(3, 0) },
      { a: idx(5, 2), b: idx(5, 3) },
    ]);
  });

  it('tablero vacío → []', () => {
    expect(dominosEnTablero(tableroVacio())).toEqual([]);
  });
});

describe('playMove — colocación y turno', () => {
  it('el jugador 1 coloca un dominó vertical, marca ambas casillas y pasa el turno', () => {
    const state = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    expect(state.board[idx(0, 0)]).toBe(1);
    expect(state.board[idx(1, 0)]).toBe(1);
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');
    expect(state.lastMove).toEqual({ a: idx(0, 0), b: idx(1, 0) });
  });

  it('normaliza el par (acepta a > b en el payload)', () => {
    const state = playMove(createInitialState(), { a: idx(1, 0), b: idx(0, 0) });
    expect(state.lastMove).toEqual({ a: idx(0, 0), b: idx(1, 0) });
  });

  it('el jugador 2 coloca un dominó horizontal', () => {
    const s1 = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    const s2 = playMove(s1, { a: idx(4, 4), b: idx(4, 5) });
    expect(s2.board[idx(4, 4)]).toBe(2);
    expect(s2.board[idx(4, 5)]).toBe(2);
    expect(s2.currentPlayer).toBe(1);
  });

  it('ignora un dominó con la orientación equivocada para el jugador en turno', () => {
    const state = createInitialState(); // turno del 1 (vertical)
    expect(playMove(state, { a: idx(0, 0), b: idx(0, 1) })).toBe(state); // horizontal
  });

  it('ignora un dominó que se sale del tablero', () => {
    const state = createInitialState();
    expect(playMove(state, { a: idx(7, 0), b: idx(7, 0) + TAMANO })).toBe(state); // vertical fuera por abajo
    const s2 = playMove(state, { a: idx(0, 0), b: idx(1, 0) }); // turno del 2 ahora
    expect(playMove(s2, { a: idx(3, 7), b: idx(3, 7) + 1 })).toBe(s2); // horizontal cruza de fila
  });

  it('ignora un dominó sobre una casilla ocupada', () => {
    const s1 = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    const s2 = playMove(s1, { a: idx(3, 3), b: idx(3, 4) }); // turno del 1 otra vez
    expect(playMove(s2, { a: idx(0, 0), b: idx(1, 0) })).toBe(s2);
  });

  it('ignora payload inválido', () => {
    const state = createInitialState();
    expect(playMove(state, { a: 0, b: 0 } as never)).toBe(state);
    expect(playMove(state, 5 as never)).toBe(state);
  });

  it('no muta el estado de entrada', () => {
    const state = createInitialState();
    const boardRef = state.board;
    playMove(state, { a: idx(0, 0), b: idx(1, 0) });
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});

describe('tieneJugadaLegal', () => {
  it('tablero vacío → true para ambos jugadores', () => {
    const board = tableroVacio();
    expect(tieneJugadaLegal(board, 1)).toBe(true);
    expect(tieneJugadaLegal(board, 2)).toBe(true);
  });

  it('detecta ausencia de par vertical libre aunque queden pares horizontales', () => {
    const board = tableroVacio();
    for (let fila = 0; fila < TAMANO; fila += 2) {
      for (let col = 0; col < TAMANO; col++) board[idx(fila, col)] = 1;
    }
    expect(tieneJugadaLegal(board, 1)).toBe(false);
    expect(tieneJugadaLegal(board, 2)).toBe(true);
  });
});

describe('playMove — fin de partida', () => {
  it('gana el jugador que coloca el último dominó (rival sin colocación legal)', () => {
    const board: CellValue[] = tableroVacio();
    for (let col = 1; col < TAMANO; col += 2) {
      for (let fila = 0; fila < TAMANO; fila++) board[idx(fila, col)] = 1;
    }
    expect(tieneJugadaLegal(board, 2)).toBe(false);

    const state: DomineeringState = {
      board,
      currentPlayer: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const resultado = playMove(state, { a: idx(0, 0), b: idx(1, 0) });
    expect(resultado.status).toBe('won');
    expect(resultado.winner).toBe(1);
    expect(resultado.currentPlayer).toBe(1);
    expect(resultado.lastMove).toEqual({ a: idx(0, 0), b: idx(1, 0) });
  });

  it('mientras el rival tenga una colocación legal, la partida sigue y el turno alterna', () => {
    const state = playMove(createInitialState(), { a: idx(0, 0), b: idx(1, 0) });
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(2);
  });

  it('no permite más jugadas tras ganar', () => {
    const board: CellValue[] = tableroVacio();
    for (let col = 1; col < TAMANO; col += 2) {
      for (let fila = 0; fila < TAMANO; fila++) board[idx(fila, col)] = 1;
    }
    const ganado = playMove(
      { board, currentPlayer: 1, status: 'playing', winner: null, lastMove: null },
      { a: idx(0, 0), b: idx(1, 0) },
    );
    expect(ganado.status).toBe('won');
    expect(playMove(ganado, { a: idx(2, 0), b: idx(3, 0) })).toBe(ganado);
  });

  it('la primera jugada de la partida nunca termina el juego', () => {
    const state = playMove(createInitialState(), { a: idx(3, 3), b: idx(4, 3) });
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
  });
});

describe('fuzzing — invariantes sobre partidas aleatorias completas', () => {
  it('2000 partidas: sin solapes, gana quien hizo la última jugada, el perdedor no tenía jugada', () => {
    for (let partida = 0; partida < 2000; partida++) {
      let s = createInitialState();
      let jugadas = 0;
      while (s.status === 'playing' && jugadas < 64) {
        const legales: { a: number; b: number }[] = [];
        for (let i = 0; i < TAMANO * TAMANO; i++) {
          for (const m of dominosLegalesEn(s.board, s.currentPlayer, i)) {
            if (m.a === i) legales.push(m);
          }
        }
        expect(legales.length).toBeGreaterThan(0);
        const m = legales[Math.floor(Math.random() * legales.length)];
        const antes = s;
        s = playMove(s, m);
        expect(s).not.toBe(antes);
        jugadas++;
      }
      expect(s.status).toBe('won');
      const perdedor = s.winner === 1 ? 2 : 1;
      expect(tieneJugadaLegal(s.board, perdedor)).toBe(false);
      expect(s.board.every(c => c === null || c === 1 || c === 2)).toBe(true);
    }
  });
});
