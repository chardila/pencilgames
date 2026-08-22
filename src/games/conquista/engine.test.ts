import { describe, expect, test } from 'vitest';
import { ALL_CANDIDATES, GRID_SIZE, fenceKey, CANDIDATES_BY_KEY, buildGraph } from './engine';
import type { ConquistaState, ConquistaRegion } from './engine';
import { esFenceLegal } from './engine';

describe('catálogo de fences', () => {
  test('tiene exactamente 270 candidatos en la cuadrícula 6×6', () => {
    expect(GRID_SIZE).toBe(6);
    expect(ALL_CANDIDATES.length).toBe(270);
  });

  test('el conteo por tipo de offset coincide con la tabla del spec', () => {
    // Ortogonal corta: (0,1) + (1,0)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 0 && dc === 1) || (dr === 1 && dc === 0);
      }).length
    ).toBe(60);

    // Ortogonal larga: (0,2) + (2,0)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 0 && dc === 2) || (dr === 2 && dc === 0);
      }).length
    ).toBe(48);

    // Diagonal 1×1: (1,1) + (1,-1)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return dr === 1 && dc === 1;
      }).length
    ).toBe(50);

    // Diagonal "caballo": (1,2),(1,-2),(2,1),(2,-1)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
      }).length
    ).toBe(80);

    // Diagonal larga 2×2: (2,2) + (2,-2)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return dr === 2 && dc === 2;
      }).length
    ).toBe(32);
  });

  test('fenceKey es estable sin importar el orden de los puntos', () => {
    const a = { row: 1, col: 2 };
    const b = { row: 0, col: 0 };
    expect(fenceKey(a, b)).toBe(fenceKey(b, a));
  });

  test('fences primitivas (mcd=1) tienen un solo elemento en subSegments', () => {
    // Ortogonal corta: offset (0,1)
    const shortOrtho = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }))!;
    expect(shortOrtho.subSegments.length).toBe(1);
    expect(shortOrtho.subSegments[0]).toEqual(shortOrtho.fence);

    // Diagonal 1×1: offset (1,1)
    const diag1x1 = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    expect(diag1x1.subSegments.length).toBe(1);
    expect(diag1x1.subSegments[0]).toEqual(diag1x1.fence);

    // Diagonal "caballo": offset (1,2)
    const knight = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    expect(knight.subSegments.length).toBe(1);
    expect(knight.subSegments[0]).toEqual(knight.fence);
  });

  test('fences no primitivas (mcd=2) tienen 2 subSegments de longitud unitaria con punto medio correcto', () => {
    // Ortogonal larga: offset (0,2) desde (0,0) a (0,2)
    const longHorizontal = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 2 }))!;
    expect(longHorizontal.subSegments.length).toBe(2);
    expect(longHorizontal.subSegments[0]).toEqual({ a: { row: 0, col: 0 }, b: { row: 0, col: 1 } });
    expect(longHorizontal.subSegments[1]).toEqual({ a: { row: 0, col: 1 }, b: { row: 0, col: 2 } });

    // Diagonal larga 2×2: offset (2,2) desde (0,0) a (2,2)
    const longDiag = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    expect(longDiag.subSegments.length).toBe(2);
    expect(longDiag.subSegments[0]).toEqual({ a: { row: 0, col: 0 }, b: { row: 1, col: 1 } });
    expect(longDiag.subSegments[1]).toEqual({ a: { row: 1, col: 1 }, b: { row: 2, col: 2 } });

    // Vertical larga: offset (2,0) desde (0,0) a (2,0)
    const longVertical = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 0 }))!;
    expect(longVertical.subSegments.length).toBe(2);
    expect(longVertical.subSegments[0]).toEqual({ a: { row: 0, col: 0 }, b: { row: 1, col: 0 } });
    expect(longVertical.subSegments[1]).toEqual({ a: { row: 1, col: 0 }, b: { row: 2, col: 0 } });
  });
});

describe('collinearGroup', () => {
  test('una fence larga (2,2) tiene grupo de tamaño 3 con sus 2 mitades', () => {
    const a = { row: 0, col: 0 };
    const b = { row: 2, col: 2 };
    const mid = { row: 1, col: 1 };
    const larga = CANDIDATES_BY_KEY.get(fenceKey(a, b))!;
    expect(larga.collinearGroup.size).toBe(3);
    expect(larga.collinearGroup.has(fenceKey(a, mid))).toBe(true);
    expect(larga.collinearGroup.has(fenceKey(mid, b))).toBe(true);
  });

  test('una fence primitiva sin fence larga que la contenga tiene grupo de tamaño 1', () => {
    // Diagonal "caballo" (1,2): no es mitad de ninguna fence más larga del catálogo.
    const info = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    expect(info.collinearGroup).toEqual(new Set([info.key]));
  });

  test('una mitad de fence larga incluye esa fence larga en su propio grupo', () => {
    const mitad = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    const larga = fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 });
    expect(mitad.collinearGroup.has(larga)).toBe(true);
  });
});

