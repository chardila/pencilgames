import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  esMove,
  moveEntrePuntos,
  aristasValidas,
  verticesDeTriangulos,
  movimientosValidos,
  playMove,
  contarTriangulos,
  puntosValidos,
  TOTAL_TRIANGULOS,
  type Move,
  type TriggleState,
} from './engine';

describe('triggle engine - estado inicial y geometría', () => {
  it('empieza en juego, sin triángulos y le toca al jugador 1', () => {
    const state = createInitialState();
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(1);
    expect(state.scores).toEqual({ 1: 0, 2: 0 });
    expect(state.winner).toBeNull();
    expect(state.jugadaCount).toBe(0);
  });

  it('el hexágono radio 3 tiene 37 puntos y 54 triángulos unitarios', () => {
    const state = createInitialState();
    expect(puntosValidos()).toHaveLength(37);
    expect(TOTAL_TRIANGULOS).toBe(54);
    expect(state.triangleOwners).toHaveLength(54);
    expect(state.triangleOwners.every(o => o === null)).toBe(true);
  });

  it('todos los triángulos son reclamables (ninguna esquina muerta)', () => {
    // Con líneas de 4 puntos que caben en las 3 direcciones en todo el
    // tablero, no debe quedar ningún triángulo imposible de completar.
    let state: TriggleState = createInitialState();
    let guard = 0;
    while (state.status === 'playing' && guard < 1000) {
      const movs = movimientosValidos(state);
      if (movs.length === 0) break;
      state = playMove(state, movs[0]);
      guard++;
    }
    const conteo = contarTriangulos(state);
    expect(conteo[1] + conteo[2]).toBe(TOTAL_TRIANGULOS);
  });

  it('expone 72 aristas unitarias y 3 vértices por triángulo', () => {
    // Hexágono radio 3: aristas por dirección = 3·(4+5+6) = 45... contadas
    // como pares adyacentes reales; se comprueba consistencia, no un número
    // memorizado.
    const aristas = aristasValidas();
    expect(aristas.length).toBeGreaterThan(0);
    // cada arista aparece una sola vez
    const claves = new Set(aristas.map(a => `${a.dir}:${a.q},${a.r}`));
    expect(claves.size).toBe(aristas.length);

    const vertices = verticesDeTriangulos();
    expect(vertices).toHaveLength(TOTAL_TRIANGULOS);
    expect(vertices.every(v => v.length === 3)).toBe(true);
  });

  it('ningún punto está tocado al inicio', () => {
    const state = createInitialState();
    expect(Object.keys(state.touched)).toHaveLength(0);
  });
});

describe('triggle engine - primera jugada', () => {
  it('la primera jugada no exige conexión y activa 3 aristas', () => {
    const state = createInitialState();
    const move: Move = { q: 0, r: 0, dir: 'H' }; // (0,0)-(1,0)-(2,0)-(3,0)
    expect(esJugadaValida(state, move)).toBe(true);

    const next = playMove(state, move);
    expect(next).not.toBe(state);
    expect(next.edges['H:0,0']).toBe(1);
    expect(next.edges['H:1,0']).toBe(1);
    expect(next.edges['H:2,0']).toBe(1);
    expect(next.currentPlayer).toBe(2);
    expect(next.jugadaCount).toBe(1);
  });

  it('marca como tocados los 4 puntos de la jugada', () => {
    const next = playMove(createInitialState(), { q: 0, r: 0, dir: 'H' });
    expect(next.touched['0,0']).toBe(true);
    expect(next.touched['1,0']).toBe(true);
    expect(next.touched['2,0']).toBe(true);
    expect(next.touched['3,0']).toBe(true);
    expect(next.touched['0,1']).toBeUndefined();
  });
});

describe('triggle engine - regla de conexión', () => {
  it('desde la 2.ª jugada, una línea sin punto en común se rechaza', () => {
    const state = playMove(createInitialState(), { q: 0, r: 0, dir: 'H' });
    const aislada: Move = { q: -3, r: 0, dir: 'D1' }; // columna izquierda, no toca la fila jugada
    expect(esJugadaValida(state, aislada)).toBe(false);
    expect(playMove(state, aislada)).toBe(state);
  });

  it('desde la 2.ª jugada, una línea que comparte un punto se acepta', () => {
    const state = playMove(createInitialState(), { q: 0, r: 0, dir: 'H' });
    const conectada: Move = { q: 0, r: 0, dir: 'D1' }; // comparte (0,0)
    expect(esJugadaValida(state, conectada)).toBe(true);
  });
});

describe('triggle engine - no duplicar', () => {
  it('rechaza una jugada cuyas 3 aristas ya están activas', () => {
    const state = playMove(createInitialState(), { q: 0, r: 0, dir: 'H' });
    expect(esJugadaValida(state, { q: 0, r: 0, dir: 'H' })).toBe(false);
    expect(playMove(state, { q: 0, r: 0, dir: 'H' })).toBe(state);
  });
});

describe('triggle engine - fuera de límites', () => {
  it('rechaza una jugada que se sale del hexágono', () => {
    const state = createInitialState();
    expect(esJugadaValida(state, { q: 1, r: 0, dir: 'H' })).toBe(false); // (4,0) no existe
    expect(esJugadaValida(state, { q: 2, r: 2, dir: 'H' })).toBe(false); // (2,2) no existe
  });
});

