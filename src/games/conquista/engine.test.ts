import { describe, expect, test } from 'vitest';
import { ALL_CANDIDATES, GRID_SIZE, fenceKey, CANDIDATES_BY_KEY, buildGraph } from './engine';
import type { ConquistaState, ConquistaRegion, Point } from './engine';
import { esFenceLegal } from './engine';
import { extractBoundedFaces, signedArea } from './engine';
import { createInitialState, jugarFence } from './engine';
import { regionKey, pointInPolygon } from './engine';

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
  test('una fence larga (2,2) tiene grupo que incluye sus 2 mitades y otras fences que comparten sub-segmentos', () => {
    const a = { row: 0, col: 0 };
    const b = { row: 2, col: 2 };
    const mid = { row: 1, col: 1 };
    const larga = CANDIDATES_BY_KEY.get(fenceKey(a, b))!;
    // Grupo exacto: (0,0)-(2,2), (0,0)-(1,1), (1,1)-(2,2), y (1,1)-(3,3)
    // — esta última también tiene (1,1)-(2,2) como sub-segmento, por eso
    // se conectan las dos fences largas entre sí.
    const expected = new Set([
      fenceKey(a, b),              // La propia fence larga: (0,0)-(2,2)
      fenceKey(a, mid),            // Primera mitad: (0,0)-(1,1)
      fenceKey(mid, b),            // Segunda mitad: (1,1)-(2,2)
      fenceKey({ row: 1, col: 1 }, { row: 3, col: 3 }), // Otra larga que comparte (1,1)-(2,2)
    ]);
    expect(larga.collinearGroup).toEqual(expected);
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

  test('dos fences largas distintas que comparten una mitad quedan conectadas entre sí', () => {
    const larga1 = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 5 }, { row: 2, col: 5 }))!;
    const larga2 = CANDIDATES_BY_KEY.get(fenceKey({ row: 1, col: 5 }, { row: 3, col: 5 }))!;
    expect(larga1.collinearGroup.has(larga2.key)).toBe(true);
    expect(larga2.collinearGroup.has(larga1.key)).toBe(true);
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

describe('extractBoundedFaces', () => {
  test('un solo cuadro (4 lados) produce exactamente 1 cara acotada de área 1', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1],
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 1 }), 1],
      [fenceKey({ row: 1, col: 1 }, { row: 1, col: 0 }), 1],
      [fenceKey({ row: 1, col: 0 }, { row: 0, col: 0 }), 1],
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(1);
    expect(caras[0].area).toBe(1);
    expect(caras[0].vertices.length).toBe(4);
  });

  test('un triángulo (2 lados + 1 diagonal de un cuadro) produce 1 cara de área 0.5', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1],
      [fenceKey({ row: 0, col: 0 }, { row: 1, col: 0 }), 1],
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 0 }), 1], // diagonal
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(1);
    expect(caras[0].area).toBe(0.5);
  });

  test('un rectángulo 2×1 dividido por el medio produce 2 caras de área 1 cada una', () => {
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1], // A-B
      [fenceKey({ row: 0, col: 1 }, { row: 0, col: 2 }), 1], // B-C
      [fenceKey({ row: 1, col: 0 }, { row: 1, col: 1 }), 1], // D-E
      [fenceKey({ row: 1, col: 1 }, { row: 1, col: 2 }), 1], // E-F
      [fenceKey({ row: 0, col: 0 }, { row: 1, col: 0 }), 1], // A-D
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 1 }), 1], // B-E
      [fenceKey({ row: 0, col: 2 }, { row: 1, col: 2 }), 1], // C-F
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(2);
    expect(caras[0].area).toBe(1);
    expect(caras[1].area).toBe(1);
    // Cada cara reclamable de este rectángulo dividido es un cuadro de 4
    // vértices (no un triángulo, ni un ciclo degenerado con vértices
    // repetidos/de más).
    expect(caras.map(c => c.vertices.length).sort()).toEqual([4, 4]);
  });

  test('una región formada con una diagonal tipo caballo se detecta con su área correcta', () => {
    // Triángulo A(0,0)-B(0,1)-F(1,2) usando la diagonal caballo A-F.
    const fences = new Map<string, 1 | 2>([
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1], // A-B
      [fenceKey({ row: 0, col: 1 }, { row: 1, col: 2 }), 1], // B-F, diagonal 1x1 normal (offset 1,1)
      [fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }), 1], // A-F (diagonal caballo)
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(1);
    // Área del triángulo (0,0),(0,1),(1,2) por la fórmula del shoelace = 0.5.
    expect(caras[0].area).toBe(0.5);
  });

  test('una cara "pellizcada" que toca un vértice compartido dos veces se cierra correctamente (regresión)', () => {
    // Perímetro grande: cuadrado 4×4 con esquinas (0,0),(0,4),(4,4),(4,0),
    // construido con fences unitarias encadenadas (área 16).
    // Triángulo pequeño ESTRICTAMENTE interior al cuadrado, con vértices
    // (0,0), (1,2), (2,1): comparte EXACTAMENTE el vértice (0,0) — una
    // esquina del cuadrado — con el perímetro grande, y no toca ninguna
    // otra arista/vértice del cuadrado (área 1.5, verificada a mano abajo).
    //
    // Con el cierre viejo (por VÉRTICE), traceFace que arranca recorriendo
    // el perímetro del cuadrado se detendría en cuanto vuelve a pisar
    // (0,0) la PRIMERA vez que lo hace — que es al entrar al triángulo,
    // no al completar el cuadrado — devolviendo un ciclo incorrecto (una
    // mezcla de aristas del cuadrado y del triángulo) en vez de las 2
    // caras reales: el triángulo solo, y el cuadrado "pellizcado" en (0,0)
    // que le da la vuelta al triángulo por dentro.
    const fences = new Map<string, 1 | 2>([
      // Cuadrado 4×4, lado inferior.
      [fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }), 1],
      [fenceKey({ row: 0, col: 1 }, { row: 0, col: 2 }), 1],
      [fenceKey({ row: 0, col: 2 }, { row: 0, col: 3 }), 1],
      [fenceKey({ row: 0, col: 3 }, { row: 0, col: 4 }), 1],
      // Lado derecho.
      [fenceKey({ row: 0, col: 4 }, { row: 1, col: 4 }), 1],
      [fenceKey({ row: 1, col: 4 }, { row: 2, col: 4 }), 1],
      [fenceKey({ row: 2, col: 4 }, { row: 3, col: 4 }), 1],
      [fenceKey({ row: 3, col: 4 }, { row: 4, col: 4 }), 1],
      // Lado superior.
      [fenceKey({ row: 4, col: 4 }, { row: 4, col: 3 }), 1],
      [fenceKey({ row: 4, col: 3 }, { row: 4, col: 2 }), 1],
      [fenceKey({ row: 4, col: 2 }, { row: 4, col: 1 }), 1],
      [fenceKey({ row: 4, col: 1 }, { row: 4, col: 0 }), 1],
      // Lado izquierdo.
      [fenceKey({ row: 4, col: 0 }, { row: 3, col: 0 }), 1],
      [fenceKey({ row: 3, col: 0 }, { row: 2, col: 0 }), 1],
      [fenceKey({ row: 2, col: 0 }, { row: 1, col: 0 }), 1],
      [fenceKey({ row: 1, col: 0 }, { row: 0, col: 0 }), 1],
      // Triángulo interior, comparte solo (0,0) con el cuadrado.
      [fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }), 1],
      [fenceKey({ row: 0, col: 0 }, { row: 2, col: 1 }), 1],
      [fenceKey({ row: 1, col: 2 }, { row: 2, col: 1 }), 1],
    ]);
    const caras = extractBoundedFaces(fences);
    expect(caras.length).toBe(2);
    const areas = caras.map(c => c.area).sort((a, b) => a - b);
    // Triángulo (0,0),(1,2),(2,1): shoelace = 1.5.
    // Cuadrado pellizcado = área del cuadrado (16) menos la del triángulo
    // (1.5) = 14.5 — NO 16 (el bug que se corrige aquí habría producido un
    // ciclo mal cerrado en vez de descontar el triángulo correctamente).
    expect(areas).toEqual([1.5, 14.5]);
  });
});

