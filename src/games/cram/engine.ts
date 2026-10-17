export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

/** Par de casillas que cubre un dominó. El motor lo normaliza a a < b. */
export interface Move {
  a: number;
  b: number;
}

export interface CramState {
  board: CellValue[];
  /** Dominós colocados, en orden. Con ambas orientaciones libres el tablero
   *  por sí solo no basta para reconstruirlos (un 2×2 admite dos
   *  emparejamientos), así que el estado los guarda. */
  dominos: Move[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: Move | null;
}

export const TAMANO = 6;
const TOTAL = TAMANO * TAMANO;

export function createInitialState(): CramState {
  return {
    board: Array<CellValue>(TOTAL).fill(null),
    dominos: [],
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const { a, b } = payload as Record<string, unknown>;
  return (
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isInteger(a) &&
    Number.isInteger(b) &&
    a >= 0 &&
    a < TOTAL &&
    b >= 0 &&
    b < TOTAL &&
    a !== b
  );
}

/**
 * Dominós legales que incluyen la casilla `ancla`: hasta 4 (arriba, abajo,
 * izquierda, derecha). Cada Move normalizado a a < b. Devuelve [] si `ancla`
 * está ocupada o fuera de rango.
 */
export function dominosLegalesEn(board: CellValue[], ancla: number): Move[] {
  if (ancla < 0 || ancla >= TOTAL || board[ancla] !== null) return [];
  const fila = Math.floor(ancla / TAMANO);
  const col = ancla % TAMANO;
  const candidatos: Move[] = [];
  if (fila > 0) candidatos.push({ a: ancla - TAMANO, b: ancla });
  if (col > 0) candidatos.push({ a: ancla - 1, b: ancla });
  if (col < TAMANO - 1) candidatos.push({ a: ancla, b: ancla + 1 });
  if (fila < TAMANO - 1) candidatos.push({ a: ancla, b: ancla + TAMANO });
  return candidatos.filter(m => board[m.a] === null && board[m.b] === null);
}

function esFormaLegal(a: number, b: number): boolean {
  return (
    b - a === TAMANO ||
    (b - a === 1 && Math.floor(a / TAMANO) === Math.floor(b / TAMANO))
  );
}

export function tieneJugadaLegal(board: CellValue[]): boolean {
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] !== null) continue;
    if (i % TAMANO < TAMANO - 1 && board[i + 1] === null) return true;
    if (i + TAMANO < TOTAL && board[i + TAMANO] === null) return true;
  }
  return false;
}

export function playMove(state: CramState, move: Move): CramState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(move)) return state;

  const a = Math.min(move.a, move.b);
  const b = Math.max(move.a, move.b);

  if (!esFormaLegal(a, b)) return state;
  if (state.board[a] !== null || state.board[b] !== null) return state;

  const board = [...state.board];
  board[a] = state.currentPlayer;
  board[b] = state.currentPlayer;
  const dominos = [...state.dominos, { a, b }];

  // Gana quien hace la última jugada: el rival se queda sin dónde colocar.
  if (!tieneJugadaLegal(board)) {
    return {
      board,
      dominos,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      lastMove: { a, b },
    };
  }

  return {
    board,
    dominos,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove: { a, b },
  };
}
