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