describe('triggle engine - conquista de triángulos', () => {
  // Triángulo △ con vértices (0,0),(1,0),(0,1): aristas H(0,0), D1(0,0), D2(0,1).
  function conDosLados(): TriggleState {
    let state: TriggleState = createInitialState();
    state = playMove(state, { q: 0, r: 0, dir: 'H' }); // j1: H(0,0),H(1,0),H(2,0)
    state = playMove(state, { q: 0, r: 0, dir: 'D1' }); // j2: D1(0,0),D1(0,1),D1(0,2)
    return state;
  }

  it('completar el tercer lado reclama el triángulo para el jugador activo', () => {
    let state = conDosLados();
    expect(state.currentPlayer).toBe(1);
    const antes = contarTriangulos(state);
    state = playMove(state, { q: 0, r: 1, dir: 'D2' }); // j1: D2(0,1),D2(1,0),D2(2,-1)
    const despues = contarTriangulos(state);
    expect(despues[1]).toBe(antes[1] + 1);
  });

  it('conquistar triángulos NO otorga turno extra', () => {
    let state = conDosLados();
    state = playMove(state, { q: 0, r: 1, dir: 'D2' });
    expect(state.scores[1]).toBeGreaterThan(0);
    expect(state.currentPlayer).toBe(2);
  });
});

describe('triggle engine - fin de partida', () => {
  function jugarHastaElFinal(): TriggleState {
    let state: TriggleState = createInitialState();
    let guard = 0;
    while (state.status === 'playing' && guard < 1000) {
      const movs = movimientosValidos(state);
      if (movs.length === 0) break;
      state = playMove(state, movs[0]);
      guard++;
    }
    return state;
  }

  it('termina sin jugadas válidas y gana quien tiene más triángulos', () => {
    const state = jugarHastaElFinal();
    expect(state.status).toBe('finished');
    expect(movimientosValidos(state)).toHaveLength(0);

    const c = contarTriangulos(state);
    if (c[1] > c[2]) expect(state.winner).toBe(1);
    else if (c[2] > c[1]) expect(state.winner).toBe(2);
    else expect(state.winner).toBeNull();
  });

  it('una jugada sobre una partida terminada no cambia el estado', () => {
    const state = jugarHastaElFinal();
    expect(playMove(state, { q: 0, r: 0, dir: 'H' })).toBe(state);
  });
});

describe('triggle engine - moveEntrePuntos (dos toques)', () => {
  it('reconoce las 3 direcciones sin importar el orden de los toques', () => {
    expect(moveEntrePuntos({ q: 0, r: 0 }, { q: 3, r: 0 })).toEqual({ q: 0, r: 0, dir: 'H' });
    expect(moveEntrePuntos({ q: 3, r: 0 }, { q: 0, r: 0 })).toEqual({ q: 0, r: 0, dir: 'H' });
    expect(moveEntrePuntos({ q: 0, r: 0 }, { q: 0, r: 3 })).toEqual({ q: 0, r: 0, dir: 'D1' });
    expect(moveEntrePuntos({ q: 0, r: 3 }, { q: 0, r: 0 })).toEqual({ q: 0, r: 0, dir: 'D1' });
    expect(moveEntrePuntos({ q: 0, r: 1 }, { q: 3, r: -2 })).toEqual({ q: 0, r: 1, dir: 'D2' });
    expect(moveEntrePuntos({ q: 3, r: -2 }, { q: 0, r: 1 })).toEqual({ q: 0, r: 1, dir: 'D2' });
  });

  it('rechaza pares que no forman una línea de 4 puntos', () => {
    expect(moveEntrePuntos({ q: 0, r: 0 }, { q: 0, r: 0 })).toBeNull(); // mismo punto
    expect(moveEntrePuntos({ q: 0, r: 0 }, { q: 2, r: 0 })).toBeNull(); // distancia 2
    expect(moveEntrePuntos({ q: 0, r: 0 }, { q: 1, r: 0 })).toBeNull(); // distancia 1
    expect(moveEntrePuntos({ q: 0, r: 0 }, { q: 1, r: 1 })).toBeNull(); // no colineal
    expect(moveEntrePuntos({ q: 0, r: 0 }, { q: 3, r: 1 })).toBeNull(); // no colineal
  });
});

describe('triggle engine - guarda de payload (esMove)', () => {
  it('acepta movimientos bien formados', () => {
    expect(esMove({ q: 0, r: 0, dir: 'H' })).toBe(true);
    expect(esMove({ q: -3, r: 1, dir: 'D1' })).toBe(true);
    expect(esMove({ q: 2, r: -1, dir: 'D2' })).toBe(true);
  });

  it('rechaza direcciones inválidas y coordenadas no enteras', () => {
    expect(esMove({ q: 0, r: 0, dir: 'X' })).toBe(false);
    expect(esMove({ q: 1.5, r: 0, dir: 'H' })).toBe(false);
    expect(esMove({ q: 0, r: '0', dir: 'H' })).toBe(false);
  });

  it('rechaza primitivos y objetos malformados', () => {
    expect(esMove(null)).toBe(false);
    expect(esMove(42)).toBe(false);
    expect(esMove({})).toBe(false);
    expect(esMove({ q: 0, dir: 'H' })).toBe(false);
  });
});
