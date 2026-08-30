export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';
export type BoardSize = 5 | 7 | 9;

export interface HexState {
  size: BoardSize;
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningPath: number[] | null;
  lastMove: number | null;
}

const HEX_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],  // Noroeste
  [-1, 1],  // Noreste
  [0, -1],  // Oeste
  [0, 1],   // Este
  [1, -1],  // Suroeste
  [1, 0],   // Sureste
];

export function createInitialState(size: BoardSize = 7): HexState {
  return {
    size,
    board: Array<CellValue>(size * size).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    winningPath: null,
    lastMove: null,
  };
}

export function esJugadaValida(payload: unknown, size: BoardSize = 7): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < size * size
  );
}

export function getNeighbors(index: number, size: BoardSize): number[] {
  const r = Math.floor(index / size);
  const c = index % size;
  const neighbors: number[] = [];

  for (const [dr, dc] of HEX_DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      neighbors.push(nr * size + nc);
    }
  }

  return neighbors;
}

export function playMove(state: HexState, index: number): HexState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index, state.size)) return state;
  if (state.board[index] !== null) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  return {
    ...state,
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    lastMove: index,
  };
}
