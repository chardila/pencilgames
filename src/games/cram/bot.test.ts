import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  dominosLegalesEn,
  esJugadaValida,
  playMove,
  TAMANO,
  type CellValue,
  type CramState,
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

function listarMovimientosLegales(board: readonly CellValue[]): Move[] {
  const movs: Move[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] !== null) continue;
    const fila = Math.floor(i / TAMANO);
    const col = i % TAMANO;
    if (col < TAMANO - 1 && board[i + 1] === null) movs.push({ a: i, b: i + 1 });
    if (fila < TAMANO - 1 && board[i + TAMANO] === null) movs.push({ a: i, b: i + TAMANO });
  }
  return movs;
}

function jugadaAzar(state: CramState, rng: () => number): Move {
  const movs = listarMovimientosLegales(state.board);
  return movs[Math.floor(rng() * movs.length)];
}

function estadoConLibres(
  libres: readonly number[],
  currentPlayer: Player = 1,
  lastMove: Move | null = null
): CramState {
  const board = Array<CellValue>(TOTAL).fill(1);
  for (const idx of libres) board[idx] = null;
  return {
    board,
    dominos: [],
    currentPlayer,
    status: 'playing',
    winner: null,
    lastMove,
  };
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
): Player {
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

describe('cram bot', () => {
  it('genera jugadas legales en < 30 ms desde inicio hasta final en los 3 niveles', () => {
    const rng = crearRng(42);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const dt = performance.now() - t0;
        expect(dt).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
    }
  });

  it('mide rendimiento < 30 ms también en componente grande de 14-18 casillas y como J1 difícil', () => {
    const rng = crearRng(77);
    // Estado específico de componente conexa densa de 14 casillas (3x5 - 1) con caché fría
    const comp14Densa = estadoConLibres(
      [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15],
      1
    );
    const tDensa = performance.now();
    const movDensa = elegirMovimiento(comp14Densa, 'dificil', rng);
    expect(performance.now() - tDensa).toBeLessThan(30);
    expect(playMove(comp14Densa, movDensa)).not.toBe(comp14Densa);

    let state = createInitialState();
    // J1 juega difícil contra J2 azar para forzar ruptura de simetría desde el turno 2
    while (state.status === 'playing') {
      if (state.currentPlayer === 1) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, 'dificil', rng);
        expect(performance.now() - t0).toBeLessThan(30);
        state = playMove(state, mov);
      } else {
        state = playMove(state, jugadaAzar(state, rng));
      }
    }
    expect(state.status).toBe('won');

    // Estado específico de componente conexa de 14 casillas (2x6 + 2)
    const comp14 = estadoConLibres([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18], 1);
    const t0 = performance.now();
    const mov = elegirMovimiento(comp14, 'dificil', rng);
    expect(performance.now() - t0).toBeLessThan(30);
    expect(playMove(comp14, mov)).not.toBe(comp14);

    // Componentes grandes > 14: 3x6 (18 casillas) y 5x5 (25 casillas impar×impar con centro)
    const comp3x6 = estadoConLibres(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17],
      1
    );
    const t3x6 = performance.now();
    const mov3x6 = elegirMovimiento(comp3x6, 'dificil', rng);
    expect(performance.now() - t3x6).toBeLessThan(30);
    expect(playMove(comp3x6, mov3x6)).not.toBe(comp3x6);

    const comp5x5 = estadoConLibres(
      [
        0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 18, 19, 20, 21, 22, 24, 25, 26,
        27, 28,
      ],
      1
    );
    const t5x5 = performance.now();
    const mov5x5 = elegirMovimiento(comp5x5, 'dificil', rng);
    expect(performance.now() - t5x5).toBeLessThan(30);
    expect(playMove(comp5x5, mov5x5)).not.toBe(comp5x5);
  });

  it('es determinista con una misma semilla rng', () => {
    let s = createInitialState();
    s = playMove(s, { a: 0, b: 1 });
    s = playMove(s, { a: 8, b: 9 });
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(s, dif, crearRng(1234));
      const m2 = elegirMovimiento(s, dif, crearRng(1234));
      expect(m1).toEqual(m2);
    }
  });

  it('facil omite victoria inmediata con prob ~0.6 cuando hay alternativas, y la toma si no hay más', () => {
    // 1x4 libre: {1, 2} gana en 1; {0, 1} y {2, 3} no ganan en 1.
    const s = estadoConLibres([0, 1, 2, 3], 1);

    const movOmitido = elegirMovimiento(s, 'facil', () => 0.5);
    expect(playMove(s, movOmitido).status).toBe('playing');

    const movGanador = elegirMovimiento(s, 'facil', () => 0.1);
    expect(playMove(s, movGanador).status).toBe('won');

    // Si todas las jugadas ganan en 1 (solo un dominó libre)
    const sUnico = estadoConLibres([0, 1], 1);
    expect(elegirMovimiento(sUnico, 'facil', () => 0.99)).toEqual({ a: 0, b: 1 });
  });

  it('medio toma victoria en 1, evita derrota en 1 y maximiza movilidad restante 1 ply', () => {
    const rng = crearRng(9);

    // Victoria en 1 disponible: 1x3 libre -> cualquier dominó gana en 1
    const sWin = estadoConLibres([0, 1, 2], 1);
    expect(playMove(sWin, elegirMovimiento(sWin, 'medio', rng)).status).toBe('won');

    // 1x4 libre: {1, 2} deja 0 jugadas (gana en 1!)
    const sWin4 = estadoConLibres([0, 1, 2, 3], 1);
    expect(elegirMovimiento(sWin4, 'medio', rng)).toEqual({ a: 1, b: 2 });

    // Evitar derrota en 1: componentes 1x2 ({12,13}) y 1x4 ({0,1,2,3}).
    // {1,2} permite victoria rival en 1; {12,13} deja 1x4 donde rival gana con {1,2}!
    // Únicas jugadas seguras: {0,1} o {2,3}.
    const sEvitar = estadoConLibres([0, 1, 2, 3, 12, 13], 1);
    const movEvitar = elegirMovimiento(sEvitar, 'medio', rng);
    expect([
      { a: 0, b: 1 },
      { a: 2, b: 3 },
    ]).toContainEqual(movEvitar);

    // Maximizar movilidad restante 1 ply entre jugadas seguras:
    // 1x5 ({0,1,2,3,4}) + 1x2 ({12,13}): ninguna jugada regala victoria en 1;
    // {12,13} deja 4 dominós restantes en 1x5, mientras las jugadas dentro de 1x5 dejan 2 o 3.
    const sMovilidad = estadoConLibres([0, 1, 2, 3, 4, 12, 13], 1);
    expect(elegirMovimiento(sMovilidad, 'medio', rng)).toEqual({ a: 12, b: 13 });
  });

  it('dificil como J2 usa simetría rotacional de 180° mientras el tablero sea simétrico', () => {
    const rng = crearRng(33);
    const aperturas: Move[] = [
      { a: 0, b: 1 },
      { a: 0, b: 6 },
      { a: 14, b: 15 },
      { a: 14, b: 20 },
      { a: 5, b: 11 },
    ];

    for (const apertura of aperturas) {
      const s1 = playMove(createInitialState(), apertura);
      const respuesta = elegirMovimiento(s1, 'dificil', rng);
      expect(respuesta).toEqual({ a: 35 - apertura.b, b: 35 - apertura.a });
    }

    // Partida completa J1 (azar) vs J2 (dificil): J2 siempre responde simétrico y gana 100%
    for (let i = 0; i < 10; i++) {
      let s = createInitialState();
      while (s.status === 'playing') {
        if (s.currentPlayer === 1) {
          s = playMove(s, jugadaAzar(s, rng));
        } else {
          const j1Move = s.lastMove!;
          const movJ2 = elegirMovimiento(s, 'dificil', rng);
          expect(movJ2).toEqual({ a: 35 - j1Move.b, b: 35 - j1Move.a });
          s = playMove(s, movJ2);
        }
      }
      expect(s.winner).toBe(2);
    }
  });

  it('dificil usa Sprague-Grundy (XOR) exacto en componentes <= 14 casillas y vence donde medio falla', () => {
    const rng = crearRng(55);

    // 1x6 (g=3) + 1x3 (g=1): G = 2 != 0.
    // Únicas jugadas ganadoras son {19,20} y {21,22} (dejan 1x3 + 1x3, G=0), con movilidad 4,
    // mientras medio prefiere {0,1}, {1,2}, {18,19} o {22,23} de movilidad 5 y pierde!
    const s1 = estadoConLibres([0, 1, 2, 18, 19, 20, 21, 22, 23], 1);
    const mov1 = elegirMovimiento(s1, 'dificil', rng);
    expect([
      { a: 19, b: 20 },
      { a: 21, b: 22 },
    ]).toContainEqual(mov1);

    // 2x2 ({0,1,6,7}, g=0) + 1x4 ({18,19,20,21}, g=2): G = 2 != 0.
    // Única jugada ganadora: {19,20} (deja 2x2 + 2 aisladas, G=0).
    const s2 = estadoConLibres([0, 1, 6, 7, 18, 19, 20, 21], 1);
    expect(elegirMovimiento(s2, 'dificil', rng)).toEqual({ a: 19, b: 20 });

    // Si J2 encuentra tablero asimétrico (simetría ya rota) con G != 0, usa SG y no se rompe
    const sAsimJ2 = estadoConLibres([0, 1, 2, 18, 19, 20, 21, 22, 23], 2, { a: 34, b: 35 });
    const movJ2 = elegirMovimiento(sAsimJ2, 'dificil', rng);
    expect([
      { a: 19, b: 20 },
      { a: 21, b: 22 },
    ]).toContainEqual(movJ2);
  });

  it('dificil detecta victoria exacta con componentes <= 14 (como 2x5 + 1x3 = 13 casillas)', () => {
    const rng = crearRng(101);
    // 2x5 tiene G = 1 y 1x3 tiene G = 1 => G_total = 1 ^ 1 = 0 (victoria teórica para J2).
    const libresG0 = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 24, 25, 26]; // 2x5 + 1x3 = 13 casillas
    let s0 = estadoConLibres(libresG0, 1);
    while (s0.status === 'playing') {
      const t0 = performance.now();
      const m = elegirMovimiento(s0, 'dificil', rng);
      expect(performance.now() - t0).toBeLessThan(30);
      expect(dominosLegalesEn(s0.board, m.a)).toContainEqual(m);
      s0 = playMove(s0, m);
    }
    expect(s0.status).toBe('won');
    expect(s0.winner).toBe(2);

    // 2x5 (G = 1) + 1x4 (G = 2) => G_total = 3 != 0 (victoria teórica para J1).
    const libresG3 = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 24, 25, 26, 27]; // 14 casillas
    let s3 = estadoConLibres(libresG3, 1);
    while (s3.status === 'playing') {
      const t0 = performance.now();
      const m = elegirMovimiento(s3, 'dificil', rng);
      expect(performance.now() - t0).toBeLessThan(30);
      expect(dominosLegalesEn(s3.board, m.a)).toContainEqual(m);
      s3 = playMove(s3, m);
    }
    expect(s3.status).toBe('won');
    expect(s3.winner).toBe(1);
  });

  it('regresión: dificil evalúa correctamente componentes simétricas impar×impar con y sin centro (cruz 3×3 y 3×5)', () => {
    const rng = crearRng(303);

    // Cruz 3×3 [1, 6, 7, 8, 13] (G = 1, centro 7 presente) + 1×4 [18, 19, 20, 21] (G = 2) => G = 3 != 0.
    // Únicas jugadas ganadoras: {18, 19} o {20, 21} (dejan cruz 3×3 + 1×2, G = 1^1 = 0).
    // Nunca debe jugar {19, 20} (que regala la cruz 3×3 con G = 1).
    const sCruz = estadoConLibres([1, 6, 7, 8, 13, 18, 19, 20, 21], 1);
    const movCruz = elegirMovimiento(sCruz, 'dificil', rng);
    expect([
      { a: 18, b: 19 },
      { a: 20, b: 21 },
    ]).toContainEqual(movCruz);

    let sPlay = sCruz;
    while (sPlay.status === 'playing') {
      sPlay = playMove(sPlay, elegirMovimiento(sPlay, 'dificil', rng));
    }
    expect(sPlay.winner).toBe(1);

    // Anillo hueco 3×3 [0, 1, 2, 6, 8, 12, 13, 14] (impar×impar SIN centro => G = 0) + 1×2 [18, 19] (G = 1) => G = 1.
    const sHueco = estadoConLibres([0, 1, 2, 6, 8, 12, 13, 14, 18, 19], 1);
    expect(elegirMovimiento(sHueco, 'dificil', rng)).toEqual({ a: 18, b: 19 });

    // Componente > 14 impar×impar CON centro: 3×5 [0..4, 6..10, 12..16] (G = 1) + 1×4 [30, 31, 32, 33] (G = 2).
    // No debe descartar 3×5 como G = 0 ni jugar {31, 32} (que deja 3×5 solo y pierde).
    const s3x5 = estadoConLibres(
      [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 30, 31, 32, 33],
      1
    );
    const mov3x5 = elegirMovimiento(s3x5, 'dificil', rng);
    expect(mov3x5).not.toEqual({ a: 31, b: 32 });
  });

  it('regresión: negamaxGrande no emite EXACT_WIN falso cuando trunca jugadas en componentes > 14', () => {
    const rng = crearRng(404);
    // Componente de 17 casillas (20 jugadas legales):
    // Únicas ganadoras reales: {2, 8}, {6, 12}, {10, 16}.
    // Trampas de poda: {14, 15} y {15, 21} (cb=9) tienen >12 respuestas donde las 9 primeras por centerBias
    // pierden (G != 0) pero una respuesta posterior gana (G == 0).
    const s = estadoConLibres(
      [0, 1, 2, 3, 4, 6, 8, 10, 12, 13, 14, 15, 16, 18, 19, 21, 22],
      1
    );
    const mov = elegirMovimiento(s, 'dificil', rng);
    expect([
      { a: 2, b: 8 },
      { a: 6, b: 12 },
      { a: 10, b: 16 },
    ]).toContainEqual(mov);

    let sPlay = s;
    while (sPlay.status === 'playing') {
      const t0 = performance.now();
      const m = elegirMovimiento(sPlay, 'dificil', rng);
      expect(performance.now() - t0).toBeLessThan(30);
      sPlay = playMove(sPlay, m);
    }
    expect(sPlay.winner).toBe(1);
  });

  it('calibración: dificil > medio > facil (>65% con partidas espejo) y azar gana a facil', () => {
    const rng = crearRng(2026);
    const PARES = 30; // 60 partidas espejo por duelo
    let dificilGana = 0;
    let medioGana = 0;

    for (let i = 0; i < PARES; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'dificil', rng) === 2) dificilGana++;

      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('facil', 'medio', rng) === 2) medioGana++;
    }

    const M = 40;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      const asJ1 = i % 2 === 0;
      const ganador = asJ1 ? simular('azar', 'facil', rng) : simular('facil', 'azar', rng);
      if ((asJ1 && ganador === 1) || (!asJ1 && ganador === 2)) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(medioGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(azarGana).toBeGreaterThan(M * 0.15);
  });
});
