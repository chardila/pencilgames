import { describe, expect, it } from 'vitest';
import {
  casillaLegal,
  createInitialState,
  esJugadaValida,
  playMove,
  type ObstruccionState,
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

function jugadaAzar(state: ObstruccionState, rng: () => number): number {
  const legales: number[] = [];
  for (let i = 0; i < 36; i++) {
    if (casillaLegal(state.board, i)) legales.push(i);
  }
  return legales[Math.floor(rng() * legales.length)];
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

describe('obstruccion bot', () => {
  it('devuelve jugadas legales en los 3 niveles en menos de 30 ms por jugada', () => {
    const rng = crearRng(11);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('medio y difícil toman una victoria inmediata', () => {
    const rng = crearRng(5);
    let s = createInitialState();
    let verificado = false;
    while (s.status === 'playing') {
      const ganadoras: number[] = [];
      for (let i = 0; i < 36; i++) {
        if (casillaLegal(s.board, i) && playMove(s, i).status === 'won') ganadoras.push(i);
      }
      if (ganadoras.length > 0) {
        expect(ganadoras).toContain(elegirMovimiento(s, 'medio', rng));
        expect(ganadoras).toContain(elegirMovimiento(s, 'dificil', rng));
        verificado = true;
        break;
      }
      s = playMove(s, jugadaAzar(s, rng));
    }
    expect(verificado).toBe(true);
  });

  it('calibración: dificil > medio > facil y azar gana a facil', () => {
    const rng = crearRng(555);
    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('azar', 'facil', rng) === 1) azarGana++;
    }
    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(N * 0.35);
  });
});