describe('signedArea', () => {
  test('un ciclo con orientación "reclamable" da área negativa (convención de signo explícita)', () => {
    // Ciclo A(0,0)-D(1,0)-E(1,1)-B(0,1) del cuadro izquierdo del rectángulo
    // 2×1 dividido (spec sección 3): esta es la orientación que
    // extractBoundedFaces mantiene como cara reclamable.
    const ciclo = [
      { row: 0, col: 0 }, // A
      { row: 1, col: 0 }, // D
      { row: 1, col: 1 }, // E
      { row: 0, col: 1 }, // B
    ];
    expect(signedArea(ciclo)).toBe(-1);
  });
});

describe('jugarFence', () => {
  test('createInitialState arranca sin fences, sin regiones, turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.fences.size).toBe(0);
    expect(state.regions.length).toBe(0);
    expect(state.currentPlayer).toBe(1);
    expect(state.scores).toEqual({ 1: 0, 2: 0 });
    expect(state.status).toBe('playing');
  });

  test('una jugada ilegal (fence ya dibujada) devuelve el mismo estado', () => {
    let state = createInitialState();
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 1 } });
    const estadoTrasPrimera = state;
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 1 } });
    expect(state).toEqual(estadoTrasPrimera);
  });

  test('una jugada que no cierra ninguna región pasa el turno al otro jugador', () => {
    // Sin ningún override manual de currentPlayer: esto ejercita
    // directamente la rama `claimedCount === 0` de jugarFence.
    let state = createInitialState();
    // Fence aislada en una esquina del tablero: no completa ningún
    // triángulo/cuadro por sí sola.
    state = jugarFence(state, { a: { row: 4, col: 4 }, b: { row: 4, col: 5 } });
    expect(state.regions.length).toBe(0);
    expect(state.currentPlayer).toBe(2);
  });

  test('cerrar un triángulo reclama la región y mantiene el turno del mismo jugador', () => {
    let state = createInitialState();
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 1 } }); // A-B, no cierra, pasa a 2
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 1, col: 0 } }); // A-D, no cierra, pasa a 2
    state = { ...state, currentPlayer: 1 };
    // La diagonal B-D cierra el triángulo A-B-D (lados A-B, A-D, B-D).
    state = jugarFence(state, { a: { row: 0, col: 1 }, b: { row: 1, col: 0 } });
    expect(state.regions.length).toBe(1);
    expect(state.scores[1]).toBe(0.5);
    expect(state.currentPlayer).toBe(1); // mantiene el turno por haber reclamado
  });

  test('cerrar 2 regiones con una sola fence larga mantiene el turno por ambas', () => {
    // IMPORTANTE: este caso solo es alcanzable con una fence LARGA (que
    // añade 2 sub-segmentos al grafo en una sola jugada). Con fences
    // cortas, un reclamo múltiple en 1 sola jugada es geométricamente
    // irrealizable en Conquista: si ya están los 4 lados de un cuadro sin
    // su diagonal, el cuadro se reclama entero de inmediato (antes de
    // llegar a "solo falta el lado compartido con el cuadro vecino"), y la
    // regla 3 impide subdividirlo después. No "simplificar" este test a
    // fences cortas — ver spec sección 1, "Consecuencia de diseño sobre el
    // encadenamiento múltiple".
    //
    // Se arman 2 triángulos que comparten el punto B(0,1), cada uno a falta
    // de exactamente un lado: A-B-D (falta A-B) y B-C-E (falta B-C). La
    // fence larga ortogonal A(0,0)-C(0,2) — que se descompone en A-B y B-C
    // (sección 1 del spec) — cierra ambos triángulos con una sola jugada.
    let state = createInitialState();
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 1, col: 0 } }); // A-D
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 1 }, b: { row: 1, col: 0 } }); // diagonal B-D
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 1 }, b: { row: 1, col: 1 } }); // B-E
    state = { ...state, currentPlayer: 1 };
    state = jugarFence(state, { a: { row: 0, col: 2 }, b: { row: 1, col: 1 } }); // diagonal C-E
    state = { ...state, currentPlayer: 1 };
    expect(state.regions.length).toBe(0); // nada cerrado todavía

    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 0, col: 2 } }); // fence larga A-C

    expect(state.regions.length).toBe(2); // triángulo A-B-D y triángulo B-C-E
    expect(state.scores[1]).toBe(1); // 0.5 + 0.5
    expect(state.currentPlayer).toBe(1); // encadenó turno por las 2 regiones
  });

  test('el estado pasa a finished cuando ninguna fence del catálogo es legal', () => {
    // No se construye a mano (270 candidatos): se juega una partida completa
    // con movimientos legales hasta que termine, y se confirma el estado.
    let state = createInitialState();
    let seguridad = 0;
    while (state.status === 'playing' && seguridad < 500) {
      const legal = ALL_CANDIDATES.find(c => esFenceLegal(state, c));
      if (!legal) break;
      state = jugarFence(state, legal.fence);
      seguridad++;
    }
    const quedaAlguna = ALL_CANDIDATES.some(c => esFenceLegal(state, c));
    expect(quedaAlguna).toBe(false);
    expect(state.status).toBe('finished');
  });

  test('regresión: un anillo desconectado que encierra una región ya reclamada descuenta su área (no la duplica)', () => {
    // Triángulo (2,2)-(2,3)-(3,2), área 0.5, reclamado por el jugador 1.
    // Luego un anillo 3×3 con esquinas (1,1)-(1,4)-(4,4)-(4,1) (12 fences
    // cortas) que NO comparte ningún vértice con el triángulo pero lo
    // encierra geométricamente (interior del anillo: filas/columnas 1..4;
    // el triángulo vive estrictamente adentro, en filas/columnas 2..3).
    // 15 jugadas legales en total, turnos alternados de forma natural (sin
    // forzar currentPlayer en ningún momento).
    //
    // extractBoundedFaces opera por componente conexo del grafo: el anillo
    // y el triángulo son componentes distintos (no comparten vértice), así
    // que el recorrido de caras del anillo nunca "ve" el triángulo interior
    // y por sí solo reportaría el área completa del anillo (9), sin
    // descontar el agujero ya reclamado (0.5). El fix (areaNetaDeHuecos)
    // debe descontarlo: área neta del anillo = 9 - 0.5 = 8.5.
    let state = createInitialState();

    // Triángulo: jugador 1 dibuja 2 lados sin cerrar, el 3º cierra.
    state = jugarFence(state, { a: { row: 2, col: 2 }, b: { row: 2, col: 3 } }); // P1, no cierra
    state = jugarFence(state, { a: { row: 2, col: 3 }, b: { row: 3, col: 2 } }); // P2, no cierra
    state = jugarFence(state, { a: { row: 3, col: 2 }, b: { row: 2, col: 2 } }); // P1 cierra el triángulo, mantiene turno

    // Anillo 3×3, 12 fences cortas por su perímetro (sin tocar el triángulo).
    state = jugarFence(state, { a: { row: 1, col: 1 }, b: { row: 1, col: 2 } });
    state = jugarFence(state, { a: { row: 1, col: 2 }, b: { row: 1, col: 3 } });
    state = jugarFence(state, { a: { row: 1, col: 3 }, b: { row: 1, col: 4 } });
    state = jugarFence(state, { a: { row: 1, col: 4 }, b: { row: 2, col: 4 } });
    state = jugarFence(state, { a: { row: 2, col: 4 }, b: { row: 3, col: 4 } });
    state = jugarFence(state, { a: { row: 3, col: 4 }, b: { row: 4, col: 4 } });
    state = jugarFence(state, { a: { row: 4, col: 4 }, b: { row: 4, col: 3 } });
    state = jugarFence(state, { a: { row: 4, col: 3 }, b: { row: 4, col: 2 } });
    state = jugarFence(state, { a: { row: 4, col: 2 }, b: { row: 4, col: 1 } });
    state = jugarFence(state, { a: { row: 4, col: 1 }, b: { row: 3, col: 1 } });
    state = jugarFence(state, { a: { row: 3, col: 1 }, b: { row: 2, col: 1 } });
    state = jugarFence(state, { a: { row: 2, col: 1 }, b: { row: 1, col: 1 } }); // cierra el anillo

    expect(state.scores).toEqual({ 1: 0.5, 2: 8.5 });
    expect(state.regions.length).toBe(2); // el triángulo y el anillo (con hueco descontado)
  });

  test('regresión: una cara "pellizcada" que comparte un vértice con una región ya reclamada NO le resta el área dos veces', () => {
    // Distinto del caso anterior: aquí el triángulo interior SÍ comparte un
    // vértice — (0,0) — con la cara nueva (el cuadrado "pellizcado" de
    // Task 6). En ese caso, extractBoundedFaces ya descuenta el hueco
    // geométricamente vía su propia traza topológica (el ciclo de la cara
    // pellizcada literalmente rodea el triángulo por dentro): el cuadrado
    // pellizcado ya vale 14.5, no 16. areaNetaDeHuecos NO debe restar el
    // área del triángulo otra vez (lo que daría 13, incorrecto) — debe
    // reconocer que, al compartir vértice, el hueco ya está contado y no
    // tocar el área de esta cara.
    //
    // Se juega el triángulo primero (se reclama, área 1.5), y luego se
    // cierra el perímetro completo del cuadrado 4×4 con jugarFence — a
    // diferencia del test de Task 6 (que llama extractBoundedFaces
    // directamente y por tanto nunca pasa por areaNetaDeHuecos), este test
    // sí ejercita el código de producción real de jugarFence.
    let state = createInitialState();

    // Triángulo (0,0)-(1,2)-(2,1) con diagonales caballo — se cierra en la
    // 3ª jugada y queda reclamado antes de que exista el cuadrado.
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 1, col: 2 } });
    state = jugarFence(state, { a: { row: 0, col: 0 }, b: { row: 2, col: 1 } });
    state = jugarFence(state, { a: { row: 1, col: 2 }, b: { row: 2, col: 1 } }); // cierra el triángulo

    // Perímetro del cuadrado 4×4, 16 fences unitarias; ninguna cruza el
    // triángulo (que es estrictamente interior), solo comparten (0,0).
    const perimetro: Array<[[number, number], [number, number]]> = [
      [[0, 0], [0, 1]], [[0, 1], [0, 2]], [[0, 2], [0, 3]], [[0, 3], [0, 4]],
      [[0, 4], [1, 4]], [[1, 4], [2, 4]], [[2, 4], [3, 4]], [[3, 4], [4, 4]],
      [[4, 4], [4, 3]], [[4, 3], [4, 2]], [[4, 2], [4, 1]], [[4, 1], [4, 0]],
      [[4, 0], [3, 0]], [[3, 0], [2, 0]], [[2, 0], [1, 0]], [[1, 0], [0, 0]], // cierra el perímetro
    ];
    for (const [[ar, ac], [br, bc]] of perimetro) {
      state = jugarFence(state, { a: { row: ar, col: ac }, b: { row: br, col: bc } });
    }

    const areas = state.regions.map(r => r.area).sort((a, b) => a - b);
    expect(areas).toEqual([1.5, 14.5]); // NO [1.5, 13] — ver comentario arriba
  });
});

