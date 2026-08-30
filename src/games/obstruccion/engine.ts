export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

export interface ObstruccionState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: number | null;
}

export const TAMANO = 6;
const TOTAL = TAMANO * TAMANO;

// Los 8 desplazamientos ortogonales + diagonales, en (df, dc).
const VECINDAD: ReadonlyArray<readonly [number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1], [0, 1],
  [1, -1], [1, 0], [1, 1],
];

export function createInitialState(): ObstruccionState {
  return {
    board: Array<CellValue>(TOTAL).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
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

export function casillaLegal(board: CellValue[], index: number): boolean {
  if (board[index] !== null) return false;
  const fila = Math.floor(index / TAMANO);
  const col = index % TAMANO;
  for (const [df, dc] of VECINDAD) {
    const f = fila + df;
    const c = col + dc;
    if (f < 0 || f >= TAMANO || c < 0 || c >= TAMANO) continue;
    if (board[f * TAMANO + c] !== null) return false;
  }
  return true;
}

export function playMove(state: ObstruccionState, index: number): ObstruccionState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (!casillaLegal(state.board, index)) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove: index,
  };
}
