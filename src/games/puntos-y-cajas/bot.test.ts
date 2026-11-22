import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esLineId,
  playLine,
  type LineId,
  type PuntosYCajasState,
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

function lineasLibres(state: PuntosYCajasState): LineId[] {
  const res: LineId[] = [];
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size - 1; c++) {
      if (!state.horizontalLines[r][c]) res.push({ type: 'h', row: r, col: c });
    }
  }
  for (let r = 0; r < state.size - 1; r++) {
    for (let c = 0; c < state.size; c++) {
      if (!state.verticalLines[r][c]) res.push({ type: 'v', row: r, col: c });
    }
  }
  return res;
}

function ladosCaja(state: PuntosYCajasState, r: number, c: number): number {
  let lados = 0;
  if (state.horizontalLines[r][c]) lados++;
  if (state.horizontalLines[r + 1][c]) lados++;
  if (state.verticalLines[r][c]) lados++;
  if (state.verticalLines[r][c + 1]) lados++;
  return lados;
}

function cajasDeLinea(state: PuntosYCajasState, l: LineId): Array<[number, number]> {
  const max = state.size - 1;
  const res: Array<[number, number]> = [];
  if (l.type === 'h') {
    if (l.row - 1 >= 0) res.push([l.row - 1, l.col]);
    if (l.row < max) res.push([l.row, l.col]);
  } else {
    if (l.col - 1 >= 0) res.push([l.row, l.col - 1]);
    if (l.col < max) res.push([l.row, l.col]);
  }
  return res;
}

