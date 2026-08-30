export type Player = 1 | 2;
export type GameStatus = 'playing' | 'won';

export interface ChompState {
  board: boolean[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastEaten: number[];
  lastMove: number | null;
}

export const FILAS = 4;
export const COLUMNAS = 7;
export const TOTAL_CASILLAS = FILAS * COLUMNAS;
export const INDICE_VENENO = 0;

export function createInitialState(): ChompState {
  return {
    board: Array<boolean>(TOTAL_CASILLAS).fill(true),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastEaten: [],
    lastMove: null,
  };
}

export function esJugadaValida(payload: unknown): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 1 &&
    payload < TOTAL_CASILLAS
  );
}

export function playMove(state: ChompState, index: number): ChompState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (!state.board[index]) return state;

  const targetRow = Math.floor(index / COLUMNAS);
  const targetCol = index % COLUMNAS;

  const newBoard = [...state.board];
  const eaten: number[] = [];

  for (let i = 0; i < TOTAL_CASILLAS; i++) {
    if (!newBoard[i]) continue;
    const r = Math.floor(i / COLUMNAS);
    const c = i % COLUMNAS;
    if (r >= targetRow && c >= targetCol) {
      newBoard[i] = false;
      eaten.push(i);
    }
  }

  const casillasVivas = newBoard.filter(c => c === true).length;

  if (casillasVivas === 1) {
    return {
      board: newBoard,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      lastEaten: eaten,
      lastMove: index,
    };
  }

  return {
    board: newBoard,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastEaten: eaten,
    lastMove: index,
  };
}
