import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type GomokuState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: GomokuState, rng: () => number): number {
  const vacias: number[] = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] === null) vacias.push(i);
  }
  return vacias[Math.floor(rng() * vacias.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('gomoku bot', () => {
  it('genera jugadas legales en menos de 30 ms por turno en los 3 niveles', () => {
    const rng = crearRng(12);
    let state = createInitialState();
    // Avanzar una partida medio llena con difícil y medir cada respuesta.
    for (let turno = 0; turno < 24 && state.status === 'playing'; turno++) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(state.board[mov]).toBeNull();
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }
  });

  it('medio y difícil completan 5 en línea y bloquean 4 en línea del rival', () => {
    const rng = crearRng(7);
    // J1 alinea 4 en fila 4: cols 1,2,3,4 -> índices 37,38,39,40. Turno de J1: debe ganar en 36 o 41.
    let sGanar = createInitialState();
    for (const [m1, m2] of [
      [37, 0],
      [38, 1],
      [39, 2],
      [40, 3],
    ]) {
      sGanar = playMove(sGanar, m1);
      sGanar = playMove(sGanar, m2);
    }
    for (const dif of ['medio', 'dificil'] as const) {
      expect([36, 41]).toContain(elegirMovimiento(sGanar, dif, rng));
    }

    // J1 tiene 4 en fila (37..40); tras su jugada 40 le toca a J2 -> debe bloquear en 36 o 41.
    let sBloquear4 = createInitialState();
    sBloquear4 = playMove(sBloquear4, 37); // J1
    sBloquear4 = playMove(sBloquear4, 0); // J2
    sBloquear4 = playMove(sBloquear4, 38); // J1
    sBloquear4 = playMove(sBloquear4, 1); // J2
    sBloquear4 = playMove(sBloquear4, 39); // J1
    sBloquear4 = playMove(sBloquear4, 2); // J2
    sBloquear4 = playMove(sBloquear4, 40); // J1 -> ahora J2 debe bloquear en 36 o 41
    for (const dif of ['medio', 'dificil'] as const) {
      expect([36, 41]).toContain(elegirMovimiento(sBloquear4, dif, rng));
    }
  });

  it('facil omite una victoria inmediata de 5 en línea cuando rng >= 0.35 y hay otras casillas', () => {
    let sGanar = createInitialState();
    for (const [m1, m2] of [
      [37, 0],
      [38, 1],
      [39, 2],
      [40, 3],
    ]) {
      sGanar = playMove(sGanar, m1);
      sGanar = playMove(sGanar, m2);
    }

    const movOmitido = elegirMovimiento(sGanar, 'facil', () => 0.5);
    expect(esJugadaValida(movOmitido)).toBe(true);
    expect(sGanar.board[movOmitido]).toBeNull();
    expect([36, 41]).not.toContain(movOmitido);

    const movGanador = elegirMovimiento(sGanar, 'facil', () => 0.1);
    expect([36, 41]).toContain(movGanador);
  });

  it('calibración: dificil > medio > facil y azar gana a facil', () => {
    const rng = crearRng(909);
    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;
    const N = 20;
    const M = 60;
    for (let i = 0; i < N; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'facil', rng) === 1) medioGana++;
    }
    for (let i = 0; i < M; i++) {
      if (simular('azar', 'facil', rng) === 1) azarGana++;
    }
    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(M * 0.1);
  });
});