function simular(dif1: Dificultad | 'azar', dif2: Dificultad | 'azar', rng: () => number) {
  let state = createInitialState(4);
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    let mov: LineId;
    if (dif === 'azar') {
      const libres = lineasLibres(state);
      mov = libres[Math.floor(rng() * libres.length)];
    } else {
      mov = elegirMovimiento(state, dif, rng);
    }
    expect(esLineId(mov)).toBe(true);
    const next = playLine(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.scores;
}

describe('puntos-y-cajas bot', () => {
  it('genera jugadas legales en los 3 niveles en menos de 30 ms por jugada', () => {
    const rng = crearRng(31);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState(4);
      while (state.status === 'playing') {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esLineId(mov)).toBe(true);
        const next = playLine(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('medio y difícil cierran caja disponible y evitan regalar el 3.er lado si hay línea segura', () => {
    const rng = crearRng(9);
    // Caja (0,0) con 3 lados puestos -> el 4.º cierra la caja.
    let sCerrar = createInitialState(4);
    sCerrar = playLine(sCerrar, { type: 'h', row: 0, col: 0 });
    sCerrar = playLine(sCerrar, { type: 'h', row: 1, col: 0 });
    sCerrar = playLine(sCerrar, { type: 'v', row: 0, col: 0 });
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sCerrar, dif, rng)).toEqual({ type: 'v', row: 0, col: 1 });
    }

    // Caja (0,0) con 2 lados puestos -> no regalar el 3.º mientras queden seguras.
    let sSegura = createInitialState(4);
    sSegura = playLine(sSegura, { type: 'h', row: 0, col: 0 });
    sSegura = playLine(sSegura, { type: 'v', row: 0, col: 0 });
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(sSegura, dif, rng);
      expect(mov).not.toEqual({ type: 'h', row: 1, col: 0 });
      expect(mov).not.toEqual({ type: 'v', row: 0, col: 1 });
    }
  });

  it('difícil sacrifica la cadena más corta cuando solo quedan sacrificios', () => {
    const lineasCadenaCorta = [
      JSON.stringify({ type: 'h', row: 0, col: 0 }),
      JSON.stringify({ type: 'v', row: 0, col: 0 }),
    ];

    // 1) Tablero con > 12 líneas libres (13 libres): verifica análisis de cadenas.
    // Todas las 9 cajas tienen exactamente 2 lados trazados:
    // - (0,0): cadena de 1 caja (h(0,0), v(0,0) libres)
    // - (0,1)-(0,2): cadena de 2 cajas
    // - (1,0)-(2,0): cadena de 2 cajas
    // - (2,1)-(1,1)-(1,2)-(2,2): cadena de 4 cajas
    let sCadenas = createInitialState(4);
    const trazos13Libres: LineId[] = [
      { type: 'h', row: 1, col: 0 },
      { type: 'v', row: 0, col: 1 },
      { type: 'h', row: 1, col: 1 },
      { type: 'h', row: 1, col: 2 },
      { type: 'v', row: 0, col: 3 },
      { type: 'v', row: 1, col: 1 },
      { type: 'v', row: 2, col: 1 },
      { type: 'h', row: 3, col: 0 },
      { type: 'v', row: 1, col: 3 },
      { type: 'v', row: 2, col: 2 },
      { type: 'v', row: 2, col: 3 },
    ];
    for (const l of trazos13Libres) sCadenas = playLine(sCadenas, l);

    const libres13 = lineasLibres(sCadenas);
    expect(libres13.length).toBe(13);
    for (const l of libres13) {
      const grados = cajasDeLinea(sCadenas, l).map(([r, c]) => ladosCaja(sCadenas, r, c));
      expect(grados.some(g => g === 3)).toBe(false);
      expect(grados.some(g => g === 2)).toBe(true);
    }

    for (const semilla of [14, 27, 99]) {
      const mov = elegirMovimiento(sCadenas, 'dificil', crearRng(semilla));
      expect(lineasCadenaCorta).toContain(JSON.stringify(mov));
      expect(playLine(sCadenas, mov)).not.toBe(sCadenas);
    }

    // 2) Tablero con <= 12 líneas libres (5 libres): verifica fin de partida exacto (negamax).
    // Cajas (0,1), (0,2), (1,0), (1,1), (1,2), (2,0) cerradas;
    // quedan solo (0,0) (cadena de 1 caja) y (2,1)-(2,2) (cadena de 2 cajas).
    let sFinal = createInitialState(4);
    const trazos5Libres: LineId[] = [
      { type: 'h', row: 0, col: 1 },
      { type: 'h', row: 0, col: 2 },
      { type: 'h', row: 1, col: 0 },
      { type: 'h', row: 1, col: 1 },
      { type: 'h', row: 1, col: 2 },
      { type: 'h', row: 2, col: 0 },
      { type: 'h', row: 2, col: 1 },
      { type: 'h', row: 2, col: 2 },
      { type: 'h', row: 3, col: 0 },
      { type: 'v', row: 0, col: 1 },
      { type: 'v', row: 0, col: 2 },
      { type: 'v', row: 0, col: 3 },
      { type: 'v', row: 1, col: 0 },
      { type: 'v', row: 1, col: 1 },
      { type: 'v', row: 1, col: 2 },
      { type: 'v', row: 1, col: 3 },
      { type: 'v', row: 2, col: 0 },
      { type: 'v', row: 2, col: 1 },
      { type: 'v', row: 2, col: 3 },
    ];
    for (const l of trazos5Libres) sFinal = playLine(sFinal, l);

    const libres5 = lineasLibres(sFinal);
    expect(libres5.length).toBe(5);
    for (const l of libres5) {
      const grados = cajasDeLinea(sFinal, l).map(([r, c]) => ladosCaja(sFinal, r, c));
      expect(grados.some(g => g === 3)).toBe(false);
      expect(grados.some(g => g === 2)).toBe(true);
    }

    for (const semilla of [14, 27, 99]) {
      const mov = elegirMovimiento(sFinal, 'dificil', crearRng(semilla));
      expect(lineasCadenaCorta).toContain(JSON.stringify(mov));
      expect(playLine(sFinal, mov)).not.toBe(sFinal);
    }
  });

  it('calibración: dificil >= medio > facil y azar gana a facil', () => {
    const rng = crearRng(404);
    let medioGana = 0;
    let dificilGana = 0;
    let azarGana = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const dm = simular('dificil', 'medio', rng);
      if (dm[1] >= dm[2]) dificilGana++;
      const mf = simular('medio', 'facil', rng);
      if (mf[1] > mf[2]) medioGana++;
      const af = simular('azar', 'facil', rng);
      if (af[1] > af[2]) azarGana++;
    }
    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(N * 0.4);
  });
});
