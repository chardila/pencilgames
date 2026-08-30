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
  if (index < 0 || index >= TOTAL_EDGES) {
    throw new Error(`Índice de arista fuera de rango: ${index}`);
  }
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

export function playMove(state: SimState, edge: Edge): SimState {
  if (state.status !== 'playing') return state;
  if (!esEdgeValido(edge)) return state;

  const u = Math.min(edge.u, edge.v) as Vertex;
  const v = Math.max(edge.u, edge.v) as Vertex;
  const edgeIndex = getEdgeIndex(u, v);

  if (state.edges[edgeIndex] !== null) return state;

  const player = state.currentPlayer;
  const newEdges = [...state.edges];
  newEdges[edgeIndex] = player;

  // Inspeccionar si se completó un triángulo monocromático con un tercer vértice w
  let fatalTriangle: [Vertex, Vertex, Vertex] | null = null;
  for (let w = 0; w < TOTAL_VERTICES; w++) {
    if (w === u || w === v) continue;
    const edgeUW = newEdges[getEdgeIndex(u, w)];
    const edgeVW = newEdges[getEdgeIndex(v, w)];
    if (edgeUW === player && edgeVW === player) {
      fatalTriangle = [u, v, w as Vertex];
      break;
    }
  }

  const normalizedEdge: Edge = { u, v };

  if (fatalTriangle !== null) {
    return {
      edges: newEdges,
      currentPlayer: player,
      status: 'finished',
      loser: player,
      winner: player === 1 ? 2 : 1,
      losingTriangle: fatalTriangle,
      moveHistory: [...state.moveHistory, normalizedEdge],
    };
  }

  return {
    edges: newEdges,
    currentPlayer: player === 1 ? 2 : 1,
    status: 'playing',
    loser: null,
    winner: null,
    losingTriangle: null,
    moveHistory: [...state.moveHistory, normalizedEdge],
  };
}
