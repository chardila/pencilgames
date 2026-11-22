import { describe, expect, it } from 'vitest';
import {
  ALL_CANDIDATES,
  CANDIDATES_BY_KEY,
  createInitialState,
  esFence,
  esFenceLegal,
  fenceKey,
  jugarFence,
  type ConquistaPlayer,
  type ConquistaState,
  type Fence,
  type Point,
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

function jugadaAzar(state: ConquistaState, rng: () => number): Fence {
  const legales = ALL_CANDIDATES.filter(info => esFenceLegal(state, info));
  const idx = Math.min(legales.length - 1, Math.floor(rng() * legales.length));
  return legales[idx].fence;
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
): { winner: ConquistaPlayer | null; scores: Record<ConquistaPlayer, number> } {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esFence(mov)).toBe(true);
    const info = CANDIDATES_BY_KEY.get(fenceKey(mov.a, mov.b));
    expect(info).toBeDefined();
    expect(esFenceLegal(state, info!)).toBe(true);
    const next = jugarFence(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  const winner: ConquistaPlayer | null =
    state.scores[1] === state.scores[2]
      ? null
      : state.scores[1] > state.scores[2]
        ? 1
        : 2;
  return { winner, scores: state.scores };
}

function jugarSegura(state: ConquistaState, a: Point, b: Point): ConquistaState {
  const next = jugarFence(state, { a, b });
  expect(next).not.toBe(state);
  return next;
}

function maxCierreRival(state: ConquistaState): number {
  let maxArea = 0;
  for (const info of ALL_CANDIDATES) {
    if (!esFenceLegal(state, info)) continue;
    const next = jugarFence(state, info.fence);
    const gained = next.scores[state.currentPlayer] - state.scores[state.currentPlayer];
    if (gained > maxArea) maxArea = gained;
  }
  return maxArea;
}

describe('conquista bot', () => {
  it('genera jugadas legales, deterministas y en < 30 ms durante toda una partida', () => {
    const rng = crearRng(2026);
    let state = createInitialState();
    let turnos = 0;
    const tiempos: number[] = [];

    while (state.status === 'playing' && turnos < 200) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, crearRng(100 + turnos));
        const dt = performance.now() - t0;
        tiempos.push(dt);
        expect(dt).toBeLessThan(30);
        expect(esFence(mov)).toBe(true);
        const info = CANDIDATES_BY_KEY.get(fenceKey(mov.a, mov.b));
        expect(info).toBeDefined();
        expect(esFenceLegal(state, info!)).toBe(true);

        // Determinismo estricto con la misma semilla
        const movRepetido = elegirMovimiento(state, dif, crearRng(100 + turnos));
        expect(fenceKey(movRepetido.a, movRepetido.b)).toBe(fenceKey(mov.a, mov.b));
      }
      state = jugarFence(state, elegirMovimiento(state, 'dificil', rng));
      turnos++;
    }

    const promedio = tiempos.reduce((acc, v) => acc + v, 0) / tiempos.length;
    expect(promedio).toBeLessThan(15);
  });

  it('medio y difícil cierran la cara de mayor área disponible', () => {
    // Triángulo (0,0)-(0,1)-(1,0) de área 0.5 faltando (0,1)-(1,0)
    let state = createInitialState();
    state = jugarSegura(state, { row: 0, col: 0 }, { row: 0, col: 1 });
    state = jugarSegura(state, { row: 0, col: 0 }, { row: 1, col: 0 });

    // Cuadrado (3,3)-(3,4)-(4,4)-(4,3) de área 1.0 faltando (3,3)-(3,4)
    state = jugarSegura(state, { row: 3, col: 4 }, { row: 4, col: 4 });
    state = jugarSegura(state, { row: 4, col: 4 }, { row: 4, col: 3 });
    state = jugarSegura(state, { row: 4, col: 3 }, { row: 3, col: 3 });

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, crearRng(7));
      const next = jugarFence(state, mov);
      const gained = next.scores[state.currentPlayer] - state.scores[state.currentPlayer];
      expect(gained).toBe(1);
    }
  });

  it('facil omite cierres inmediatos cuando rng >= 0.45 y toma cierres cuando rng < 0.45', () => {
    let state = createInitialState();
    state = jugarSegura(state, { row: 0, col: 0 }, { row: 0, col: 1 });
    state = jugarSegura(state, { row: 0, col: 0 }, { row: 1, col: 0 });

    const cierreKey = fenceKey({ row: 0, col: 1 }, { row: 1, col: 0 });
    const movOmitido = elegirMovimiento(state, 'facil', () => 0.8);
    expect(fenceKey(movOmitido.a, movOmitido.b)).not.toBe(cierreKey);

    const movTomado = elegirMovimiento(state, 'facil', () => 0.1);
    expect(fenceKey(movTomado.a, movTomado.b)).toBe(cierreKey);
  });

  it('medio y difícil evitan regalar cierres inmediatos si hay vallas seguras', () => {
    // Dos segmentos paralelos (0,0)-(0,1) y (1,0)-(1,1): cualquier valla que los una
    // regala cierre inmediato al rival, pero existen muchas vallas seguras lejos.
    let state = createInitialState();
    state = jugarSegura(state, { row: 0, col: 0 }, { row: 0, col: 1 });
    state = jugarSegura(state, { row: 1, col: 0 }, { row: 1, col: 1 });

    for (const dif of ['medio', 'dificil'] as const) {
      for (let seed = 1; seed <= 10; seed++) {
        const mov = elegirMovimiento(state, dif, crearRng(seed));
        const after = jugarFence(state, mov);
        expect(maxCierreRival(after)).toBe(0);
      }
    }
  });

