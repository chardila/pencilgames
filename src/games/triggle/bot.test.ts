import { describe, expect, it } from 'vitest';
import {
  contarTriangulos,
  createInitialState,
  esJugadaValida,
  esMove,
  movimientosValidos,
  playMove,
  TRIANGULOS,
  claveDeArista,
  type Move,
  type TriggleState,
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

function jugadaAzar(state: TriggleState, rng: () => number): Move {
  const legales = movimientosValidos(state);
  const idx = Math.min(legales.length - 1, Math.floor(rng() * legales.length));
  return legales[idx];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng1: () => number,
  rng2: () => number = rng1
): TriggleState {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const rng = state.currentPlayer === 1 ? rng1 : rng2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esMove(mov)).toBe(true);
    expect(esJugadaValida(state, mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state;
}

function contarTriangulosCon2Lados(state: TriggleState): number {
  let count = 0;
  for (let i = 0; i < TRIANGULOS.length; i++) {
    if (state.triangleOwners[i] !== null) continue;
    let activos = 0;
    for (const a of TRIANGULOS[i].aristas) {
      if (state.edges[claveDeArista(a)] !== undefined) activos++;
    }
    if (activos === 2) count++;
  }
  return count;
}

describe('triggle bot', () => {
  it('devuelve movimientos legales, deterministas y en < 30 ms durante toda una partida', () => {
    const rng = crearRng(42);
    let state = createInitialState();
    let maxMs = 0;
    let totalMs = 0;
    let mediciones = 0;

    while (state.status === 'playing') {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const movA = elegirMovimiento(state, dif, crearRng(1234 + state.jugadaCount));
        const dt = performance.now() - t0;
        if (dt > maxMs) maxMs = dt;
        totalMs += dt;
        mediciones++;

        const movB = elegirMovimiento(state, dif, crearRng(1234 + state.jugadaCount));
        expect(movA).toEqual(movB);
        expect(dt).toBeLessThan(30);
        expect(esMove(movA)).toBe(true);
        expect(esJugadaValida(state, movA)).toBe(true);
        expect(playMove(state, movA)).not.toBe(state);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }

    expect(state.status).toBe('finished');
    expect(maxMs).toBeLessThan(30);
    expect(totalMs / mediciones).toBeLessThan(15);
  });

  it('medio y difícil cierran triángulos inmediatos y maximizan cierres múltiples', () => {
    const rng = crearRng(7);

    // 1 cierre inmediato disponible
    let s1 = createInitialState();
    s1 = playMove(s1, { q: 0, r: 0, dir: 'H' });
    s1 = playMove(s1, { q: 0, r: 0, dir: 'D1' });
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(s1, dif, rng);
      const next = playMove(s1, mov);
      expect(contarTriangulos(next)[1]).toBeGreaterThan(contarTriangulos(s1)[1]);
    }

    // 2 cierres simultáneos vs 1 cierre: D2(0,1) cierra 2 triángulos a la vez
    let s2 = createInitialState();
    s2 = playMove(s2, { q: 0, r: 0, dir: 'H' });
    s2 = playMove(s2, { q: 0, r: 0, dir: 'D1' });
    s2 = playMove(s2, { q: 1, r: -1, dir: 'D1' });
    s2 = playMove(s2, { q: -1, r: 1, dir: 'H' });
    expect(s2.currentPlayer).toBe(1);

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(s2, dif, rng);
      const next = playMove(s2, mov);
      expect(contarTriangulos(next)[1] - contarTriangulos(s2)[1]).toBe(2);
    }
  });

  it('medio y difícil evitan regalar triángulos con 2 lados cuando hay jugadas seguras', () => {
    const rng = crearRng(19);
    const s = playMove(createInitialState(), { q: 0, r: 0, dir: 'H' });
    expect(contarTriangulosCon2Lados(s)).toBe(0);

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(s, dif, rng);
      const next = playMove(s, mov);
      expect(contarTriangulosCon2Lados(next)).toBe(0);
    }
  });

  it('fácil omite cierres inmediatos cuando rng >= 0.35 y existen alternativas', () => {
    let s = createInitialState();
    s = playMove(s, { q: 0, r: 0, dir: 'H' });
    s = playMove(s, { q: 0, r: 0, dir: 'D1' });

    const movOmitido = elegirMovimiento(s, 'facil', () => 0.5);
    expect(esJugadaValida(s, movOmitido)).toBe(true);
    expect(contarTriangulos(playMove(s, movOmitido))[1]).toBe(0);

    const movCierre = elegirMovimiento(s, 'facil', () => 0.1);
    expect(esJugadaValida(s, movCierre)).toBe(true);
    expect(contarTriangulos(playMove(s, movCierre))[1]).toBeGreaterThan(0);
  });

  it('calibración determinista: dificil > medio > facil (>65%) y azar gana a facil', () => {
    const pares = 12; // 24 partidas espejo por duelo
    let dificilPts = 0;
    let medioVsFacilPts = 0;

    for (let i = 0; i < pares; i++) {
      // Duelo Difícil vs Medio (partidas espejo)
      const resDM1 = simular('dificil', 'medio', crearRng(100 + i), crearRng(200 + i));
      if (resDM1.winner === 1) dificilPts += 1;
      else if (resDM1.winner === null) dificilPts += 0.5;

      const resDM2 = simular('medio', 'dificil', crearRng(200 + i), crearRng(100 + i));
      if (resDM2.winner === 2) dificilPts += 1;
      else if (resDM2.winner === null) dificilPts += 0.5;

      // Duelo Medio vs Fácil (partidas espejo)
      const resMF1 = simular('medio', 'facil', crearRng(300 + i), crearRng(400 + i));
      if (resMF1.winner === 1) medioVsFacilPts += 1;
      else if (resMF1.winner === null) medioVsFacilPts += 0.5;

      const resMF2 = simular('facil', 'medio', crearRng(400 + i), crearRng(300 + i));
      if (resMF2.winner === 2) medioVsFacilPts += 1;
      else if (resMF2.winner === null) medioVsFacilPts += 0.5;
    }

    const totalPartidas = pares * 2;
    expect(dificilPts / totalPartidas).toBeGreaterThan(0.65);
    expect(medioVsFacilPts / totalPartidas).toBeGreaterThan(0.65);

    // Azar vs Fácil: jugador aleatorio gana partidas frente a fácil
    let azarGana = 0;
    const totalAzar = 20;
    for (let i = 0; i < totalAzar; i++) {
      const res = simular(
        i % 2 === 0 ? 'azar' : 'facil',
        i % 2 === 0 ? 'facil' : 'azar',
        crearRng(500 + i),
        crearRng(600 + i)
      );
      const ganadorEsperado = i % 2 === 0 ? 1 : 2;
      if (res.winner === ganadorEsperado) azarGana++;
    }
    expect(azarGana).toBeGreaterThan(2);
  });
});
