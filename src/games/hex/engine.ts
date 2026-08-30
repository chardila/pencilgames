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

export function findWinningPath(
  board: CellValue[],
  size: BoardSize,
  player: Player
): number[] | null {
  const queue: number[] = [];
  const visited = new Set<number>();
  const parentMap = new Map<number, number | null>();

  // Definir nodos iniciales y condición de meta según el jugador
  if (player === 1) {
    // Jugador 1: inicia en fila 0, busca llegar a fila size - 1
    for (let c = 0; c < size; c++) {
      const index = c;
      if (board[index] === 1) {
        queue.push(index);
        visited.add(index);
        parentMap.set(index, null);
      }
    }
  } else {
    // Jugador 2: inicia en col 0, busca llegar a col size - 1
    for (let r = 0; r < size; r++) {
      const index = r * size;
      if (board[index] === 2) {
        queue.push(index);
        visited.add(index);
        parentMap.set(index, null);
      }
    }
  }

  let goalNode: number | null = null;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const r = Math.floor(current / size);
    const c = current % size;

    if (player === 1 && r === size - 1) {
      goalNode = current;
      break;
    }
    if (player === 2 && c === size - 1) {
      goalNode = current;
      break;
    }

    for (const neighbor of getNeighbors(current, size)) {
      if (board[neighbor] === player && !visited.has(neighbor)) {
        visited.add(neighbor);
        parentMap.set(neighbor, current);
        queue.push(neighbor);
      }
    }
  }

  if (goalNode === null) return null;

  // Reconstruir camino desde la meta hasta el inicio
  const path: number[] = [];
  let curr: number | null = goalNode;
  while (curr !== null) {
    path.push(curr);
    curr = parentMap.get(curr) ?? null;
  }

  return path.reverse();
}

export function playMove(state: HexState, index: number): HexState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index, state.size)) return state;
  if (state.board[index] !== null) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;

  const winningPath = findWinningPath(board, state.size, state.currentPlayer);

  if (winningPath !== null) {
    return {
      ...state,
      board,
      status: 'won',
      winner: state.currentPlayer,
      winningPath,
      lastMove: index,
    };
  }

  return {
    ...state,
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    lastMove: index,
  };
}

