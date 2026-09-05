export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';
export type BoardSize = 7 | 9 | 11;

export interface YState {
  size: BoardSize;
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningCells: number[] | null;
  lastMove: number | null;
}

// 6 direcciones sobre el tablero triangular: [dr, dc]
const Y_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 0],
  [1, 0],
  [1, 1],
];

export function cellCount(size: BoardSize): number {
  return (size * (size + 1)) / 2;
}

export function indexOf(r: number, c: number): number {
  return (r * (r + 1)) / 2 + c;
}

export function coordsOf(index: number): { r: number; c: number } {
  const r = Math.floor((Math.sqrt(8 * index + 1) - 1) / 2);
  const c = index - (r * (r + 1)) / 2;
  return { r, c };
}

export function createInitialState(size: BoardSize = 9): YState {
  return {
    size,
    board: Array<CellValue>(cellCount(size)).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    winningCells: null,
    lastMove: null,
  };
}

export function esJugadaValida(
  payload: unknown,
  size: BoardSize
): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < cellCount(size)
  );
}

export function getNeighbors(index: number, size: BoardSize): number[] {
  const { r, c } = coordsOf(index);
  const neighbors: number[] = [];
  for (const [dr, dc] of Y_DIRECTIONS) {
    const nr = r + dr;
    const nc = c + dc;
    if (nr >= 0 && nr < size && nc >= 0 && nc <= nr) {
      neighbors.push(indexOf(nr, nc));
    }
  }
  return neighbors;
}
