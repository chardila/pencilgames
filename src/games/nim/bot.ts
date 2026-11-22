import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import type { NimMove, NimState } from './engine';

function jugadasOptimasXor(montones: readonly number[]): NimMove[] {
  const nimSum = montones.reduce((acc, n) => acc ^ n, 0);
  if (nimSum === 0) return [];

  const optimas: NimMove[] = [];
  for (let fila = 0; fila < montones.length; fila++) {
    const actual = montones[fila];
    const dejar = actual ^ nimSum;
    if (dejar < actual) {
      optimas.push({ fila, dejar });
    }
  }
  return optimas;
}

function filasActivas(montones: readonly number[]): number[] {
  const filas: number[] = [];
  for (let i = 0; i < montones.length; i++) {
    if (montones[i] > 0) filas.push(i);
  }
  return filas;
}

function jugadaSuave(montones: readonly number[], rng: Rng): NimMove {
  const activas = filasActivas(montones);
  const fila = elegirAlAzar(activas, rng);
  const maxQuitar = Math.min(2, montones[fila]);
  const quitar = Math.floor(rng() * maxQuitar) + 1;
  return { fila, dejar: montones[fila] - quitar };
}

/**
 * Elige la siguiente jugada del bot en Nim según la dificultad configurada.
 */
export function elegirMovimiento(
  state: NimState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): NimMove {
  const activas = filasActivas(state.montones);
  if (activas.length === 0) return { fila: 0, dejar: 0 };

  if (dificultad === 'facil') {
    if (activas.length === 1) {
      const fila = activas[0];
      const n = state.montones[fila];
      if (n === 1 || rng() < 0.4) return { fila, dejar: 0 };
      const dejar = Math.min(2, Math.floor(rng() * (n - 1)) + 1);
      return { fila, dejar };
    }
    const fila = elegirAlAzar(activas, rng);
    const dejar = Math.floor(rng() * state.montones[fila]);
    return { fila, dejar };
  }

  if (dificultad === 'medio') {
    if (activas.length === 1) {
      return { fila: activas[0], dejar: 0 };
    }
    if (activas.length === 2) {
      const [f0, f1] = activas;
      const n0 = state.montones[f0];
      const n1 = state.montones[f1];
      if (n0 !== n1) {
        return n0 > n1 ? { fila: f0, dejar: n1 } : { fila: f1, dejar: n0 };
      }
    }
    const optimas = jugadasOptimasXor(state.montones);
    if (optimas.length > 0 && rng() < 0.45) {
      return elegirAlAzar(optimas, rng);
    }
    return jugadaSuave(state.montones, rng);
  }

  const optimas = jugadasOptimasXor(state.montones);
  if (optimas.length > 0) {
    return elegirAlAzar(optimas, rng);
  }
  const fila = elegirAlAzar(activas, rng);
  return { fila, dejar: state.montones[fila] - 1 };
}
