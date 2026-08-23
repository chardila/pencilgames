export type Player = 'X' | 'O';
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won' | 'draw';

export interface TresEnRayaState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningLine: number[] | null;
}

const WINNING_LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function esJugadaValida(payload: unknown): payload is number {
  return typeof payload === 'number' && Number.isInteger(payload) && payload >= 0 && payload <= 8;
}

export function createInitialState(): TresEnRayaState {
  return {
    board: Array(9).fill(null),
    currentPlayer: 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
  };
}

export function playMove(state: TresEnRayaState, index: number): TresEnRayaState {
  if (state.status !== 'playing') return state;
  if (index < 0 || index > 8) return state;
  if (state.board[index] !== null) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  const winningLine = findWinningLine(board, state.currentPlayer);
  if (winningLine) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      winningLine,
    };
  }

  if (board.every(cell => cell !== null)) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'draw',
      winner: null,
      winningLine: null,
    };
  }

  return {
    board,
    currentPlayer: state.currentPlayer === 'X' ? 'O' : 'X',
    status: 'playing',
    winner: null,
    winningLine: null,
  };
}

function findWinningLine(board: CellValue[], player: Player): number[] | null {
  for (const line of WINNING_LINES) {
    if (line.every(i => board[i] === player)) return line;
  }
  return null;
}
