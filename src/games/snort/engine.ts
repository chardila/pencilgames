export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

export interface SnortState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: number | null;
}

export const TAMANO = 6;
const TOTAL = TAMANO * TAMANO;

const otro = (p: Player): Player => (p === 1 ? 2 : 1);

export function createInitialState(): SnortState {
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

/** Casillas ortogonalmente contiguas a `index`, sin salirse del tablero. */
export function vecinas(index: number): number[] {
  const fila = Math.floor(index / TAMANO);
  const col = index % TAMANO;
  const res: number[] = [];
  if (fila > 0) res.push(index - TAMANO);
  if (col > 0) res.push(index - 1);
  if (col < TAMANO - 1) res.push(index + 1);
  if (fila < TAMANO - 1) res.push(index + TAMANO);
  return res;
}

/** Legal si está vacía y ninguna vecina es del rival (las propias valen). */
export function casillaLegal(board: CellValue[], index: number, player: Player): boolean {
  if (index < 0 || index >= TOTAL || board[index] !== null) return false;
  const rival = otro(player);
  return vecinas(index).every(v => board[v] !== rival);
}

export function tieneJugadaLegal(board: CellValue[], player: Player): boolean {
  for (let i = 0; i < TOTAL; i++) {
    if (casillaLegal(board, i, player)) return true;
  }
  return false;
}

export function playMove(state: SnortState, index: number): SnortState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (!casillaLegal(state.board, index, state.currentPlayer)) return state;

  const board = [...state.board];
  board[index] = state.currentPlayer;
  const siguiente = otro(state.currentPlayer);

  // Pierde quien se queda sin jugada en su turno: si el rival no puede
  // colocar, gana quien acaba de jugar.
  if (!tieneJugadaLegal(board, siguiente)) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      lastMove: index,
    };
  }

  return {
    board,
    currentPlayer: siguiente,
    status: 'playing',
    winner: null,
    lastMove: index,
  };
}
