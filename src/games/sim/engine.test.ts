import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  getEdgeIndex,
  getEdgeFromIndex,
  getAllEdges,
  esEdgeValido,
  TOTAL_VERTICES,
  TOTAL_EDGES,
} from './engine';

describe('createInitialState', () => {
  it('inicializa con 15 aristas vacías, turno del jugador 1 y sin ganador', () => {
    const state = createInitialState();
    expect(state.edges).toHaveLength(TOTAL_EDGES);
    expect(state.edges.every(edge => edge === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.loser).toBeNull();
    expect(state.losingTriangle).toBeNull();
    expect(state.moveHistory).toEqual([]);
  });
});

describe('Indexación canónica de aristas', () => {
  it('asigna un índice entre 0 y 14 a cada par de vértices u != v', () => {
    const indices = new Set<number>();
    for (let u = 0; u < TOTAL_VERTICES; u++) {
      for (let v = u + 1; v < TOTAL_VERTICES; v++) {
        const idx = getEdgeIndex(u, v);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(TOTAL_EDGES);
        indices.add(idx);
      }
    }
    expect(indices.size).toBe(TOTAL_EDGES);
  });

  it('es simétrico: getEdgeIndex(u, v) === getEdgeIndex(v, u)', () => {
    for (let u = 0; u < TOTAL_VERTICES; u++) {
      for (let v = 0; v < TOTAL_VERTICES; v++) {
        if (u === v) continue;
        expect(getEdgeIndex(u, v)).toBe(getEdgeIndex(v, u));
      }
    }
  });

  it('getEdgeFromIndex es la inversa de getEdgeIndex con u < v', () => {
    for (let i = 0; i < TOTAL_EDGES; i++) {
      const edge = getEdgeFromIndex(i);
      expect(edge.u).toBeLessThan(edge.v);
      expect(getEdgeIndex(edge.u, edge.v)).toBe(i);
    }
  });

  it('getAllEdges devuelve las 15 aristas canónicas', () => {
    const edges = getAllEdges();
    expect(edges).toHaveLength(TOTAL_EDGES);
    for (const edge of edges) {
      expect(edge.u).toBeLessThan(edge.v);
    }
  });
});

describe('esEdgeValido', () => {
  it('acepta objetos Edge válidos con u y v entre 0 y 5 con u != v', () => {
    expect(esEdgeValido({ u: 0, v: 1 })).toBe(true);
    expect(esEdgeValido({ u: 5, v: 0 })).toBe(true);
    expect(esEdgeValido({ u: 2, v: 4 })).toBe(true);
  });

  it('rechaza aristas con u === v, fuera de rango o tipos incorrectos', () => {
    expect(esEdgeValido({ u: 0, v: 0 })).toBe(false);
    expect(esEdgeValido({ u: -1, v: 2 })).toBe(false);
    expect(esEdgeValido({ u: 2, v: 6 })).toBe(false);
    expect(esEdgeValido({ u: 1.5, v: 2 })).toBe(false);
    expect(esEdgeValido({ u: '0', v: '1' })).toBe(false);
    expect(esEdgeValido(null)).toBe(false);
    expect(esEdgeValido(undefined)).toBe(false);
    expect(esEdgeValido({})).toBe(false);
    expect(esEdgeValido(12)).toBe(false);
  });
});
