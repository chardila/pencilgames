export type CellValue = 'X' | null;
export type GameStatus = 'playing' | 'won';
export type Player = 1 | 2;

export interface Move {
  board: number;
  cell: number;
}

export interface NotaktoState {
  boards: CellValue[][];
  deadBoards: boolean[];
  deadLines: (number[] | null)[];
  currentPlayer: Player;
  status: GameStatus;
  loser: Player | null;
  winner: Player | null;
}

const NUM_BOARDS = 3;

// Las 8 líneas ganadoras de un tablero 3×3: 3 filas, 3 columnas, 2 diagonales.
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

export function createInitialState(): NotaktoState {
  return {
    boards: Array.from({ length: NUM_BOARDS }, () => Array<CellValue>(9).fill(null)),
    deadBoards: Array<boolean>(NUM_BOARDS).fill(false),
    deadLines: Array<number[] | null>(NUM_BOARDS).fill(null),
    currentPlayer: 1,
    status: 'playing',
    loser: null,
    winner: null,
  };
}

function esEnteroEnRango(valor: unknown, min: number, max: number): boolean {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= min && valor <= max;
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (typeof payload !== 'object' || payload === null) return false;
  const m = payload as Record<string, unknown>;
  return esEnteroEnRango(m.board, 0, NUM_BOARDS - 1) && esEnteroEnRango(m.cell, 0, 8);
}

function lineaGanadora(board: CellValue[]): number[] | null {
  for (const linea of WINNING_LINES) {
    if (linea.every(i => board[i] === 'X')) return linea;
  }
  return null;
}

export function playMove(state: NotaktoState, move: Move): NotaktoState {
  if (state.status !== 'playing') return state;

  const { board, cell } = move;
  if (!esEnteroEnRango(board, 0, NUM_BOARDS - 1)) return state;
  if (!esEnteroEnRango(cell, 0, 8)) return state;
  if (state.deadBoards[board]) return state;
  if (state.boards[board][cell] !== null) return state;

  const boards = state.boards.map((b, i) => (i === board ? [...b] : b));
  boards[board][cell] = 'X';

  const deadBoards = [...state.deadBoards];
  const deadLines = [...state.deadLines];

  const linea = lineaGanadora(boards[board]);
  if (linea) {
    deadBoards[board] = true;
    deadLines[board] = linea;
  }

  if (deadBoards.every(Boolean)) {
    return {
      boards,
      deadBoards,
      deadLines,
      currentPlayer: state.currentPlayer,
      status: 'won',
      loser: state.currentPlayer,
      winner: state.currentPlayer === 1 ? 2 : 1,
    };
  }

  return {
    boards,
    deadBoards,
    deadLines,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    loser: null,
    winner: null,
  };
}
