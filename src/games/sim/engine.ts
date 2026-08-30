export type Vertex = 0 | 1 | 2 | 3 | 4 | 5;
export type Player = 1 | 2;
export type SimStatus = 'playing' | 'finished';

export interface Edge {
  u: Vertex;
  v: Vertex;
}

export interface SimState {
  edges: (Player | null)[];
  currentPlayer: Player;
  status: SimStatus;
  winner: Player | null;
  loser: Player | null;
  losingTriangle: [Vertex, Vertex, Vertex] | null;
  moveHistory: Edge[];
}

export const TOTAL_VERTICES = 6;
export const TOTAL_EDGES = 15;

/**
 * Mapeo canónico para un par de vértices (u, v) a un índice 0..14.
 * Para u < v:
 * fila u=0: (0,1)->0, (0,2)->1, (0,3)->2, (0,4)->3, (0,5)->4 (5 aristas)
 * fila u=1: (1,2)->5, (1,3)->6, (1,4)->7, (1,5)->8          (4 aristas)
 * fila u=2: (2,3)->9, (2,4)->10, (2,5)->11                  (3 aristas)
 * fila u=3: (3,4)->12, (3,5)->13                            (2 aristas)
 * fila u=4: (4,5)->14                                       (1 arista)
 */
export function getEdgeIndex(u: number, v: number): number {
  const min = Math.min(u, v);
  const max = Math.max(u, v);
  // Fórmula: sum_{i=0}^{min-1} (TOTAL_VERTICES - 1 - i) + (max - min - 1)
  let index = 0;
  for (let i = 0; i < min; i++) {
    index += TOTAL_VERTICES - 1 - i;
  }
  return index + (max - min - 1);
}

export function getEdgeFromIndex(index: number): Edge {
  let count = 0;
  for (let u = 0; u < TOTAL_VERTICES; u++) {
    const rowCount = TOTAL_VERTICES - 1 - u;
    if (index < count + rowCount) {
      const offset = index - count;
      const v = u + 1 + offset;
      return { u: u as Vertex, v: v as Vertex };
    }
    count += rowCount;
  }
  throw new Error(`Índice de arista fuera de rango: ${index}`);
}

export function getAllEdges(): Edge[] {
  const edges: Edge[] = [];
  for (let i = 0; i < TOTAL_EDGES; i++) {
    edges.push(getEdgeFromIndex(i));
  }
  return edges;
}

export function createInitialState(): SimState {
  return {
    edges: Array<Player | null>(TOTAL_EDGES).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    loser: null,
    losingTriangle: null,
    moveHistory: [],
  };
}

export function esEdgeValido(payload: unknown): payload is Edge {
  if (!payload || typeof payload !== 'object') return false;
  const { u, v } = payload as Record<string, unknown>;
  return (
    typeof u === 'number' &&
    typeof v === 'number' &&
    Number.isInteger(u) &&
    Number.isInteger(v) &&
    u >= 0 &&
    u < TOTAL_VERTICES &&
    v >= 0 &&
    v < TOTAL_VERTICES &&
    u !== v
  );
}
