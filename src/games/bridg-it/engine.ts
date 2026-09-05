export type Player = 1 | 2;
export type EdgeDir = 'h' | 'v';

export interface Edge {
  type: EdgeDir;
  row: number;
  col: number;
}

export interface BridgItState {
  redH: boolean[][];  // [6][5]  R(r,c)-R(r,c+1)
  redV: boolean[][];  // [5][6]  R(r,c)-R(r+1,c)
  blueH: boolean[][]; // [5][4]  B(r,c)-B(r,c+1)
  blueV: boolean[][]; // [4][5]  B(r,c)-B(r+1,c)
  currentPlayer: Player;
  status: 'playing' | 'won';
  winner: Player | null;
  winningPath: Array<{ r: number; c: number }> | null;
  lastMove: { player: Player; edge: Edge } | null;
}

function crearMatriz(filas: number, columnas: number): boolean[][] {
  return Array.from({ length: filas }, () => Array<boolean>(columnas).fill(false));
}

export function createInitialState(): BridgItState {
  return {
    redH: crearMatriz(6, 5),
    redV: crearMatriz(5, 6),
    blueH: crearMatriz(5, 4),
    blueV: crearMatriz(4, 5),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    winningPath: null,
    lastMove: null,
  };
}

export function slotAToEdge(player: Player, r: number, c: number): Edge | null {
  if (player === 1) {
    if (r < 0 || r > 5 || c < 0 || c > 4) return null;
    return { type: 'h', row: r, col: c };
  }
  const br = r - 1;
  if (br < 0 || br > 3 || c < 0 || c > 4) return null;
  return { type: 'v', row: br, col: c };
}

export function slotBToEdge(player: Player, r: number, c: number): Edge | null {
  if (player === 1) {
    if (r < 0 || r > 4 || c < 0 || c > 5) return null;
    return { type: 'v', row: r, col: c };
  }
  const bc = c - 1;
  if (r < 0 || r > 4 || bc < 0 || bc > 3) return null;
  return { type: 'h', row: r, col: bc };
}

export function getSlotAStatus(
  state: BridgItState,
  r: number,
  c: number
): { drawn: boolean; owner: Player | null } {
  if (state.redH[r]?.[c]) return { drawn: true, owner: 1 };
  const br = r - 1;
  if (br >= 0 && br <= 3 && state.blueV[br]?.[c]) return { drawn: true, owner: 2 };
  return { drawn: false, owner: null };
}

export function getSlotBStatus(
  state: BridgItState,
  r: number,
  c: number
): { drawn: boolean; owner: Player | null } {
  if (state.redV[r]?.[c]) return { drawn: true, owner: 1 };
  const bc = c - 1;
  if (bc >= 0 && bc <= 3 && state.blueH[r]?.[bc]) return { drawn: true, owner: 2 };
  return { drawn: false, owner: null };
}

function enRangoPropio(player: Player, edge: Edge): boolean {
  if (player === 1) {
    return edge.type === 'h'
      ? edge.row >= 0 && edge.row <= 5 && edge.col >= 0 && edge.col <= 4
      : edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 5;
  }
  return edge.type === 'h'
    ? edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 3
    : edge.row >= 0 && edge.row <= 3 && edge.col >= 0 && edge.col <= 4;
}

function tieneArista(state: BridgItState, player: Player, edge: Edge): boolean {
  const matriz =
    player === 1
      ? edge.type === 'h'
        ? state.redH
        : state.redV
      : edge.type === 'h'
        ? state.blueH
        : state.blueV;
  return matriz[edge.row]?.[edge.col] ?? false;
}

// Dada la arista de `player`, retorna la arista del rival que cruza (o null
// si esa posición cae en un borde donde el rival no tiene ninguna arista
// posible ahí).
function aristaCruzada(player: Player, edge: Edge): Edge | null {
  if (player === 1) {
    if (edge.type === 'h') {
      const br = edge.row - 1;
      return br < 0 || br > 3 ? null : { type: 'v', row: br, col: edge.col };
    }
    const bc = edge.col - 1;
    return bc < 0 || bc > 3 ? null : { type: 'h', row: edge.row, col: bc };
  }
  return edge.type === 'h'
    ? { type: 'v', row: edge.row, col: edge.col + 1 }
    : { type: 'h', row: edge.row + 1, col: edge.col };
}

export function puedeJugar(state: BridgItState, edge: Edge): boolean {
  if (state.status !== 'playing') return false;
  if (!enRangoPropio(state.currentPlayer, edge)) return false;
  if (tieneArista(state, state.currentPlayer, edge)) return false;
  const cruzada = aristaCruzada(state.currentPlayer, edge);
  const rival = state.currentPlayer === 1 ? 2 : 1;
  if (cruzada && tieneArista(state, rival, cruzada)) return false;
  return true;
}

export function esJugadaValida(payload: unknown): payload is Edge {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidato = payload as Record<string, unknown>;
  return (
    (candidato.type === 'h' || candidato.type === 'v') &&
    typeof candidato.row === 'number' &&
    Number.isInteger(candidato.row) &&
    candidato.row >= 0 &&
    typeof candidato.col === 'number' &&
    Number.isInteger(candidato.col) &&
    candidato.col >= 0
  );
}
