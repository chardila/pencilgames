import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  getEdgeIndex,
  getEdgeFromIndex,
  getAllEdges,
  esEdgeValido,
  playMove,
  TOTAL_VERTICES,
  TOTAL_EDGES,
  type Vertex,
  type Edge,
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
  it('getEdgeFromIndex lanza error para índices fuera de rango', () => {
    expect(() => getEdgeFromIndex(-1)).toThrow();
    expect(() => getEdgeFromIndex(15)).toThrow();
    expect(() => getEdgeFromIndex(100)).toThrow();
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

describe('playMove — jugadas normales y alternancia', () => {
  it('permite al jugador 1 trazar una arista y pasa el turno al jugador 2', () => {
    const initial = createInitialState();
    const next = playMove(initial, { u: 0, v: 1 });
    expect(next.edges[getEdgeIndex(0, 1)]).toBe(1);
    expect(next.currentPlayer).toBe(2);
    expect(next.status).toBe('playing');
    expect(next.moveHistory).toEqual([{ u: 0, v: 1 }]);
  });

  it('permite al jugador 2 trazar otra arista y regresa el turno a 1', () => {
    let state = createInitialState();
    state = playMove(state, { u: 0, v: 1 });
    state = playMove(state, { u: 1, v: 2 });
    expect(state.edges[getEdgeIndex(0, 1)]).toBe(1);
    expect(state.edges[getEdgeIndex(1, 2)]).toBe(2);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
  });

  it('normaliza aristas no ordenadas (ej. { u: 3, v: 1 } -> índice de (1, 3))', () => {
    const state = playMove(createInitialState(), { u: 3 as Vertex, v: 1 as Vertex });
    expect(state.edges[getEdgeIndex(1, 3)]).toBe(1);
    expect(state.currentPlayer).toBe(2);
  });

  it('ignora jugada sobre arista ya ocupada', () => {
    const state1 = playMove(createInitialState(), { u: 0, v: 1 });
    const state2 = playMove(state1, { u: 1, v: 0 });
    expect(state2).toBe(state1);
  });

  it('ignora jugadas inválidas', () => {
    const state = createInitialState();
    expect(playMove(state, { u: 0, v: 0 } as unknown as Edge)).toBe(state);
    expect(playMove(state, { u: 0, v: 9 } as unknown as Edge)).toBe(state);
  });

  it('no muta el objeto state original ni su array edges', () => {
    const initial = createInitialState();
    const edgesRef = initial.edges;
    playMove(initial, { u: 0, v: 1 });
    expect(edgesRef.every(e => e === null)).toBe(true);
    expect(initial.currentPlayer).toBe(1);
  });
});

describe('playMove — detección de triángulo fatal (Regla Sim)', () => {
  it('Jugador 1 pierde inmediatamente al cerrar su propio triángulo (0,1), (1,2), (0,2)', () => {
    let state = createInitialState();
    // J1: (0, 1)
    state = playMove(state, { u: 0, v: 1 });
    // J2: (3, 4)
    state = playMove(state, { u: 3, v: 4 });
    // J1: (1, 2)
    state = playMove(state, { u: 1, v: 2 });
    // J2: (4, 5)
    state = playMove(state, { u: 4, v: 5 });
    // J1: (0, 2) -> Cierra el triángulo (0, 1, 2) todo de color 1!
    state = playMove(state, { u: 0, v: 2 });

    expect(state.status).toBe('finished');
    expect(state.loser).toBe(1);
    expect(state.winner).toBe(2);
    expect(state.losingTriangle).not.toBeNull();
    const sortedTriangle = [...state.losingTriangle!].sort((a, b) => a - b);
    expect(sortedTriangle).toEqual([0, 1, 2]);
  });

  it('Jugador 2 pierde inmediatamente al cerrar su propio triángulo', () => {
    let state = createInitialState();
    // J1: (0, 1)
    state = playMove(state, { u: 0, v: 1 });
    // J2: (2, 3)
    state = playMove(state, { u: 2, v: 3 });
    // J1: (0, 4)
    state = playMove(state, { u: 0, v: 4 });
    // J2: (3, 5)
    state = playMove(state, { u: 3, v: 5 });
    // J1: (1, 5) (evita cerrar triángulo J1 antes de tiempo)
    state = playMove(state, { u: 1, v: 5 });
    // J2: (2, 5) -> Cierra el triángulo (2, 3, 5) todo de color 2!
    state = playMove(state, { u: 2, v: 5 });

    expect(state.status).toBe('finished');
    expect(state.loser).toBe(2);
    expect(state.winner).toBe(1);
    const sortedTriangle = [...state.losingTriangle!].sort((a, b) => a - b);
    expect(sortedTriangle).toEqual([2, 3, 5]);
  });

  it('triángulos con colores mixtos NO provocan derrota', () => {
    let state = createInitialState();
    // J1: (0, 1) [Color 1]
    state = playMove(state, { u: 0, v: 1 });
    // J2: (1, 2) [Color 2]
    state = playMove(state, { u: 1, v: 2 });
    // J1: (0, 2) [Color 1]
    state = playMove(state, { u: 0, v: 2 });

    // El triángulo (0, 1, 2) tiene aristas (0,1)=1, (1,2)=2, (0,2)=1 -> No es monocromático
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.loser).toBeNull();
    expect(state.losingTriangle).toBeNull();
    expect(state.currentPlayer).toBe(2);
  });

  it('no permite jugadas adicionales tras haber finalizado el juego', () => {
    let state = createInitialState();
    state = playMove(state, { u: 0, v: 1 }); // J1
    state = playMove(state, { u: 3, v: 4 }); // J2
    state = playMove(state, { u: 1, v: 2 }); // J1
    state = playMove(state, { u: 4, v: 5 }); // J2
    state = playMove(state, { u: 0, v: 2 }); // J1 -> Fin de juego

    expect(state.status).toBe('finished');
    const intentoPosterior = playMove(state, { u: 3, v: 5 });
    expect(intentoPosterior).toBe(state);
  });
});
