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

export function tocaLados(
  cells: number[],
  size: BoardSize
): { izq: boolean; der: boolean; inf: boolean } {
  let izq = false;
  let der = false;
  let inf = false;
  for (const i of cells) {
    const { r, c } = coordsOf(i);
    if (c === 0) izq = true;
    if (c === r) der = true;
    if (r === size - 1) inf = true;
  }
  return { izq, der, inf };
}

export function playMove(state: YState, index: number): YState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index, state.size)) return state;
  if (state.board[index] !== null) return state;

  const player = state.currentPlayer;
  const board = [...state.board];
  board[index] = player;

  // Flood-fill BFS desde la ficha recién colocada, solo por celdas de `player`.
  const componente: number[] = [];
  const visitado = new Set<number>([index]);
  const cola: number[] = [index];
  while (cola.length > 0) {
    const actual = cola.shift()!;
    componente.push(actual);
    for (const vecino of getNeighbors(actual, state.size)) {
      if (board[vecino] === player && !visitado.has(vecino)) {
        visitado.add(vecino);
        cola.push(vecino);
      }
    }
  }

  const { izq, der, inf } = tocaLados(componente, state.size);
  if (izq && der && inf) {
    return {
      ...state,
      board,
      status: 'won',
      winner: player,
      winningCells: componente,
      lastMove: index,
    };
  }

  return {
    ...state,
    board,
    currentPlayer: player === 1 ? 2 : 1,
    lastMove: index,
  };
}