// PRNG determinista (mulberry32) para que las partidas aleatorias del test
// sean reproducibles entre corridas.
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Puntos de muestreo para el chequeo de solapamiento (ver más abajo): 9
// puntos por celda unitaria (cuadrícula 3×3 interna, offsets 0.25/0.5/0.75),
// para las 5×5 celdas de un tablero de GRID_SIZE=6. Deliberadamente NO usa
// shoelace/topología — es un algoritmo distinto al que usa la producción,
// para que sea una verificación genuinamente independiente.
const SAMPLE_POINTS: Point[] = (() => {
  const points: Point[] = [];
  const offsets = [0.25, 0.5, 0.75];
  for (let row = 0; row < GRID_SIZE - 1; row++) {
    for (let col = 0; col < GRID_SIZE - 1; col++) {
      for (const dr of offsets) {
        for (const dc of offsets) {
          points.push({ row: row + dr, col: col + dc });
        }
      }
    }
  }
  return points;
})();

describe('invariante: cero caras acotadas sin dueño', () => {
  test('se cumple en cada jugada de 40 partidas completas aleatorias', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rng = mulberry32(seed);
      let state = createInitialState();

      while (state.status === 'playing') {
        const legales = ALL_CANDIDATES.filter(c => esFenceLegal(state, c));
        if (legales.length === 0) break;
        const elegido = legales[Math.floor(rng() * legales.length)];
        state = jugarFence(state, elegido.fence);

        // Multiset EXACTO de claves entre las caras acotadas recomputadas
        // desde cero (sobre el fence set actual completo) y las regiones
        // reclamadas hasta ahora — no solo el conteo. Esto es lo que hace
        // esta comparación no-tautológica: extractBoundedFaces se
        // recomputa aquí desde cero, independientemente de cómo
        // jugarFence fue acumulando `state.regions` jugada a jugada.
        const carasAcotadas = extractBoundedFaces(state.fences);
        const clavesRecomputadas = carasAcotadas.map(c => regionKey(c.vertices)).sort();
        const clavesReclamadas = state.regions.map(r => r.key).sort();
        expect(clavesRecomputadas).toEqual(clavesReclamadas);
      }

      expect(state.status).toBe('finished');

      // Invariante de área INDEPENDIENTE (no compara region.area contra sí
      // mismo — esa comparación es tautológica y no detecta nada, fue
      // exactamente lo que dejó pasar el bug del anillo desconectado que
      // duplicaba área, Task 7 hallazgo crítico). En vez de comparar
      // áreas, se verifica por muestreo geométrico que ningún punto del
      // tablero cae dentro de 2 regiones reclamadas a la vez — eso es
      // exactamente lo que el bug producía (el punto medio del triángulo
      // caía dentro del triángulo Y dentro del anillo que lo encerraba).
      // Se chequea solo al final de la partida (no en cada jugada): una
      // vez reclamada, una región nunca se modifica ni se elimina (regla 3
      // impide subdividirla después), así que un solapamiento introducido
      // a mitad de partida persiste hasta el final — comprobarlo al final
      // detecta el mismo bug a una fracción del costo.
      for (const p of SAMPLE_POINTS) {
        const contenedoras = state.regions.filter(r => pointInPolygon(p, r.vertices));
        expect(contenedoras.length).toBeLessThanOrEqual(1);
      }
    }
  });
});
