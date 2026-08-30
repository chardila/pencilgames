import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  casillaLegal,
  playMove,
  TAMANO,
  ObstruccionState,
  CellValue,
} from './engine';

// Helper: índice fila-mayor en un tablero 6×6.
const idx = (fila: number, col: number) => fila * TAMANO + col;

describe('createInitialState', () => {
  it('crea un tablero vacío de 36 casillas, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.board).toHaveLength(TAMANO * TAMANO);
    expect(state.board.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros dentro de [0, 35]', () => {
    expect(esJugadaValida(0)).toBe(true);
    expect(esJugadaValida(35)).toBe(true);
    expect(esJugadaValida(18)).toBe(true);
  });

  it('rechaza fuera de rango, no enteros y no números', () => {
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(36)).toBe(false);
    expect(esJugadaValida(3.5)).toBe(false);
    expect(esJugadaValida('2')).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
  });
});

describe('casillaLegal', () => {
  it('en tablero vacío todas las 36 casillas son legales', () => {
    const board = Array(36).fill(null);
    for (let i = 0; i < 36; i++) {
      expect(casillaLegal(board, i)).toBe(true);
    }
  });

  it('una ficha en el centro bloquea esa casilla y sus 8 vecinas', () => {
    const board = Array(36).fill(null);
    const centro = idx(2, 2);
    board[centro] = 1;
    const bloqueadas = [
      centro,
      idx(1, 1), idx(1, 2), idx(1, 3),
      idx(2, 1),            idx(2, 3),
      idx(3, 1), idx(3, 2), idx(3, 3),
    ];
    for (const b of bloqueadas) {
      expect(casillaLegal(board, b)).toBe(false);
    }
    // una casilla a distancia 2 sigue libre
    expect(casillaLegal(board, idx(0, 2))).toBe(true);
    expect(casillaLegal(board, idx(4, 4))).toBe(true);
  });

  it('ficha en la esquina 0 solo bloquea sus 3 vecinas reales (sin envolvimiento)', () => {
    const board = Array(36).fill(null);
    board[0] = 1;
    // vecinas reales de (0,0): (0,1)=1, (1,0)=6, (1,1)=7
    expect(casillaLegal(board, 1)).toBe(false);
    expect(casillaLegal(board, 6)).toBe(false);
    expect(casillaLegal(board, 7)).toBe(false);
    // NO se bloquea la última columna de la fila 0 ni la última fila
    expect(casillaLegal(board, idx(0, 5))).toBe(true);
    expect(casillaLegal(board, idx(5, 0))).toBe(true);
    expect(casillaLegal(board, idx(5, 5))).toBe(true);
  });

  it('ficha en un borde superior (0,3) bloquea 5 vecinas, ninguna fuera del tablero', () => {
    const board = Array(36).fill(null);
    board[idx(0, 3)] = 2;
    const bloqueadas = [
      idx(0, 2), idx(0, 4),
      idx(1, 2), idx(1, 3), idx(1, 4),
    ];
    for (const b of bloqueadas) {
      expect(casillaLegal(board, b)).toBe(false);
    }
    expect(casillaLegal(board, idx(0, 1))).toBe(true);
    expect(casillaLegal(board, idx(2, 3))).toBe(true);
  });

  it('una casilla ocupada nunca es legal', () => {
    const board = Array(36).fill(null);
    board[10] = 1;
    expect(casillaLegal(board, 10)).toBe(false);
  });
});

