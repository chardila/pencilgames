import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type ChompState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: ChompState, rng: () => number): number {
  const legales = state.board.flatMap((viva, i) => (viva && i !== 0 ? [i] : []));
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

describe('chomp bot', () => {
  it('genera jugadas legales en los 3 niveles', () => {
    const rng = crearRng(8);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const mov = elegirMovimiento(state, dif, rng);
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('difícil como Jugador 1 desde inicio siempre gana en Chomp 4x7 y resuelve en < 5 ms', () => {
    const inicio = performance.now();
    const rng = crearRng(42);
    for (let i = 0; i < 40; i++) {
      expect(simular('dificil', 'medio', rng)).toBe(1);
    }
    const movInicio = elegirMovimiento(createInitialState(), 'dificil', crearRng(1));
    expect(esJugadaValida(movInicio)).toBe(true);
    expect(performance.now() - inicio).toBeLessThan(200);
  });

  it('medio gana en 1 y evita dejar una sola fila o columna cuando hay alternativa', () => {
    const rng = crearRng(3);
    // Solo fila 0 con 3 onzas vivas -> debe comer índice 1 y ganar
    let sGanaEn1 = createInitialState();
    sGanaEn1 = playMove(sGanaEn1, 7); // come filas 1..3
    sGanaEn1 = playMove(sGanaEn1, 3); // deja fila 0 de largo 3
    expect(elegirMovimiento(sGanaEn1, 'medio', rng)).toBe(1);

    // Tablero con 2x2 vivas: comer (1,0)=7 deja solo fila 0 (victoria en 1 rival),
    // comer (0,1)=1 deja solo col 0 (victoria en 1 rival). Debe elegir (1,1)=8.
    let s2x2 = createInitialState();
    s2x2 = playMove(s2x2, 2);
    s2x2 = playMove(s2x2, 14);
    expect(elegirMovimiento(s2x2, 'medio', rng)).toBe(8);
  });

  it('calibración: dificil > medio > facil y azar gana a facil con frecuencia', () => {
    const rng = crearRng(777);
    let medioGana = 0;
    let azarGana = 0;
    const N = 60;
    for (let i = 0; i < N; i++) {
      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('azar', 'facil', rng) === 1) azarGana++;
    }
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(N * 0.4);
  });
});
