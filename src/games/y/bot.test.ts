import { describe, expect, it } from 'vitest';
import {
  cellCount,
  createInitialState,
  esJugadaValida,
  indexOf,
  playMove,
  type BoardSize,
  type YState,
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

function jugadaAzar(state: YState, rng: () => number): number {
  const vacias: number[] = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] === null) vacias.push(i);
  }
  return vacias[Math.floor(rng() * vacias.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  size: BoardSize,
  rng: () => number
) {
  let state = createInitialState(size);
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar'
        ? jugadaAzar(state, rng)
        : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov, state.size)).toBe(true);
    expect(state.board[mov]).toBeNull();
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('y bot', () => {
  it('genera jugadas legales, deterministas y en menos de 30 ms en tamaños 7, 9 y 11', () => {
    for (const size of [7, 9, 11] as const) {
      const rng = crearRng(100 + size);
      let state = createInitialState(size);
      const total = cellCount(size);

      // Estado inicial, intermedios y cercanos al final
      for (let turno = 0; turno < total && state.status === 'playing'; turno++) {
        for (const dif of ['facil', 'medio', 'dificil'] as const) {
          const t0 = performance.now();
          const mov1 = elegirMovimiento(state, dif, crearRng(777 + turno));
          const elapsed = performance.now() - t0;
          expect(
            elapsed,
            `size=${size} turno=${turno} dif=${dif} mov=${mov1}`
          ).toBeLessThan(30);
          expect(esJugadaValida(mov1, size)).toBe(true);
          expect(state.board[mov1]).toBeNull();
          expect(playMove(state, mov1)).not.toBe(state);

          // Determinismo con la misma semilla
          const mov2 = elegirMovimiento(state, dif, crearRng(777 + turno));
          expect(mov2).toBe(mov1);
        }
        state = playMove(state, elegirMovimiento(state, 'dificil', rng));
      }
    }
  });

  it('funciona en estados cercanos al final con 1 sola casilla libre', () => {
    for (const size of [7, 9, 11] as const) {
      const rng = crearRng(42 + size);
      let state = createInitialState(size);
      while (state.status === 'playing') {
        const vacias = state.board.filter(c => c === null).length;
        if (vacias <= 3) {
          for (const dif of ['facil', 'medio', 'dificil'] as const) {
            const mov = elegirMovimiento(state, dif, crearRng(99));
            expect(esJugadaValida(mov, size)).toBe(true);
            expect(state.board[mov]).toBeNull();
            expect(playMove(state, mov)).not.toBe(state);
          }
          break;
        }
        state = playMove(state, jugadaAzar(state, rng));
      }
    }
  });

  it('medio y dificil toman victoria en 1 y bloquean victoria rival en 1 en todos los tamaños', () => {
    const rng = crearRng(7);

    for (const size of [7, 9, 11] as const) {
      // Construir una Y casi completa para J1 con una ÚNICA casilla ganadora (2, 1):
      // (2, 0) [izq], (1, 1) [der], y cadena vertical (3, 2)..(S-1, 2) [inf].
      // Ninguna componente toca más de un lado y solo (2, 1) toca las tres a la vez.
      const j1Stones: number[] = [indexOf(2, 0), indexOf(1, 1)];
      for (let r = 3; r <= size - 1; r++) {
        j1Stones.push(indexOf(r, 2));
      }
      // Fichas de relleno para J2 lejos de (2, 1) y sin tocar izq ni inf
      const j2Pool: number[] = [
        indexOf(3, 3),
        indexOf(4, 3),
        indexOf(4, 4),
        indexOf(5, 3),
        indexOf(5, 4),
        indexOf(5, 5),
        indexOf(6, 4),
        indexOf(6, 5),
        indexOf(7, 5),
        indexOf(7, 6),
      ];

      let sGanar = createInitialState(size);
      for (let k = 0; k < j1Stones.length; k++) {
        sGanar = playMove(sGanar, j1Stones[k]);
        sGanar = playMove(sGanar, j2Pool[k]);
      }
      expect(sGanar.status).toBe('playing');
      expect(sGanar.currentPlayer).toBe(1);
      const casillaGanadora = indexOf(2, 1);

      for (const dif of ['medio', 'dificil'] as const) {
        expect(elegirMovimiento(sGanar, dif, rng)).toBe(casillaGanadora);
      }

      // Bloqueo en 1: si J1 tiene todas las piezas excepto la última jugada antes de que J2 mueva,
      // mejor: J1 pone todas sus piezas (la última en j1Stones[last]) -> turno de J2.
      let sBloquear = createInitialState(size);
      for (let k = 0; k < j1Stones.length - 1; k++) {
        sBloquear = playMove(sBloquear, j1Stones[k]);
        sBloquear = playMove(sBloquear, j2Pool[k]);
      }
      sBloquear = playMove(sBloquear, j1Stones[j1Stones.length - 1]);
      expect(sBloquear.status).toBe('playing');
      expect(sBloquear.currentPlayer).toBe(2);

      for (const dif of ['medio', 'dificil'] as const) {
        expect(elegirMovimiento(sBloquear, dif, rng)).toBe(casillaGanadora);
      }
    }
  });

  it('facil omite una victoria inmediata cuando rng >= 0.35 y hay alternativas', () => {
    const size: BoardSize = 7;
    const j1Stones = [
      indexOf(2, 0),
      indexOf(1, 1),
      indexOf(3, 2),
      indexOf(4, 2),
      indexOf(5, 2),
      indexOf(6, 2),
    ];
    const j2Stones = [
      indexOf(3, 3),
      indexOf(4, 3),
      indexOf(4, 4),
      indexOf(5, 3),
      indexOf(5, 4),
      indexOf(5, 5),
    ];

    let sGanar = createInitialState(size);
    for (let k = 0; k < j1Stones.length; k++) {
      sGanar = playMove(sGanar, j1Stones[k]);
      sGanar = playMove(sGanar, j2Stones[k]);
    }
    const ganadora = indexOf(2, 1);
    expect(playMove(sGanar, ganadora).status).toBe('won');

    const omitido = elegirMovimiento(sGanar, 'facil', () => 0.5);
    expect(esJugadaValida(omitido, size)).toBe(true);
    expect(sGanar.board[omitido]).toBeNull();
    expect(omitido).not.toBe(ganadora);

    const tomado = elegirMovimiento(sGanar, 'facil', () => 0.1);
    expect(tomado).toBe(ganadora);
  });

  it('dificil defiende un puente atacado en el último movimiento del rival', () => {
    const size: BoardSize = 7;
    // J1 construye grupo izq {(3,0), (3,1)} y grupo der {(4,3), (4,4), (5,3)} con puente {(3,2), (4,2)}.
    // J2 juega al final en (3,2), amenazando cortar el puente. J1 debe responder en (4,2).
    const secuencia = [
      indexOf(3, 0), // J1
      indexOf(1, 1), // J2
      indexOf(3, 1), // J1
      indexOf(2, 1), // J2
      indexOf(4, 3), // J1
      indexOf(2, 2), // J2
      indexOf(4, 4), // J1
      indexOf(5, 5), // J2
      indexOf(5, 3), // J1
      indexOf(3, 2), // J2 ataca el puente {(3,2), (4,2)}
    ];
    let state = createInitialState(size);
    for (const m of secuencia) {
      state = playMove(state, m);
    }
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(1);

    const mov = elegirMovimiento(state, 'dificil', crearRng(123));
    expect(mov).toBe(indexOf(4, 2));
  });

  it('calibración determinista con partidas espejo: dificil > medio > facil y azar gana a facil', () => {
    const rng = crearRng(202611);
    const N = 20; // 10 como J1 + 10 como J2
    const M = 40; // 20 como J1 + 20 como J2

    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;

    for (let i = 0; i < N; i++) {
      const difEsJ1 = i % 2 === 0;
      const wDM = difEsJ1
        ? simular('dificil', 'medio', 7, rng)
        : simular('medio', 'dificil', 7, rng);
      if (wDM === (difEsJ1 ? 1 : 2)) dificilGana++;

      const wMF = difEsJ1
        ? simular('medio', 'facil', 7, rng)
        : simular('facil', 'medio', 7, rng);
      if (wMF === (difEsJ1 ? 1 : 2)) medioGana++;
    }

    for (let i = 0; i < M; i++) {
      const azarEsJ1 = i % 2 === 0;
      const wAF = azarEsJ1
        ? simular('azar', 'facil', 7, rng)
        : simular('facil', 'azar', 7, rng);
      if (wAF === (azarEsJ1 ? 1 : 2)) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(M * 0.15);

    // También en tamaño estándar 9
    let dificilGana9 = 0;
    const N9 = 12;
    for (let i = 0; i < N9; i++) {
      const difEsJ1 = i % 2 === 0;
      const w = difEsJ1
        ? simular('dificil', 'medio', 9, rng)
        : simular('medio', 'dificil', 9, rng);
      if (w === (difEsJ1 ? 1 : 2)) dificilGana9++;
    }
    expect(dificilGana9).toBeGreaterThan(N9 * 0.65);
  });
});
