import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esEdgeValido,
  getAllEdges,
  getEdgeIndex,
  playMove,
  type Edge,
  type SimState,
} from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: SimState, rng: () => number): Edge {
  const libres = getAllEdges().filter(
    e => state.edges[getEdgeIndex(e.u, e.v)] === null
  );
  return libres[Math.floor(rng() * libres.length)];
}

function aplicarSecuencia(moves: Edge[]): SimState {
  let state = createInitialState();
  for (const move of moves) {
    state = playMove(state, move);
    expect(state.status).toBe('playing');
  }
  return state;
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar'
        ? jugadaAzar(state, rng)
        : elegirMovimiento(state, dif, rng);
    expect(esEdgeValido(mov)).toBe(true);
    const idx = getEdgeIndex(mov.u, mov.v);
    expect(state.edges[idx]).toBeNull();
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('sim bot', () => {
  it('genera jugadas legales y válidas en menos de 30 ms (típico < 15 ms) desde inicio hasta final', () => {
    let totalMs = 0;
    let totalMoves = 0;
    for (const seed of [42, 101, 303]) {
      const rng = crearRng(seed);
      let state = createInitialState();

      while (state.status === 'playing') {
        for (const dif of ['facil', 'medio', 'dificil'] as const) {
          const t0 = performance.now();
          const mov = elegirMovimiento(state, dif, rng);
          const dt = performance.now() - t0;

          totalMs += dt;
          totalMoves++;
          expect(dt).toBeLessThan(30);
          expect(esEdgeValido(mov)).toBe(true);
          expect(state.edges[getEdgeIndex(mov.u, mov.v)]).toBeNull();
          expect(playMove(state, mov)).not.toBe(state);
        }
        state = playMove(state, elegirMovimiento(state, 'dificil', rng));
      }
    }
    expect(totalMs / totalMoves).toBeLessThan(15);
  });

  it('es 100% determinista con un mismo estado y semilla rng', () => {
    const s = aplicarSecuencia([
      { u: 0, v: 1 },
      { u: 2, v: 3 },
      { u: 0, v: 2 },
    ]);

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(s, dif, crearRng(777));
      const m2 = elegirMovimiento(s, dif, crearRng(777));
      expect(m1).toEqual(m2);
    }
  });

  it('devuelve arista legal aunque todas las aristas restantes cierren triángulo propio', () => {
    // J1: (0,1),(0,2),(0,3),(0,4),(0,5) (estrella en 0)
    // J2: (1,5),(2,5),(3,5),(4,5) (estrella en 5) -> turno de J2, quedan 6 aristas entre 1..4 todas suicidas para J2
    const state = aplicarSecuencia([
      { u: 0, v: 1 }, // J1
      { u: 1, v: 5 }, // J2
      { u: 0, v: 2 }, // J1
      { u: 2, v: 5 }, // J2
      { u: 0, v: 3 }, // J1
      { u: 3, v: 5 }, // J2
      { u: 0, v: 4 }, // J1
      { u: 4, v: 5 }, // J2
      { u: 0, v: 5 }, // J1
    ]);

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, crearRng(1));
      expect(esEdgeValido(mov)).toBe(true);
      expect(state.edges[getEdgeIndex(mov.u, mov.v)]).toBeNull();
      const next = playMove(state, mov);
      expect(next).not.toBe(state);
      expect(next.status).toBe('finished');
    }
  });

  it('facil evita formar triángulo propio cuando rng < 0.75 si existen aristas seguras', () => {
    // J1: (0,1),(0,2),(0,3),(0,4); J2: (1,5),(2,5),(3,5),(4,5).
    // Única arista segura para J1 es (0,5); las 6 restantes forman triángulo propio.
    const state = aplicarSecuencia([
      { u: 0, v: 1 },
      { u: 1, v: 5 },
      { u: 0, v: 2 },
      { u: 2, v: 5 },
      { u: 0, v: 3 },
      { u: 3, v: 5 },
      { u: 0, v: 4 },
      { u: 4, v: 5 },
    ]);

    const movSeguro = elegirMovimiento(state, 'facil', () => 0.1);
    expect(movSeguro).toEqual({ u: 0, v: 5 });

    // Con rng >= 0.75 puede elegir arista libre al azar aunque cierre triángulo
    const movArriesgado = elegirMovimiento(state, 'facil', () => 0.8);
    expect(esEdgeValido(movArriesgado)).toBe(true);
    expect(movArriesgado).not.toEqual({ u: 0, v: 5 });
  });

  it('medio y dificil toman única jugada segura / victoria forzada en 1 ply y evitan suicidio', () => {
    const state = aplicarSecuencia([
      { u: 0, v: 1 },
      { u: 1, v: 5 },
      { u: 0, v: 2 },
      { u: 2, v: 5 },
      { u: 0, v: 3 },
      { u: 3, v: 5 },
      { u: 0, v: 4 },
      { u: 4, v: 5 },
    ]);

    for (const dif of ['medio', 'dificil'] as const) {
      for (const seed of [1, 2, 3, 99]) {
        const mov = elegirMovimiento(state, dif, crearRng(seed));
        expect(mov).toEqual({ u: 0, v: 5 });
        const after = playMove(state, mov);
        expect(after.status).toBe('playing');
      }
    }
  });

  it('medio y dificil evitan regalar posición forzada en 2 plies', () => {
    // Turno de J2 con 8 aristas libres:
    // J1: (0,1),(0,2),(0,3),(0,4)
    // J2: (1,5),(2,5),(3,5)
    // Si J2 juega (4,5), J1 responde (0,5) y deja a J2 sin jugadas seguras.
    const state = aplicarSecuencia([
      { u: 0, v: 1 },
      { u: 1, v: 5 },
      { u: 0, v: 2 },
      { u: 2, v: 5 },
      { u: 0, v: 3 },
      { u: 3, v: 5 },
      { u: 0, v: 4 },
    ]);

    for (const dif of ['medio', 'dificil'] as const) {
      for (let seed = 1; seed <= 20; seed++) {
        const mov = elegirMovimiento(state, dif, crearRng(seed));
        expect(mov).not.toEqual({ u: 4, v: 5 });
        const after = playMove(state, mov);
        expect(after.status).toBe('playing');
      }
    }
  });

  it('dificil resuelve exactamente finales con <= 11 aristas libres y gana desde posición ganadora', () => {
    // Desde el estado de 8 libres, J2 tiene victoria forzada jugando p.ej. (0,5)
    const state = aplicarSecuencia([
      { u: 0, v: 1 },
      { u: 1, v: 5 },
      { u: 0, v: 2 },
      { u: 2, v: 5 },
      { u: 0, v: 3 },
      { u: 3, v: 5 },
      { u: 0, v: 4 },
    ]);

    // J2 (dificil) debe ganar siempre contra cualquier jugada legal de J1
    let cur = state;
    const rng = crearRng(123);
    while (cur.status === 'playing') {
      const mov =
        cur.currentPlayer === 2
          ? elegirMovimiento(cur, 'dificil', rng)
          : jugadaAzar(cur, rng);
      cur = playMove(cur, mov);
    }
    expect(cur.winner).toBe(2);
  });

  it('calibración determinista con partidas espejo: dificil > medio > facil > azar', () => {
    const rng = crearRng(2026);
    const PARES = 20; // 40 partidas por enfrentamiento (20 como J1, 20 como J2)
    let dificilGana = 0;
    let medioGana = 0;

    for (let i = 0; i < PARES; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'dificil', rng) === 2) dificilGana++;

      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('facil', 'medio', rng) === 2) medioGana++;
    }

    const M = 60;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      const azarJugador = i % 2 === 0 ? 1 : 2;
      const ganador =
        azarJugador === 1
          ? simular('azar', 'facil', rng)
          : simular('facil', 'azar', rng);
      if (ganador === azarJugador) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(medioGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(azarGana).toBeGreaterThan(M * 0.1);
  });
});
