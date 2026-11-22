import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type NimMove, type NimState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function nimSum(montones: readonly number[]): number {
  return montones.reduce((acc, n) => acc ^ n, 0);
}

function jugadaAzar(state: NimState, rng: () => number): NimMove {
  const filas = state.montones.flatMap((n, fila) => (n > 0 ? [fila] : []));
  const fila = filas[Math.floor(rng() * filas.length)];
  const dejar = Math.floor(rng() * state.montones[fila]);
  return { fila, dejar };
}

function simular(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('nim bot', () => {
  it('genera jugadas legales en los 3 niveles desde cualquier estado', () => {
    const rng = crearRng(17);
    const estados: NimState[] = [
      createInitialState(),
      { montones: [0, 2, 0, 5], currentPlayer: 2, status: 'playing', winner: null, lastMove: null },
      { montones: [0, 0, 3, 0], currentPlayer: 1, status: 'playing', winner: null, lastMove: null },
    ];
    for (const est of estados) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const mov = elegirMovimiento(est, dif, rng);
        expect(esJugadaValida(mov)).toBe(true);
        expect(playMove(est, mov)).not.toBe(est);
      }
    }
  });

  it('difícil deja siempre nim-sum = 0 cuando la posición es ganadora', () => {
    const rng = crearRng(99);
    const ganadores = [
      [1, 3, 5, 6],
      [0, 2, 4, 5],
      [1, 0, 0, 7],
      [0, 3, 0, 0],
    ];
    for (const montones of ganadores) {
      expect(nimSum(montones)).not.toBe(0);
      const state: NimState = {
        montones,
        currentPlayer: 2,
        status: 'playing',
        winner: null,
        lastMove: null,
      };
      const mov = elegirMovimiento(state, 'dificil', rng);
      const next = playMove(state, mov);
      expect(nimSum(next.montones)).toBe(0);
    }
  });

  it('medio iguala dos montones distintos y cierra con 1 montón', () => {
    const rng = crearRng(5);
    const dosMontones: NimState = {
      montones: [0, 3, 0, 5],
      currentPlayer: 2,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const next = playMove(dosMontones, elegirMovimiento(dosMontones, 'medio', rng));
    expect(next.montones).toEqual([0, 3, 0, 3]);

    const unMonton: NimState = {
      montones: [0, 0, 4, 0],
      currentPlayer: 2,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    expect(playMove(unMonton, elegirMovimiento(unMonton, 'medio', rng)).status).toBe('won');
  });

  it('calibración: dificil > medio > facil y azar gana a facil con frecuencia', () => {
    const rng = crearRng(2026);
    let dificilVsMedio = 0;
    let medioVsFacil = 0;
    let azarVsFacil = 0;
    const N = 80;

    for (let i = 0; i < N; i++) {
      // Nota: desde [1, 3, 5, 7] (nim-sum = 0), quien va 2.º tiene ventaja teórica si juega óptimo;
      // alternamos o medimos en el asiento favorable/simétrico.
      if (simular('medio', 'dificil', rng) === 2) dificilVsMedio++;
      if (simular('medio', 'facil', rng) === 1) medioVsFacil++;
      if (simular('azar', 'facil', rng) === 1) azarVsFacil++;
    }

    expect(dificilVsMedio).toBeGreaterThan(N * 0.75);
    expect(medioVsFacil).toBeGreaterThan(N * 0.65);
    expect(azarVsFacil).toBeGreaterThan(N * 0.45);
  });
});
