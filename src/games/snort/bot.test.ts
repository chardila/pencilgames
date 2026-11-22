import { describe, expect, it } from 'vitest';
import {
  TAMANO,
  casillaLegal,
  createInitialState,
  esJugadaValida,
  playMove,
  type CellValue,
  type SnortState,
} from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

const TOTAL = TAMANO * TAMANO;

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: SnortState, rng: () => number): number {
  const legales: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (casillaLegal(state.board, i, state.currentPlayer)) legales.push(i);
  }
  return legales[Math.floor(rng() * legales.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
): 1 | 2 {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar'
        ? jugadaAzar(state, rng)
        : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    expect(casillaLegal(state.board, mov, state.currentPlayer)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

function estadoConVacios(
  ocupadas: Record<number, CellValue>,
  relleno: CellValue = 1,
  turno: 1 | 2 = 1
): SnortState {
  const board = Array<CellValue>(TOTAL).fill(relleno);
  for (const [k, v] of Object.entries(ocupadas)) {
    board[Number(k)] = v;
  }
  return {
    board,
    currentPlayer: turno,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

describe('snort bot', () => {
  it('devuelve jugadas legales en estados iniciales, intermedios y finales en < 30 ms', () => {
    const rng = crearRng(42);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const elapsed = performance.now() - t0;
        expect(elapsed).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(casillaLegal(state.board, mov, state.currentPlayer)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('es 100% determinista con una misma semilla rng', () => {
    const base = playMove(playMove(createInitialState(), 14), 21);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(base, dif, crearRng(12345));
      const m2 = elegirMovimiento(base, dif, crearRng(12345));
      expect(m1).toBe(m2);
    }
  });

  it('mantiene rendimiento < 30 ms en el peor caso de 12 casillas compartidas (3x4)', () => {
    // 12 casillas vacías conectadas en un bloque 3x4 (filas 1..3, cols 1..4)
    const vacias: Record<number, CellValue> = {};
    const board = Array<CellValue>(TOTAL).fill(1);
    // Para que sean legales para ambos jugadores, también rodeamos? No,
    // si dejamos filas 0..3 cols 0..4 vacías o 3x4 con anillo vacío?
    // Dejamos exactamente 12 casillas vacías en 3x4 donde las de borde tocan J1 (excl1)
    // y el centro es compartido; aún así probamos tanto excl/shared mixto como 12 legales.
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 4; c++) {
        vacias[r * TAMANO + c] = null;
      }
    }
    const sMixto = estadoConVacios(vacias, 1, 1);
    // Hacemos algunas vecinas de J2 para máxima contención
    sMixto.board[1] = 2;
    sMixto.board[2] = 2;
    sMixto.board[12] = 2;
    sMixto.board[17] = 2;
    const t0 = performance.now();
    const mov = elegirMovimiento(sMixto, 'dificil', crearRng(7));
    expect(performance.now() - t0).toBeLessThan(30);
    expect(casillaLegal(sMixto.board, mov, 1)).toBe(true);
    void board;
  });

  it('medio y difícil toman victoria inmediata en 1 y fácil la omite con prob 0.6', () => {
    // Vacías: 0 (compartida), 1 y 6 (excl2), 35 (excl1).
    // J1 jugando en 0 elimina 0, 1 y 6 para J2 -> victoria en 1 para J1.
    const s = estadoConVacios(
      {
        0: null,
        1: null,
        6: null,
        35: null,
        29: 1,
        34: 1,
      },
      2,
      1
    );

    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(s, dif, crearRng(9))).toBe(0);
    }

    // Fácil: toma victoria con rng < 0.4, la omite con rng >= 0.4
    expect(elegirMovimiento(s, 'facil', () => 0.1)).toBe(0);
    expect(elegirMovimiento(s, 'facil', () => 0.5)).toBe(35);

    let omitidas = 0;
    const rng = crearRng(777);
    for (let i = 0; i < 200; i++) {
      if (elegirMovimiento(s, 'facil', rng) === 35) omitidas++;
    }
    expect(omitidas).toBeGreaterThan(90);
    expect(omitidas).toBeLessThan(150);
  });

  it('medio y difícil bloquean derrota inmediata en 1', () => {
    // Vacías: 0 (excl1), 1 (excl2), 24 (excl2), 35 (excl1).
    // J1 tiene {0, 35}. Si J1 juega 35, J2 juega 1 y deja a J1 sin casillas (gana J2 en 1).
    // Si J1 juega 0, bloquea 1 y gana tras 24 -> 35.
    const s = estadoConVacios(
      {
        0: null,
        1: null,
        24: null,
        35: null,
        2: 2,
        7: 2,
        18: 2,
        25: 2,
        30: 2,
        34: 1,
        29: 1,
      },
      1,
      1
    );

    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(s, dif, crearRng(3))).toBe(0);
    }
  });

  it('difícil resuelve exactamente finales <= 12 casillas eligiendo la jugada ganadora', () => {
    // 8 vacías: {0(1)-1(2)}, {18(1)-19(2)-20(1)}, {30(1)-31(2)}, {35(2)}.
    // Solo 18 o 20 ganan para J1; 0 y 30 pierden.
    const s = estadoConVacios(
      {
        0: null,
        1: null,
        18: null,
        19: null,
        20: null,
        30: null,
        31: null,
        35: null,
        6: 1,
        2: 2,
        7: 2,
        12: 1,
        24: 1,
        13: 2,
        25: 2,
        14: 1,
        21: 1,
        26: 1,
        32: 2,
        29: 2,
        34: 2,
      },
      1,
      1
    );

    const mov = elegirMovimiento(s, 'dificil', crearRng(5));
    expect([18, 20]).toContain(mov);
  });

  it('calibración con partidas espejo: dificil > medio > facil (> 65%) y azar gana a facil', () => {
    const rng = crearRng(2026);
    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;
    const PARES = 15; // 30 partidas por enfrentamiento (15 como J1 + 15 como J2)

    for (let i = 0; i < PARES; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'dificil', rng) === 2) dificilGana++;

      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('facil', 'medio', rng) === 2) medioGana++;

      if (simular('azar', 'facil', rng) === 1) azarGana++;
      if (simular('facil', 'azar', rng) === 2) azarGana++;
    }

    const TOTAL_PARTIDAS = PARES * 2;
    expect(dificilGana).toBeGreaterThan(TOTAL_PARTIDAS * 0.65);
    expect(medioGana).toBeGreaterThan(TOTAL_PARTIDAS * 0.65);
    expect(azarGana).toBeGreaterThan(TOTAL_PARTIDAS * 0.3);
  });
});