describe('crossesWith', () => {
  test('dos diagonales tipo caballo que se cruzan en un punto no entero se detectan mutuamente', () => {
    // A(0,0)->F(1,2) [offset (1,2)] cruza a G(2,0)->B(0,1) [offset (-2,1)]
    // en el punto (0.4, 0.8), verificado a mano en la sesión de brainstorming.
    const af = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    const gb = CANDIDATES_BY_KEY.get(fenceKey({ row: 2, col: 0 }, { row: 0, col: 1 }))!;
    expect(af.crossesWith.has(gb.key)).toBe(true);
    expect(gb.crossesWith.has(af.key)).toBe(true);
  });

  test('dos fences que solo comparten un extremo (cruce en T) no se marcan como cruce', () => {
    // La diagonal larga A(0,0)->I(2,2) pasa por E(1,1); la ortogonal E->H(2,1)
    // comparte el punto E pero no debe contar como cruce (T-junction válida).
    const larga = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    const enT = CANDIDATES_BY_KEY.get(fenceKey({ row: 1, col: 1 }, { row: 2, col: 1 }))!;
    expect(larga.crossesWith.has(enT.key)).toBe(false);
    expect(enT.crossesWith.has(larga.key)).toBe(false);
  });

  test('una fence larga y su propia mitad no se marcan como cruce (eso lo cubre collinearGroup)', () => {
    const larga = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    const mitad = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    expect(larga.crossesWith.has(mitad.key)).toBe(false);
  });
});

function estadoVacio(): ConquistaState {
  return {
    size: 6,
    fences: new Map(),
    regions: [],
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
  };
}

describe('esFenceLegal', () => {
  test('una fence nunca dibujada es legal en un tablero vacío', () => {
    const info = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }))!;
    expect(esFenceLegal(estadoVacio(), info)).toBe(true);
  });

  test('regla 1: una fence ya dibujada no es legal', () => {
    const info = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }))!;
    const state = estadoVacio();
    state.fences.set(info.key, 1);
    expect(esFenceLegal(state, info)).toBe(false);
  });

  test('regla 1: una fence larga no es legal si una de sus mitades ya está dibujada', () => {
    const larga = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    const mitad = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    const state = estadoVacio();
    state.fences.set(mitad.key, 1);
    expect(esFenceLegal(state, larga)).toBe(false);
  });

  test('regla 2: una fence no es legal si cruza otra ya dibujada', () => {
    const af = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    const gb = CANDIDATES_BY_KEY.get(fenceKey({ row: 2, col: 0 }, { row: 0, col: 1 }))!;
    const state = estadoVacio();
    state.fences.set(af.key, 1);
    expect(esFenceLegal(state, gb)).toBe(false);
  });

  test('regla 3: una fence no es legal si su interior atraviesa una región ya reclamada', () => {
    // Región reclamada: el cuadro completo (0,0)-(0,1)-(1,1)-(1,0), área 1
    // (equivalente a lo que pasaría si sus 4 lados ya se hubieran cerrado).
    const region: ConquistaRegion = {
      vertices: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 0 },
      ],
      owner: 1,
      area: 1,
      key: 'x',
    };
    const state = { ...estadoVacio(), regions: [region] };
    // La diagonal (0,0)-(1,1) NO es uno de los 4 lados del cuadro — su
    // punto medio (0.5, 0.5) cae estrictamente dentro del cuadro ya
    // reclamado ("diagonal tardía", sección 1 del spec).
    const diagonalTardia = CANDIDATES_BY_KEY.get(
      fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 })
    )!;
    expect(esFenceLegal(state, diagonalTardia)).toBe(false);
  });

  test('regla 3 no bloquea una fence fuera de la región reclamada', () => {
    const region: ConquistaRegion = {
      vertices: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
        { row: 1, col: 1 },
        { row: 1, col: 0 },
      ],
      owner: 1,
      area: 1,
      key: 'x',
    };
    const state = { ...estadoVacio(), regions: [region] };
    const lejos = CANDIDATES_BY_KEY.get(fenceKey({ row: 4, col: 4 }, { row: 4, col: 5 }))!;
    expect(esFenceLegal(state, lejos)).toBe(true);
  });
});

describe('buildGraph', () => {
  test('una fence larga aporta 2 aristas al grafo (sus 2 mitades), no 1', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }), 1],
    ]);
    const graph = buildGraph(fences);
    const vecinosDeOrigen = graph.neighbors.get('0,0') ?? [];
    const vecinosDeCentro = graph.neighbors.get('1,1') ?? [];
    expect(vecinosDeOrigen).toEqual([{ row: 1, col: 1 }]);
    // El punto medio queda con 2 vecinos: el origen y el destino.
    expect(vecinosDeCentro.length).toBe(2);
  });

  test('los vecinos de un vértice quedan ordenados por ángulo', () => {
    // En el punto B(0,1) del rectángulo 2x1 dividido (ver spec sección 3),
    // los vecinos C(0°), E(90°), A(180°) deben quedar en ese orden ascendente.
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1], // A-B
      [fenceKey({ row: 0, col: 1 }, { row: 0, col: 2 }), 1], // B-C
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 1 }), 1], // B-E
    ]);
    const graph = buildGraph(fences);
    const vecinosDeB = graph.neighbors.get('0,1')!;
    expect(vecinosDeB).toEqual([
      { row: 0, col: 2 }, // C
      { row: 1, col: 1 }, // E
      { row: 0, col: 0 }, // A
    ]);
  });
});
