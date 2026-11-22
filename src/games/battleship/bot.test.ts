import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  FLOTA,
  playMove,
  TAMANO,
  type BattleshipState,
  type Move,
  type Player,
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

function jugadaAzar(state: BattleshipState, rng: () => number): Move {
  if (state.fase === 'colocacion') {
    for (;;) {
      const ocupadas = new Set<number>();
      const barcos: number[][] = [];
      let ok = true;
      for (const long of FLOTA) {
        let elegido: number[] | null = null;
        for (let t = 0; t < 200 && elegido === null; t++) {
          const horiz = rng() < 0.5;
          const filas = horiz ? TAMANO : TAMANO - long + 1;
          const cols = horiz ? TAMANO - long + 1 : TAMANO;
          const f = Math.floor(rng() * filas);
          const c = Math.floor(rng() * cols);
          const celdas = Array.from({ length: long }, (_, k) =>
            horiz ? f * TAMANO + c + k : (f + k) * TAMANO + c,
          );
          if (celdas.some(x => ocupadas.has(x))) continue;
          elegido = celdas;
        }
        if (!elegido) {
          ok = false;
          break;
        }
        elegido.forEach(x => ocupadas.add(x));
        barcos.push(elegido);
      }
      if (ok) return { tipo: 'flota', barcos };
    }
  }

  const disparos = state.disparos[state.currentPlayer];
  const libres: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (disparos[i] === null) libres.push(i);
  }
  return { tipo: 'disparo', celda: libres[Math.floor(rng() * libres.length)] };
}