function quedanSegurasTest(state: ConquistaState): boolean {
  const legales = ALL_CANDIDATES.filter(info => esFenceLegal(state, info));
  if (legales.length > 75) return true; // en tableros muy abiertos siempre hay vallas seguras
  const p = Array.from({ length: 36 }, (_, i) => i);
  const find = (x: number): number => {
    while (p[x] !== x) {
      p[x] = p[p[x]];
      x = p[x];
    }
    return x;
  };
  for (const key of state.fences.keys()) {
    const info = CANDIDATES_BY_KEY.get(key);
    if (!info) continue;
    for (const sub of info.subSegments) {
      const u = sub.a.row * 6 + sub.a.col;
      const v = sub.b.row * 6 + sub.b.col;
      const ru = find(u);
      const rv = find(v);
      if (ru !== rv) p[ru] = rv;
    }
  }
  const comp = p.map((_, i) => find(i));
  for (const c of legales) {
    const pts =
      c.subSegments.length === 2
        ? [
            c.fence.a.row * 6 + c.fence.a.col,
            ((c.fence.a.row + c.fence.b.row) / 2) * 6 + (c.fence.a.col + c.fence.b.col) / 2,
            c.fence.b.row * 6 + c.fence.b.col,
          ]
        : [c.fence.a.row * 6 + c.fence.a.col, c.fence.b.row * 6 + c.fence.b.col];
    const roots = new Set(pts.map(v => comp[v]));
    if (roots.size < pts.length) continue; // ya cierra ciclo
    let regala = false;
    for (const j of legales) {
      if (c.collinearGroup.has(j.key) || c.crossesWith.has(j.key)) continue;
      const jPts =
        j.subSegments.length === 2
          ? [
              j.fence.a.row * 6 + j.fence.a.col,
              ((j.fence.a.row + j.fence.b.row) / 2) * 6 + (j.fence.a.col + j.fence.b.col) / 2,
              j.fence.b.row * 6 + j.fence.b.col,
            ]
          : [j.fence.a.row * 6 + j.fence.a.col, j.fence.b.row * 6 + j.fence.b.col];
      let hits = 0;
      for (const v of jPts) if (roots.has(comp[v])) hits++;
      if (hits >= 2) {
        regala = true;
        break;
      }
    }
    if (!regala) return true;
  }
  return false;
}

  it('difícil sacrifica la cara de menor área cuando no quedan vallas seguras', () => {
    let probados = 0;
    for (let seed = 55; seed < 70 && probados < 5; seed++) {
      let state = createInitialState();
      const rng = crearRng(seed);
      while (state.status === 'playing') {
        if (!quedanSegurasTest(state)) {
          const hayCierre = ALL_CANDIDATES.some(info => {
            if (!esFenceLegal(state, info)) return false;
            return jugarFence(state, info.fence).regions.length > state.regions.length;
          });
          if (!hayCierre) {
            let minRegalo = Infinity;
            for (const info of ALL_CANDIDATES) {
              if (!esFenceLegal(state, info)) continue;
              const after = jugarFence(state, info.fence);
              const regalo = maxCierreRival(after);
              if (regalo < minRegalo) minRegalo = regalo;
            }
            const movDif = elegirMovimiento(state, 'dificil', crearRng(99 + seed));
            const afterDif = jugarFence(state, movDif);
            expect(maxCierreRival(afterDif)).toBe(minRegalo);
            probados++;
            break;
          }
        }
        state = jugarFence(state, elegirMovimiento(state, 'medio', rng));
      }
    }
    expect(probados).toBeGreaterThanOrEqual(3);
  });

  it('calibración: dificil > medio > facil (> 65% en partidas espejo) y azar gana a facil', () => {
    const N = 20;
    let dificilGana = 0;
    let medioGana = 0;
    for (let i = 0; i < N; i++) {
      const seed = 3000 + Math.floor(i / 2);
      // Partidas espejo alternando asientos
      if (i % 2 === 0) {
        if (simular('dificil', 'medio', crearRng(seed)).winner === 1) dificilGana++;
        if (simular('medio', 'facil', crearRng(seed)).winner === 1) medioGana++;
      } else {
        if (simular('medio', 'dificil', crearRng(seed)).winner === 2) dificilGana++;
        if (simular('facil', 'medio', crearRng(seed)).winner === 2) medioGana++;
      }
    }

    const M = 30;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      const seed = 5000 + i;
      if (i % 2 === 0) {
        if (simular('azar', 'facil', crearRng(seed)).winner === 1) azarGana++;
      } else {
        if (simular('facil', 'azar', crearRng(seed)).winner === 2) azarGana++;
      }
    }

    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(0);
  });
});
