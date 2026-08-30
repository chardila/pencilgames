export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';

/** Par de casillas que cubre un dominó. El motor lo normaliza a a < b. */
export interface Move {
  a: number;
  b: number;
}

export interface DomineeringState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: Move | null;
}

export const TAMANO = 8;
const TOTAL = TAMANO * TAMANO;

export function createInitialState(): DomineeringState {
  return {
    board: Array<CellValue>(TOTAL).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

export function orientacionDe(player: Player): 'vertical' | 'horizontal' {
  return player === 1 ? 'vertical' : 'horizontal';
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
 * Dominós legales de la orientación de `player` que incluyen la casilla
 * `ancla`. Máximo 2 (vertical: arriba/abajo; horizontal: izquierda/derecha).
 * Cada Move normalizado a a < b. Devuelve [] si `ancla` está ocupada o fuera
 * de rango.
 */
export function dominosLegalesEn(
  board: CellValue[],
  player: Player,
  ancla: number,
): Move[] {
  if (ancla < 0 || ancla >= TOTAL || board[ancla] !== null) return [];
  const fila = Math.floor(ancla / TAMANO);
  const col = ancla % TAMANO;
  const candidatos: Move[] = [];
  if (orientacionDe(player) === 'vertical') {
    if (fila > 0) candidatos.push({ a: ancla - TAMANO, b: ancla });
    if (fila < TAMANO - 1) candidatos.push({ a: ancla, b: ancla + TAMANO });
  } else {
    if (col > 0) candidatos.push({ a: ancla - 1, b: ancla });
    if (col < TAMANO - 1) candidatos.push({ a: ancla, b: ancla + 1 });
  }
  return candidatos.filter(m => board[m.a] === null && board[m.b] === null);
}

/**
 * Reconstruye la lista de dominós colocados a partir del tablero. Recorre en
 * orden ascendente y empareja cada casilla no consumida con su compañero
 * "hacia adelante" según la orientación del jugador dueño (abajo si es
 * vertical, derecha si es horizontal). Como los dominós nunca se solapan y
 * la casilla "cabeza" (superior/izquierda) siempre se procesa antes, el
 * emparejamiento es único.
 */
export function dominosEnTablero(board: CellValue[]): Move[] {
  const consumidas = new Set<number>();
  const dominos: Move[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === null || consumidas.has(i)) continue;
    const jugador = board[i];
    const companero = jugador === 1 ? i + TAMANO : i + 1;
    if (companero < TOTAL && board[companero] === jugador && !consumidas.has(companero)) {
      consumidas.add(i);
      consumidas.add(companero);
      dominos.push({ a: i, b: companero });
    }
  }
  return dominos;
}

function esFormaLegal(a: number, b: number, player: Player): boolean {
  if (orientacionDe(player) === 'vertical') {
    return b - a === TAMANO;
  }
  return b - a === 1 && Math.floor(a / TAMANO) === Math.floor(b / TAMANO);
}

export function playMove(state: DomineeringState, move: Move): DomineeringState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(move)) return state;

  const a = Math.min(move.a, move.b);
  const b = Math.max(move.a, move.b);

  if (!esFormaLegal(a, b, state.currentPlayer)) return state;
  if (state.board[a] !== null || state.board[b] !== null) return state;

  const board = [...state.board];
  board[a] = state.currentPlayer;
  board[b] = state.currentPlayer;

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove: { a, b },
  };
}
