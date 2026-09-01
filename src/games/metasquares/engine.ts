export type Player = 1 | 2;
export type Cell = number; // 0..48, fila*7+col

export interface Square {
  corners: [Cell, Cell, Cell, Cell]; // ordenadas ascendentemente
}

export interface ClaimedSquare {
  player: Player;
  corners: [Cell, Cell, Cell, Cell];
}

export type Status =
  | { kind: 'playing' }
  | { kind: 'won'; winner: Player }
  | { kind: 'draw' };

export interface MetaSquaresState {
  board: (Player | null)[]; // longitud 49
  currentPlayer: Player;
  scores: Record<Player, number>;
  claimed: ClaimedSquare[];
  lastMove: Cell | null;
  status: Status;
}

export type Move = { celda: Cell };

export const TAMANO = 7;
export const OBJETIVO = 5;
const TOTAL = TAMANO * TAMANO;

/**
 * Todos los cuadrados perfectos (axis-aligned e inclinados) cuyas 4 esquinas
 * caen en la retícula 7×7. Se enumera por ancla + vector de borde y se
 * canonicaliza por la tupla ordenada de índices de celda para no contar dos
 * veces el mismo cuadrado (el vector (1,2) y el (2,1) generan el mismo).
 */
function enumerarCuadrados(): Square[] {
  const vistos = new Map<string, Square>();
  for (let dx = 1; dx < TAMANO; dx++) {
    for (let dy = 0; dy < TAMANO; dy++) {
      for (let x = 0; x < TAMANO; x++) {
        for (let y = 0; y < TAMANO; y++) {
          const pts: [number, number][] = [
            [x, y],
            [x + dx, y + dy],
            [x + dx - dy, y + dy + dx],
            [x - dy, y + dx],
          ];
          if (
            pts.some(
              ([px, py]) => px < 0 || px >= TAMANO || py < 0 || py >= TAMANO,
            )
          ) {
            continue;
          }
          const celdas = pts.map(([px, py]) => py * TAMANO + px);
          const ordenadas = [...celdas].sort((a, b) => a - b) as [
            Cell,
            Cell,
            Cell,
            Cell,
          ];
          const clave = ordenadas.join(',');
          if (!vistos.has(clave)) vistos.set(clave, { corners: ordenadas });
        }
      }
    }
  }
  return [...vistos.values()];
}

export const TODOS_LOS_CUADRADOS: readonly Square[] = enumerarCuadrados();

export function createInitialState(): MetaSquaresState {
  return {
    board: Array<Player | null>(TOTAL).fill(null),
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    claimed: [],
    lastMove: null,
    status: { kind: 'playing' },
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.celda === 'number' &&
    Number.isInteger(p.celda) &&
    p.celda >= 0 &&
    p.celda < TOTAL
  );
}

export function movimientosLegales(state: MetaSquaresState): Cell[] {
  if (state.status.kind !== 'playing') return [];
  const celdas: Cell[] = [];
  for (let i = 0; i < TOTAL; i++) if (state.board[i] === null) celdas.push(i);
  return celdas;
}