describe('playMove — colocación y turno', () => {
  it('coloca la ficha del jugador actual, fija lastMove y pasa el turno', () => {
    const state = playMove(createInitialState(), 0);
    expect(state.board[0]).toBe(1);
    expect(state.currentPlayer).toBe(2);
    expect(state.status).toBe('playing');
    expect(state.lastMove).toBe(0);

    // (0,0) bloquea 0,1,6,7 → el jugador 2 juega en una casilla legal lejana
    const state2 = playMove(state, idx(3, 3));
    expect(state2.board[idx(3, 3)]).toBe(2);
    expect(state2.currentPlayer).toBe(1);
    expect(state2.lastMove).toBe(idx(3, 3));
  });

  it('ignora jugada sobre casilla ocupada', () => {
    const state = playMove(createInitialState(), 0);
    expect(playMove(state, 0)).toBe(state);
  });

  it('ignora jugada sobre casilla bloqueada (vecina de una ficha)', () => {
    const state = playMove(createInitialState(), idx(2, 2)); // jugador 1 al centro
    // (2,3) es vecina → bloqueada
    expect(playMove(state, idx(2, 3))).toBe(state);
  });

  it('ignora jugada fuera de rango', () => {
    const state = createInitialState();
    expect(playMove(state, -1)).toBe(state);
    expect(playMove(state, 36)).toBe(state);
    expect(playMove(state, 2.5)).toBe(state);
  });

  it('no muta el estado de entrada', () => {
    const state = createInitialState();
    const boardRef = state.board;
    playMove(state, 18);
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
  });
});

// Helper: aplica una lista de índices alternando jugadores desde el estado
// inicial (asume que cada jugada es legal en su momento).
function jugarSecuencia(indices: number[]) {
  return indices.reduce((s, i) => playMove(s, i), createInitialState());
}

describe('playMove — fin de partida', () => {
  it('gana el jugador que coloca la última ficha (rival sin jugada legal)', () => {
    // Construimos un board donde solo queda UNA casilla legal (la 35) y es el
    // turno del jugador 1. Al jugarla, el jugador 2 se queda sin nada → gana 1.
    const board: CellValue[] = Array(36).fill(null);
    // Ocupamos casillas de forma que toda casilla vacía salvo la 35 tenga al
    // menos una vecina ocupada. La forma más simple: llenar todo menos la 35
    // y su situación (35 = esquina (5,5); sus vecinas son 28,34,29... ver abajo).
    // Vecinas de (5,5): (4,4)=28, (4,5)=29, (5,4)=34.
    // Para que 35 sea legal, 28/29/34 deben estar vacías; para que NINGUNA otra
    // casilla vacía sea legal, cada una debe tener una vecina ocupada.
    // Dejamos vacías: 28,29,34,35. Ocupamos el resto (con cualquier color;
    // el color de las fichas previas no afecta la legalidad).
    for (let i = 0; i < 36; i++) {
      if (![28, 29, 34, 35].includes(i)) board[i] = 1;
    }
    // Ahora: casillaLegal(28)? vecinas incluyen 21,22,23,27,29,33,34,35.
    // 21,22,23,27,33 están ocupadas → 28 NO es legal. Igual 29 y 34.
    // 35: vecinas 28,29,34 → todas vacías → 35 SÍ es legal.
    expect(casillaLegal(board, 35)).toBe(true);
    expect(casillaLegal(board, 28)).toBe(false);
    expect(casillaLegal(board, 29)).toBe(false);
    expect(casillaLegal(board, 34)).toBe(false);

    const state: ObstruccionState = {
      board,
      currentPlayer: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const resultado = playMove(state, 35);
    expect(resultado.status).toBe('won');
    expect(resultado.winner).toBe(1);
    expect(resultado.currentPlayer).toBe(1); // no alterna al ganar
    expect(resultado.lastMove).toBe(35);
  });

  it('mientras quede una casilla legal para el rival, la partida sigue y el turno alterna', () => {
    const state = jugarSecuencia([0]); // jugador 1 en la esquina; quedan muchas legales
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(2);
  });

  it('no permite más jugadas tras ganar', () => {
    const board: CellValue[] = Array(36).fill(null);
    for (let i = 0; i < 36; i++) {
      if (![28, 29, 34, 35].includes(i)) board[i] = 1;
    }
    const ganado = playMove(
      { board, currentPlayer: 1, status: 'playing', winner: null, lastMove: null },
      35,
    );
    expect(ganado.status).toBe('won');
    // intentar jugar 28 (que además está bloqueada) no cambia nada
    expect(playMove(ganado, 28)).toBe(ganado);
  });

  it('la primera jugada de la partida nunca termina el juego', () => {
    const state = playMove(createInitialState(), 18);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
  });
});
