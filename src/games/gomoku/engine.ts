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

export function playMove(state: GomokuState, index: number): GomokuState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (state.board[index] !== null) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    winningLine: null,
    lastMove: index,
  };
}
