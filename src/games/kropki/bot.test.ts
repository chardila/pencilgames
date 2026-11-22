import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  esLegal,
  playMove,
  TAMANO,
  TOTAL,
  type KropkiState,
} from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

const idx = (f: number, c: number) => f * TAMANO + c;

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: KropkiState, rng: () => number): number {
  const legales: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (esLegal(state, i)) legales.push(i);
  }
  return legales[Math.floor(rng() * legales.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number,
): 1 | 2 | 'draw' {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    expect(esLegal(state, mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('kropki bot', () => {
  it('genera jugadas legales en estado inicial, intermedio (con territorio) y final en < 30 ms', () => {
    const rng = crearRng(42);
    const inicial = createInitialState();
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const mov = elegirMovimiento(inicial, dif, rng);
      expect(esJugadaValida(mov)).toBe(true);
      expect(esLegal(inicial, mov)).toBe(true);
    }

    // Estado con territorio vacío encerrado: (3,3) queda como territorio de J1.
    let conTerritorio = createInitialState();
    for (const m of [
      idx(2, 3), idx(0, 0),
      idx(3, 2), idx(0, 7),
      idx(3, 4), idx(7, 0),
      idx(4, 3),
    ]) {
      conTerritorio = playMove(conTerritorio, m);
    }
    expect(conTerritorio.territorio[idx(3, 3)]).toBe(1);
    expect(conTerritorio.board[idx(3, 3)]).toBeNull();
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      for (let k = 0; k < 10; k++) {
        const mov = elegirMovimiento(conTerritorio, dif, rng);
        expect(mov).not.toBe(idx(3, 3));
        expect(esLegal(conTerritorio, mov)).toBe(true);
        expect(playMove(conTerritorio, mov)).not.toBe(conTerritorio);
      }
    }

    // Estado cercano al final: casi todo ocupado o territorio, solo 2 casillas libres.
    const casiFinal: KropkiState = {
      ...createInitialState(),
      board: Array.from({ length: TOTAL }, (_, i) =>
        i === 62 || i === 63 ? null : ((i % 2 === 0 ? 1 : 2) as 1 | 2),
      ),
      capturado: Array.from({ length: TOTAL }, (_, i) => i === 27),
      territorio: Array.from({ length: TOTAL }, (_, i) => (i === 27 ? 1 : null)),
      scores: { 1: 1, 2: 0 },
      currentPlayer: 2,
    };
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const mov = elegirMovimiento(casiFinal, dif, rng);
      expect([62, 63]).toContain(mov);
      expect(esLegal(casiFinal, mov)).toBe(true);
      expect(playMove(casiFinal, mov)).not.toBe(casiFinal);
    }

    // Partida completa con medición de tiempo (< 30 ms por jugada, < 15 ms típico)
    let state = createInitialState();
    let maxMs = 0;
    let sumMs = 0;
    let turnos = 0;
    while (state.status === 'playing') {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const dt = performance.now() - t0;
        expect(dt).toBeLessThan(30);
        if (dt > maxMs) maxMs = dt;
        sumMs += dt;
        turnos++;
        expect(esJugadaValida(mov)).toBe(true);
        expect(state.board[mov]).toBeNull();
        expect(state.territorio[mov]).toBeNull();
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }
    expect(sumMs / turnos).toBeLessThan(15);
    expect(maxMs).toBeLessThan(30);
  });

  it('es 100 % determinista con la misma semilla rng', () => {
    let state = createInitialState();
    for (const m of [idx(3, 3), idx(3, 4), idx(2, 3), idx(4, 4), idx(3, 2)]) {
      state = playMove(state, m);
    }
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(state, dif, crearRng(1234));
      const m2 = elegirMovimiento(state, dif, crearRng(1234));
      expect(m1).toBe(m2);
    }
  });

  it('medio y difícil capturan en 1 cuando hay encierro inmediato disponible', () => {
    const rng = crearRng(7);
    // J2 en (3,3). J1 tiene (2,3), (3,2), (3,4) y le falta (4,3) para capturar.
    let state = createInitialState();
    for (const m of [
      idx(2, 3), idx(3, 3),
      idx(3, 2), idx(0, 0),
      idx(3, 4), idx(0, 7),
    ]) {
      state = playMove(state, m);
    }
    expect(state.currentPlayer).toBe(1);

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, rng);
      expect(mov).toBe(idx(4, 3));
      const tras = playMove(state, mov);
      expect(tras.scores[1]).toBe(1);
    }
  });

  it('medio y difícil bloquean/escapan cuando el rival amenaza captura en 1', () => {
    const rng = crearRng(19);
    // J1 en (3,3) amenazado por J2 en (2,3), (3,2), (3,4).
    // Si J1 no juega en (4,3) (o captura un muro rival), J2 captura (3,3) en su turno.
    let state = createInitialState();
    for (const m of [
      idx(3, 3), idx(2, 3),
      idx(7, 7), idx(3, 2),
      idx(7, 0), idx(3, 4),
    ]) {
      state = playMove(state, m);
    }
    expect(state.currentPlayer).toBe(1);

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, rng);
      expect(mov).toBe(idx(4, 3));
    }
  });

  it('dificil evita jugada suicida dentro de un casi-encierro rival', () => {
    const rng = crearRng(23);
    // J1 tiene (2,3), (3,2), (3,4), (4,3) NO: tiene (2,3), (3,2), (4,3) alrededor de (3,3)?
    // Mejor: J1 tiene (2,3), (3,2), (3,4), (4,3) cerraría, pero (3,3) está vacío y
    // suponemos (3,3) es territorio? No, J1 tiene (2,3), (3,2), (4,3) y falta (3,4):
    // Si J2 juega en (3,3) que queda con solo (3,4) libre, J1 juega (3,4) y lo captura!
    let state = createInitialState();
    for (const m of [
      idx(2, 3), idx(0, 0),
      idx(3, 2), idx(0, 7),
      idx(4, 3),
    ]) {
      state = playMove(state, m);
    }
    // J1 tiene (2,3), (3,2), (4,3). Turno de J2: si juega (3,3), J1 captura en 1 con (3,4).
    // OJO: (3,4) también bloquea, así que (3,3) es claramente peor que jugar fuera o en (3,4).
    expect(state.currentPlayer).toBe(2);
    for (let k = 0; k < 5; k++) {
      const mov = elegirMovimiento(state, 'dificil', crearRng(100 + k));
      expect(mov).not.toBe(idx(3, 3));
    }
  });

  it('facil omite captura inmediata cuando rng >= 0.45 y la toma cuando rng < 0.45', () => {
    let state = createInitialState();
    for (const m of [
      idx(2, 3), idx(3, 3),
      idx(3, 2), idx(0, 0),
      idx(3, 4), idx(0, 7),
    ]) {
      state = playMove(state, m);
    }

    const movOmitido = elegirMovimiento(state, 'facil', () => 0.7);
    expect(esLegal(state, movOmitido)).toBe(true);
    expect(movOmitido).not.toBe(idx(4, 3));

    const movCapturado = elegirMovimiento(state, 'facil', () => 0.2);
    expect(movCapturado).toBe(idx(4, 3));
  });

  it('calibración estadística: dificil > medio > facil > 65 % en partidas espejo y azar gana a facil', () => {
    const rng = crearRng(2026);
    const PARES = 20; // 40 partidas espejo por duelo
    let dificilPts = 0;
    let medioVsFacilPts = 0;

    for (let i = 0; i < PARES; i++) {
      // Partida A: dificil = J1, medio = J2
      const wA = simular('dificil', 'medio', rng);
      if (wA === 1) dificilPts += 1;
      else if (wA === 'draw') dificilPts += 0.5;

      // Partida B (espejo): medio = J1, dificil = J2
      const wB = simular('medio', 'dificil', rng);
      if (wB === 2) dificilPts += 1;
      else if (wB === 'draw') dificilPts += 0.5;

      // Partida C: medio = J1, facil = J2
      const wC = simular('medio', 'facil', rng);
      if (wC === 1) medioVsFacilPts += 1;
      else if (wC === 'draw') medioVsFacilPts += 0.5;

      // Partida D (espejo): facil = J1, medio = J2
      const wD = simular('facil', 'medio', rng);
      if (wD === 2) medioVsFacilPts += 1;
      else if (wD === 'draw') medioVsFacilPts += 0.5;
    }

    expect(dificilPts / (PARES * 2)).toBeGreaterThan(0.65);
    expect(medioVsFacilPts / (PARES * 2)).toBeGreaterThan(0.65);

    const M = 40;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      const jAzar = i % 2 === 0 ? 1 : 2;
      const w = jAzar === 1 ? simular('azar', 'facil', rng) : simular('facil', 'azar', rng);
      if (w === jAzar) azarGana++;
    }
    expect(azarGana).toBeGreaterThan(M * 0.15);
  });
});
