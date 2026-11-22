import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove, type TresEnRayaState } from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugarPartida(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 'X' ? dif1 : dif2;
    let mov: number;
    if (dif === 'azar') {
      const libres = state.board.flatMap((v, i) => (v === null ? [i] : []));
      mov = libres[Math.floor(rng() * libres.length)];
    } else {
      mov = elegirMovimiento(state, dif, rng);
    }
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('tres-en-raya bot', () => {
  it('devuelve siempre una jugada legal en todas las dificultades', () => {
    const rng = crearRng(42);
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

  it('difícil nunca pierde en ninguna rama posible (ni como X ni como O)', () => {
    const rng = crearRng(1);
    function explorar(state: TresEnRayaState, asientoBot: 'X' | 'O'): void {
      if (state.status === 'won') {
        expect(state.winner).toBe(asientoBot);
        return;
      }
      if (state.status === 'draw') return;

      if (state.currentPlayer === asientoBot) {
        const mov = elegirMovimiento(state, 'dificil', rng);
        explorar(playMove(state, mov), asientoBot);
      } else {
        for (let i = 0; i < 9; i++) {
          if (state.board[i] === null) {
            explorar(playMove(state, i), asientoBot);
          }
        }
      }
    }

    explorar(createInitialState(), 'X');
    explorar(createInitialState(), 'O');
  });

  it('medio gana en 1 y bloquea amenaza directa en 1', () => {
    // O tiene dos en línea (3, 4) -> debe cerrar 5 para ganar
    let sGanar = createInitialState();
    for (const m of [0, 3, 1, 4, 8]) sGanar = playMove(sGanar, m);
    expect(elegirMovimiento(sGanar, 'medio', crearRng(7))).toBe(5);

    // X tiene dos en línea (0, 1) -> O debe bloquear en 2
    let sBloquear = createInitialState();
    for (const m of [0, 4, 1]) sBloquear = playMove(sBloquear, m);
    expect(elegirMovimiento(sBloquear, 'medio', crearRng(7))).toBe(2);
  });

  it('progresión de dificultad: medio supera a fácil y azar vence a fácil', () => {
    const rng = crearRng(123);
    let medioGana = 0;
    let azarGanaAFacil = 0;
    const N = 80;
    for (let i = 0; i < N; i++) {
      if (jugarPartida('medio', 'facil', rng) === 'X') medioGana++;
      if (jugarPartida('azar', 'facil', rng) === 'X') azarGanaAFacil++;
    }
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGanaAFacil).toBeGreaterThan(N * 0.45);
  });
});
