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

// Helper: aplica una lista de índices alternando jugadores (1, 2, 1, 2, …)
// partiendo del estado inicial.
function jugarSecuencia(indices: number[]) {
  return indices.reduce((s, i) => playMove(s, i), createInitialState());
}

// Helper: fuerza una fila de 5 fichas del jugador 1 intercalando jugadas
// "de relleno" del jugador 2 en una zona lejana que nunca forma línea.
// relleno usa la última fila (índices 72..80), que no colisiona con las
// pruebas de fila 0..4.
function ganarCon(indicesJugador1: number[]) {
  let state = createInitialState();
  const relleno = [72, 73, 74, 75, 76];
  indicesJugador1.forEach((idx, turno) => {
    state = playMove(state, idx); // jugador 1
    if (turno < indicesJugador1.length - 1) {
      state = playMove(state, relleno[turno]); // jugador 2
    }
  });
  return state;
}

describe('playMove — victoria', () => {
  it('victoria horizontal de 5 (fila 0, columnas 0..4)', () => {
    const state = ganarCon([0, 1, 2, 3, 4]);
    expect(state.status).toBe('won');
    expect(state.winner).toBe(1);
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(state.currentPlayer).toBe(1); // no alterna al ganar
  });

  it('victoria vertical de 5 (columna 0, filas 0..4)', () => {
    const state = ganarCon([0, 9, 18, 27, 36]);
    expect(state.status).toBe('won');
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([0, 9, 18, 27, 36]);
  });

  it('victoria diagonal ↘ de 5', () => {
    const state = ganarCon([0, 10, 20, 30, 40]);
    expect(state.status).toBe('won');
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([0, 10, 20, 30, 40]);
  });

  it('victoria diagonal ↗ de 5', () => {
    // fila 4..0, columnas 0..4 → índices 36, 28, 20, 12, 4
    const state = ganarCon([36, 28, 20, 12, 4]);
    expect(state.status).toBe('won');
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([4, 12, 20, 28, 36]);
  });

  it('cinco o más: 6 en línea también gana', () => {
    // 1 juega 0,1,2,3 (racha de 4), luego 5 (aislada: la col 4 sigue vacía),
    // luego 4 rellena el hueco → 0,1,2,3,4,5 = 6 seguidas en la jugada final.
    // El relleno del jugador 2 evita cualquier racha de 5 propia: 72,73,74,75
    // (racha de 4) y 77 (aislada), todos en la fila 8.
    let state = createInitialState();
    const relleno = [72, 73, 74, 75, 77];
    [0, 1, 2, 3, 5, 4].forEach((idx, turno) => {
      state = playMove(state, idx);
      if (turno < 5) state = playMove(state, relleno[turno]);
    });
    expect(state.status).toBe('won');
    expect(state.winner).toBe(1);
    expect(state.winningLine).toHaveLength(6);
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('unión de dos grupos con la jugada central da racha de 5', () => {
    // 1 juega 0,1,3,4 y luego 2 (el hueco) → 0,1,2,3,4
    let state = createInitialState();
    const relleno = [72, 73, 74, 75];
    [0, 1, 3, 4, 2].forEach((idx, turno) => {
      state = playMove(state, idx);
      if (turno < 4) state = playMove(state, relleno[turno]);
    });
    expect(state.status).toBe('won');
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it('no permite más jugadas tras ganar', () => {
    const state = ganarCon([0, 1, 2, 3, 4]);
    expect(playMove(state, 8)).toBe(state);
  });
});

describe('playMove — no envolvimiento de borde', () => {
  it('4 fichas al final de la fila 0 + 1 al inicio de la fila 1 NO es victoria', () => {
    // fila 0 columnas 5,6,7,8 = índices 5,6,7,8; fila 1 columna 0 = índice 9
    const state = ganarCon([5, 6, 7, 8, 9]);
    expect(state.status).toBe('playing');
    expect(state.winningLine).toBeNull();
  });

  it('diagonal ↘ que se saldría por el borde derecho no cuenta', () => {
    // fila 0 col 6,7,8 (6,7,8) y fila 1 col 0,1 (9,10): no es diagonal real
    const state = ganarCon([6, 7, 8, 9, 10]);
    expect(state.status).toBe('playing');
  });

  it('victoria cuya racha termina exactamente en el borde derecho sí cuenta', () => {
    // fila 0 columnas 4..8 = índices 4,5,6,7,8
    const state = ganarCon([4, 5, 6, 7, 8]);
    expect(state.status).toBe('won');
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8]);
  });

  it('victoria vertical cuya racha termina en la fila 8 sí cuenta', () => {
    // columna 0, filas 4..8 = índices 36,45,54,63,72.
    // El relleno del jugador 2 va en la fila 0 (1..4) porque el índice 72
    // pertenece a la racha vertical y no puede usarse como relleno.
    let state = createInitialState();
    const relleno = [1, 2, 3, 4];
    [36, 45, 54, 63, 72].forEach((idx, turno) => {
      state = playMove(state, idx);
      if (turno < 4) state = playMove(state, relleno[turno]);
    });
    expect(state.status).toBe('won');
    expect([...state.winningLine!].sort((a, b) => a - b)).toEqual([36, 45, 54, 63, 72]);
  });
});

describe('playMove — empate', () => {
  it('tablero lleno sin racha de 5 → draw', () => {
    // Patrón que llena el tablero sin 5 en línea de ningún color.
    // Nota del brief: el patrón por defecto dejaba diagonales monocolor de 5;
    // se ajustó a (floor(col/2) + fila) % 2, verificado sin ninguna línea
    // horizontal/vertical/diagonal de 5 de un solo color.
    const state = createInitialState();
    const patron = (fila: number, col: number) =>
      ((Math.floor(col / 2) + fila) % 2) as 0 | 1;
    let board: (1 | 2 | null)[] = [];
    for (let f = 0; f < 9; f++) {
      for (let c = 0; c < 9; c++) {
        board.push(patron(f, c) === 0 ? 1 : 2);
      }
    }
    // Deja una casilla libre (la 80) y ponla como jugada final del jugador
    // que corresponde según el patrón.
    const jugadorFinal = patron(8, 8) === 0 ? 1 : 2;
    board[80] = null;
    const casiLleno: typeof state = {
      ...state,
      board,
      currentPlayer: jugadorFinal,
    };
    const resultado = playMove(casiLleno, 80);
    expect(resultado.board.every(c => c !== null)).toBe(true);
    expect(resultado.status).toBe('draw');
    expect(resultado.winner).toBeNull();
    expect(resultado.winningLine).toBeNull();
  });
});