function simularPartida(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number,
): Player {
  let state = createInitialState();
  while (state.fase !== 'finished') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

function contarDisparosHastaHundir(
  dif: Dificultad,
  flotaRival: number[][],
  rng: () => number,
): number {
  let state = createInitialState();
  state = playMove(state, { tipo: 'flota', barcos: [[0, 1, 2, 3], [16, 17, 18], [32, 33, 34], [48, 49]] });
  state = playMove(state, { tipo: 'flota', barcos: flotaRival });
  let tiros = 0;
  while (state.fase === 'disparos') {
    if (state.currentPlayer === 1) {
      const mov = elegirMovimiento(state, dif, rng);
      expect(mov.tipo).toBe('disparo');
      state = playMove(state, mov);
      tiros++;
    } else {
      // El rival dispara al azar pero nunca gana antes de que J1 hunda su flota en este conteo
      // Si llegara a ganar, evitamos darle el último golpe para medir tiros de J1.
      const disp = state.disparos[2];
      const flota1 = state.flotas[1]!;
      const todas1 = new Set(flota1.flat());
      const libres = Array.from({ length: TOTAL }, (_, i) => i).filter(i => disp[i] === null);
      const seguras = libres.filter(i => !todas1.has(i));
      const celda = seguras.length > 0 ? seguras[0] : libres[0];
      state = playMove(state, { tipo: 'disparo', celda });
    }
  }
  return tiros;
}

function tienenAdyacenciaOrtogonal(barcos: number[][]): boolean {
  const mapaBarco = new Map<number, number>();
  barcos.forEach((b, idx) => b.forEach(c => mapaBarco.set(c, idx)));
  for (const [celda, idx] of mapaBarco.entries()) {
    const f = Math.floor(celda / TAMANO);
    const c = celda % TAMANO;
    const vecinos = [
      f > 0 ? celda - TAMANO : -1,
      f < TAMANO - 1 ? celda + TAMANO : -1,
      c > 0 ? celda - 1 : -1,
      c < TAMANO - 1 ? celda + 1 : -1,
    ];
    for (const v of vecinos) {
      if (v >= 0 && mapaBarco.has(v) && mapaBarco.get(v) !== idx) return true;
    }
  }
  return false;
}

describe('battleship bot', () => {
  it('genera jugadas legales con progreso garantizado en colocación y disparos (inicial, intermedio, final) en < 30 ms', () => {
    const dificultades: Dificultad[] = ['facil', 'medio', 'dificil'];

    for (const dif of dificultades) {
      const rng = crearRng(42);
      // Fase colocación J1 y J2
      let state = createInitialState();
      const t0 = performance.now();
      const m1 = elegirMovimiento(state, dif, rng);
      expect(performance.now() - t0).toBeLessThan(30);
      expect(m1.tipo).toBe('flota');
      expect(esJugadaValida(m1)).toBe(true);
      const s1 = playMove(state, m1);
      expect(s1).not.toBe(state);

      const t1 = performance.now();
      const m2 = elegirMovimiento(s1, dif, rng);
      expect(performance.now() - t1).toBeLessThan(30);
      expect(m2.tipo).toBe('flota');
      expect(esJugadaValida(m2)).toBe(true);
      state = playMove(s1, m2);
      expect(state.fase).toBe('disparos');

      // Partida completa midiendo cada turno hasta el final
      while (state.fase === 'disparos') {
        const ti = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const dt = performance.now() - ti;
        expect(dt).toBeLessThan(30);
        expect(mov.tipo).toBe('disparo');
        expect(esJugadaValida(mov)).toBe(true);
        if (mov.tipo === 'disparo') {
          expect(state.disparos[state.currentPlayer][mov.celda]).toBeNull();
        }
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
      expect(state.fase).toBe('finished');
    }
  });

  it('funciona con rng constante sin bucles infinitos y es 100% determinista con la misma semilla', () => {
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      for (const val of [0, 0.5, 0.999]) {
        const s0 = createInitialState();
        const f1 = elegirMovimiento(s0, dif, () => val);
        const f2 = elegirMovimiento(s0, dif, () => val);
        expect(f1).toEqual(f2);
        expect(esJugadaValida(f1)).toBe(true);
      }
    }
  });

  it('ANTI-TRAMPA: cambiar state.flotas[rival] (y propia) con misma semilla rng devuelve exactamente el mismo disparo en las 3 dificultades', () => {
    const flota1A = [
      [0, 1, 2, 3],
      [16, 17, 18],
      [32, 33, 34],
      [48, 49],
    ];
    const flota2A = [
      [10, 11, 12, 13],
      [25, 33, 41],
      [44, 45, 46],
      [60, 61],
    ];
    const flota1B = [
      [7, 15, 23, 31],
      [50, 51, 52],
      [35, 36, 37],
      [56, 57],
    ];
    const flota2B = [
      [5, 6, 7, 15], // inválido no, válido: [4,5,6,7]
      [20, 28, 36],
      [40, 48, 56],
      [62, 63],
    ];
    flota2B[0] = [4, 5, 6, 7];

    // Estado intermedio con agua, tocado y hundido (un barco de 2 hundido en común o tablero de disparos idéntico)
    const disparos1: ('agua' | 'tocado' | 'hundido' | null)[] = Array(TOTAL).fill(null);
    disparos1[0] = 'agua';
    disparos1[18] = 'agua';
    disparos1[60] = 'hundido';
    disparos1[61] = 'hundido';
    disparos1[33] = 'tocado';

    const disparos2: ('agua' | 'tocado' | 'hundido' | null)[] = Array(TOTAL).fill(null);
    disparos2[9] = 'agua';

    const estadoA: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 1,
      flotas: { 1: flota1A, 2: flota2A },
      disparos: { 1: disparos1, 2: disparos2 },
      winner: null,
      ultimoDisparo: { por: 2, celda: 9, resultado: 'agua' },
    };

    const estadoB: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 1,
      flotas: { 1: flota1B, 2: flota2B },
      disparos: { 1: [...disparos1], 2: [...disparos2] },
      winner: null,
      ultimoDisparo: { por: 2, celda: 9, resultado: 'agua' },
    };

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      for (const semilla of [1, 77, 1234]) {
        const movA = elegirMovimiento(estadoA, dif, crearRng(semilla));
        const movB = elegirMovimiento(estadoB, dif, crearRng(semilla));
        expect(movA).toEqual(movB);
      }
    }

    // También cuando state.fase === 'disparos' sin ningún disparo previo
    const inicioA: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 2,
      flotas: { 1: flota1A, 2: flota2A },
      disparos: { 1: Array(TOTAL).fill(null), 2: Array(TOTAL).fill(null) },
      winner: null,
      ultimoDisparo: null,
    };
    const inicioB: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 2,
      flotas: { 1: flota1B, 2: flota2B },
      disparos: { 1: Array(TOTAL).fill(null), 2: Array(TOTAL).fill(null) },
      winner: null,
      ultimoDisparo: null,
    };

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const movA = elegirMovimiento(inicioA, dif, crearRng(55));
      const movB = elegirMovimiento(inicioB, dif, crearRng(55));
      expect(movA).toEqual(movB);
    }
  });

  it('invariantes tácticas: medio y dificil colocan sin barcos pegados; medio/dificil siguen tocado y eje', () => {
    const rng = crearRng(2026);
    const inicial = createInitialState();

    // Colocación sin adyacencias ortogonales en medio y difícil
    for (let i = 0; i < 15; i++) {
      const mMedio = elegirMovimiento(inicial, 'medio', rng);
      const mDificil = elegirMovimiento(inicial, 'dificil', rng);
      expect(mMedio.tipo).toBe('flota');
      expect(mDificil.tipo).toBe('flota');
      if (mMedio.tipo === 'flota') expect(tienenAdyacenciaOrtogonal(mMedio.barcos)).toBe(false);
      if (mDificil.tipo === 'flota') expect(tienenAdyacenciaOrtogonal(mDificil.barcos)).toBe(false);
    }

    // Disparo con 1 tocado aislado en (3,3) = 27: medio y dificil atacan un vecino ortogonal (19, 26, 28, 35)
    const disp1 = Array<'agua' | 'tocado' | 'hundido' | null>(TOTAL).fill(null);
    disp1[27] = 'tocado';
    const estado1Tocado: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 1,
      flotas: { 1: null, 2: null },
      disparos: { 1: disp1, 2: Array(TOTAL).fill(null) },
      winner: null,
      ultimoDisparo: null,
    };
    for (const dif of ['medio', 'dificil'] as const) {
      const m = elegirMovimiento(estado1Tocado, dif, crearRng(9));
      expect(m.tipo).toBe('disparo');
      if (m.tipo === 'disparo') {
        expect([19, 26, 28, 35]).toContain(m.celda);
      }
    }

    // Disparo con 2 tocados alineados en horizontal (3,3)=27 y (3,4)=28: medio y dificil siguen el eje -> 26 o 29
    const disp2 = Array<'agua' | 'tocado' | 'hundido' | null>(TOTAL).fill(null);
    disp2[27] = 'tocado';
    disp2[28] = 'tocado';
    const estadoEje: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 1,
      flotas: { 1: null, 2: null },
      disparos: { 1: disp2, 2: Array(TOTAL).fill(null) },
      winner: null,
      ultimoDisparo: null,
    };
    for (const dif of ['medio', 'dificil'] as const) {
      const m = elegirMovimiento(estadoEje, dif, crearRng(11));
      expect(m.tipo).toBe('disparo');
      if (m.tipo === 'disparo') {
        expect([26, 29]).toContain(m.celda);
      }
    }

    // Fácil omite adyacente cuando rng >= 0.4 y lo sigue cuando rng < 0.4
    const mFacilSigue = elegirMovimiento(estado1Tocado, 'facil', () => 0.1);
    expect(mFacilSigue.tipo).toBe('disparo');
    if (mFacilSigue.tipo === 'disparo') {
      expect([19, 26, 28, 35]).toContain(mFacilSigue.celda);
    }

    const mFacilAzar = elegirMovimiento(estado1Tocado, 'facil', () => 0.95);
    expect(mFacilAzar.tipo).toBe('disparo');
    if (mFacilAzar.tipo === 'disparo') {
      expect([19, 26, 28, 35]).not.toContain(mFacilAzar.celda);
    }

    // Difícil detecta orientación obligatoria: tocado en 27 con agua en 26 y 28 -> solo vertical (19 o 35)
    const dispVert = [...disp1];
    dispVert[26] = 'agua';
    dispVert[28] = 'agua';
    const estadoVert: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 1,
      flotas: { 1: null, 2: null },
      disparos: { 1: dispVert, 2: Array(TOTAL).fill(null) },
      winner: null,
      ultimoDisparo: null,
    };
    const mVert = elegirMovimiento(estadoVert, 'dificil', crearRng(3));
    expect(mVert.tipo).toBe('disparo');
    if (mVert.tipo === 'disparo') {
      expect([19, 35]).toContain(mVert.celda);
    }

    // Barcos hundidos adyacentes (4+3 pegados formando componente de 7) + 1 casilla de barco de 2 restante
    const dispAdj = Array<'agua' | 'tocado' | 'hundido' | null>(TOTAL).fill('agua');
    for (const c of [0, 1, 2, 3, 8, 9, 10]) dispAdj[c] = 'hundido';
    dispAdj[50] = 'tocado';
    dispAdj[51] = null;
    dispAdj[42] = null;
    const estadoFinal: BattleshipState = {
      fase: 'disparos',
      currentPlayer: 1,
      flotas: { 1: null, 2: null },
      disparos: { 1: dispAdj, 2: Array(TOTAL).fill(null) },
      winner: null,
      ultimoDisparo: null,
    };
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m = elegirMovimiento(estadoFinal, dif, crearRng(19));
      expect(esJugadaValida(m)).toBe(true);
      if (m.tipo === 'disparo') {
        expect(dispAdj[m.celda]).toBeNull();
        if (dif === 'dificil') {
          expect([42, 51]).toContain(m.celda);
        }
      }
    }
  });

  it('calibración: dificil > medio > facil (> 65% en partidas espejo), azar gana a facil, y media de disparos dificil < medio < facil', () => {
    const rng = crearRng(1337);
    const N = 60; // 30 pares espejo por duelo
    let dificilVsMedio = 0;
    let medioVsFacil = 0;
    let azarVsFacil = 0;

    for (let i = 0; i < N / 2; i++) {
      if (simularPartida('dificil', 'medio', rng) === 1) dificilVsMedio++;
      if (simularPartida('medio', 'dificil', rng) === 2) dificilVsMedio++;

      if (simularPartida('medio', 'facil', rng) === 1) medioVsFacil++;
      if (simularPartida('facil', 'medio', rng) === 2) medioVsFacil++;

      if (simularPartida('azar', 'facil', rng) === 1) azarVsFacil++;
      if (simularPartida('facil', 'azar', rng) === 2) azarVsFacil++;
    }

    expect(dificilVsMedio).toBeGreaterThan(N * 0.65);
    expect(medioVsFacil).toBeGreaterThan(N * 0.65);
    expect(azarVsFacil).toBeGreaterThan(0);

    // Verificar media de disparos necesarios para hundir una flota: dificil < medio < facil
    const flotasPrueba: number[][][] = [];
    for (let i = 0; i < 40; i++) {
      const m = jugadaAzar(createInitialState(), rng);
      if (m.tipo === 'flota') flotasPrueba.push(m.barcos);
    }

    const sumaTiros: Record<Dificultad, number> = { facil: 0, medio: 0, dificil: 0 };
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      for (let i = 0; i < flotasPrueba.length; i++) {
        sumaTiros[dif] += contarDisparosHastaHundir(dif, flotasPrueba[i], crearRng(5000 + i));
      }
    }

    const mediaFacil = sumaTiros.facil / flotasPrueba.length;
    const mediaMedio = sumaTiros.medio / flotasPrueba.length;
    const mediaDificil = sumaTiros.dificil / flotasPrueba.length;

    expect(mediaDificil).toBeLessThan(mediaMedio);
    expect(mediaMedio).toBeLessThan(mediaFacil);
  });
});
