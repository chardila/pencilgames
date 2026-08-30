export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won' | 'draw';

export interface GomokuState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningLine: number[] | null;
  lastMove: number | null;
}

export const TAMANO = 9;
export const PARA_GANAR = 5;
const TOTAL = TAMANO * TAMANO;

export function createInitialState(): GomokuState {
  return {
    board: Array<CellValue>(TOTAL).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    winningLine: null,
    lastMove: null,
  };
}

export function esJugadaValida(payload: unknown): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < TOTAL
  );
}

const DIRECCIONES: ReadonlyArray<readonly [number, number]> = [
  [1, 0], // horizontal
  [0, 1], // vertical
  [1, 1], // diagonal ↘
  [1, -1], // diagonal ↗
];

function rachaGanadora(
  board: CellValue[],
  index: number,
  player: Player
): number[] | null {
  const fila = Math.floor(index / TAMANO);
  const col = index % TAMANO;

  for (const [df, dc] of DIRECCIONES) {
    const linea = [index];

    // hacia atrás
    let f = fila - df;
    let c = col - dc;
    while (
      f >= 0 &&
      f < TAMANO &&
      c >= 0 &&
      c < TAMANO &&
      board[f * TAMANO + c] === player
    ) {
      linea.unshift(f * TAMANO + c);
      f -= df;
      c -= dc;
    }

    // hacia adelante
    f = fila + df;
    c = col + dc;
    while (
      f >= 0 &&
      f < TAMANO &&
      c >= 0 &&
      c < TAMANO &&
      board[f * TAMANO + c] === player
    ) {
      linea.push(f * TAMANO + c);
      f += df;
      c += dc;
    }

    if (linea.length >= PARA_GANAR) return linea;
  }

  return null;
}

export function playMove(state: GomokuState, index: number): GomokuState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (state.board[index] !== null) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  const winningLine = rachaGanadora(board, index, state.currentPlayer);
  if (winningLine) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      winningLine,
      lastMove: index,
    };
  }

  if (board.every(cell => cell !== null)) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'draw',
      winner: null,
      winningLine: null,
      lastMove: index,
    };
  }

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    winningLine: null,
    lastMove: index,
  };
}
