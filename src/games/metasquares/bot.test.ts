import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  movimientosLegales,
  playMove,
  type MetaSquaresState,
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

function jugadaAzar(state: MetaSquaresState, rng: () => number) {
  const vacias = movimientosLegales(state);
  return { celda: vacias[Math.floor(rng() * vacias.length)] };
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number,
): 1 | 2 | null {
  let state = createInitialState();
  while (state.status.kind === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar'
        ? jugadaAzar(state, rng)
        : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.status.kind === 'won' ? state.status.winner : null;
}

describe('metasquares bot', () => {
  it('genera jugadas legales y produce progreso en estado inicial, intermedio y final en < 30 ms', () => {
    const rng = crearRng(42);
    let state = createInitialState();

    // Estado inicial vacío
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const t0 = performance.now();
      const mov = elegirMovimiento(state, dif, rng);
      expect(performance.now() - t0).toBeLessThan(30);
      expect(esJugadaValida(mov)).toBe(true);
      expect(state.board[mov.celda]).toBeNull();
      expect(playMove(state, mov)).not.toBe(state);
    }

    // Avanzar partida por estados intermedios y cercanos al final
    for (let turno = 0; turno < 38 && state.status.kind === 'playing'; turno++) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(state.board[mov.celda]).toBeNull();
        expect(playMove(state, mov)).not.toBe(state);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }

    // Estado casi lleno con pocas casillas libres
    let stateFinal = createInitialState();
    for (let i = 0; i < 45 && stateFinal.status.kind === 'playing'; i++) {
      const legales = movimientosLegales(stateFinal);
      stateFinal = playMove(stateFinal, { celda: legales[0] });
    }
    if (stateFinal.status.kind === 'playing') {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(stateFinal, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(playMove(stateFinal, mov)).not.toBe(stateFinal);
      }
    }
  });

  it('es 100% determinista con una misma semilla rng', () => {
    let state = createInitialState();
    state = playMove(state, { celda: 24 });
    state = playMove(state, { celda: 0 });
    state = playMove(state, { celda: 10 });

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(state, dif, crearRng(12345));
      const m2 = elegirMovimiento(state, dif, crearRng(12345));
      expect(m1).toEqual(m2);
    }
  });

  it('medio y difícil completan un cuadrado inmediato (3/4 -> 4/4) y bloquean amenaza rival 3/4', () => {
    const rng = crearRng(7);

    // Cuadrado 1x1 en esquina superior izquierda: celdas (0,0)=0, (0,1)=1, (1,0)=7, (1,1)=8
    // J1 coloca 0, 1, 7; J2 bloquea el inclinado en 9 y juega en 47, 48. Turno de J1 -> debe completar en 8.
    let sCompletar = createInitialState();
    for (const [m1, m2] of [
      [0, 9],
      [1, 47],
      [7, 48],
    ]) {
      sCompletar = playMove(sCompletar, { celda: m1 });
      sCompletar = playMove(sCompletar, { celda: m2 });
    }
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(sCompletar, dif, rng);
      expect(mov.celda).toBe(8);
    }

    // J1 tiene 3 esquinas (0, 1, 7) y acaba de jugar 7; le toca a J2 -> debe bloquear en 8.
    let sBloquear = createInitialState();
    sBloquear = playMove(sBloquear, { celda: 0 }); // J1
    sBloquear = playMove(sBloquear, { celda: 48 }); // J2
    sBloquear = playMove(sBloquear, { celda: 1 }); // J1
    sBloquear = playMove(sBloquear, { celda: 47 }); // J2
    sBloquear = playMove(sBloquear, { celda: 7 }); // J1 -> turno J2
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(sBloquear, dif, rng);
      expect(mov.celda).toBe(8);
    }
  });

  it('medio y difícil ganan en 1 cuando están a 1 punto de llegar a 5', () => {
    const rng = crearRng(99);
    // Construir un estado donde J1 tiene scores[1] = 4 y una amenaza 3/4 en celda 8
    const base = createInitialState();
    const board = [...base.board];
    board[0] = 1;
    board[1] = 1;
    board[7] = 1;
    board[48] = 2;
    board[47] = 2;
    board[46] = 2;
    const state: MetaSquaresState = {
      ...base,
      board,
      currentPlayer: 1,
      scores: { 1: 4, 2: 0 },
    };

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, rng);
      expect(mov.celda).toBe(8);
    }
  });

  it('facil omite completar cuadrado inmediato cuando rng >= 0.4 y lo toma cuando rng < 0.4', () => {
    let sCompletar = createInitialState();
    for (const [m1, m2] of [
      [0, 48],
      [1, 47],
      [7, 46],
    ]) {
      sCompletar = playMove(sCompletar, { celda: m1 });
      sCompletar = playMove(sCompletar, { celda: m2 });
    }

    const movOmitido = elegirMovimiento(sCompletar, 'facil', () => 0.5);
    expect(esJugadaValida(movOmitido)).toBe(true);
    expect(sCompletar.board[movOmitido.celda]).toBeNull();
    expect(movOmitido.celda).not.toBe(8);

    const movTomado = elegirMovimiento(sCompletar, 'facil', () => 0.1);
    expect(movTomado.celda).toBe(8);
  });

  it('calibración determinista con partidas espejo: dificil > medio > facil > 65% y azar gana a facil', () => {
    const rng = crearRng(2026);
    const PARES = 20; // 40 partidas espejo por duelo
    let dificilPuntos = 0;
    let medioPuntos = 0;
    let facilVsMedioPuntos = 0;
    let medioVsFacilPuntos = 0;

    for (let i = 0; i < PARES; i++) {
      // Duelo 1: dificil vs medio
      const r1 = simular('dificil', 'medio', rng);
      if (r1 === 1) dificilPuntos += 1;
      else if (r1 === null) dificilPuntos += 0.5;
      else medioPuntos += 1;

      const r2 = simular('medio', 'dificil', rng);
      if (r2 === 2) dificilPuntos += 1;
      else if (r2 === null) dificilPuntos += 0.5;
      else medioPuntos += 1;

      // Duelo 2: medio vs facil
      const m1 = simular('medio', 'facil', rng);
      if (m1 === 1) medioVsFacilPuntos += 1;
      else if (m1 === null) medioVsFacilPuntos += 0.5;
      else facilVsMedioPuntos += 1;

      const m2 = simular('facil', 'medio', rng);
      if (m2 === 2) medioVsFacilPuntos += 1;
      else if (m2 === null) medioVsFacilPuntos += 0.5;
      else facilVsMedioPuntos += 1;
    }

    const totalDuelo = PARES * 2;
    expect(dificilPuntos / totalDuelo).toBeGreaterThan(0.65);
    expect(medioVsFacilPuntos / totalDuelo).toBeGreaterThan(0.65);

    const M = 40;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      const res =
        i % 2 === 0
          ? simular('azar', 'facil', rng) === 1
          : simular('facil', 'azar', rng) === 2;
      if (res) azarGana++;
    }
    expect(azarGana).toBeGreaterThan(M * 0.1);
  });
});
