import { describe, expect, it } from 'vitest';
import {
  casillasLegales,
  createInitialState,
  esJugadaValida,
  esLegal,
  playMove,
  puntajes,
  TAMANO,
  TOTAL,
  type Move,
  type Player,
  type WalkingDotsState,
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

const idx = (f: number, c: number): number => f * TAMANO + c;

function tableroVacio(): (Player | null)[] {
  return Array<Player | null>(TOTAL).fill(null);
}

function jugadaAzar(state: WalkingDotsState, rng: () => number): Move {
  const legales = casillasLegales(state.board, state.currentPlayer);
  if (legales.length === 0) return 'pasar';
  return legales[Math.floor(rng() * legales.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
): Player | 'draw' {
  let state = createInitialState();
  let turnos = 0;
  while (state.status === 'playing' && turnos < 160) {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar'
        ? jugadaAzar(state, rng)
        : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    if (typeof mov === 'number') {
      expect(esLegal(state.board, mov, state.currentPlayer)).toBe(true);
    }
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
    turnos++;
  }
  expect(state.status).toBe('finished');
  return state.winner!;
}

describe('walking-dots bot', () => {
  it('genera jugadas válidas en < 30 ms por turno en estados iniciales, intermedios y finales', () => {
    const rng = crearRng(42);
    let state = createInitialState();
    let turnos = 0;
    let maxDifMs = 0;
    let sumDifMs = 0;
    let conteoDif = 0;

    // En el estado inicial ninguno debe pasar.
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m0 = elegirMovimiento(state, dif, rng);
      expect(typeof m0).toBe('number');
      expect(esLegal(state.board, m0 as number, state.currentPlayer)).toBe(true);
    }

    while (state.status === 'playing' && turnos < 120) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const dt = performance.now() - t0;
        expect(dt).toBeLessThan(30);
        if (dif === 'dificil') {
          if (dt > maxDifMs) maxDifMs = dt;
          sumDifMs += dt;
          conteoDif++;
        }
        expect(esJugadaValida(mov)).toBe(true);
        if (typeof mov === 'number') {
          expect(esLegal(state.board, mov, state.currentPlayer)).toBe(true);
        }
        expect(playMove(state, mov)).not.toBe(state);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
      turnos++;
    }

    expect(state.status).toBe('finished');
    expect(maxDifMs).toBeLessThan(30);
    expect(sumDifMs / Math.max(1, conteoDif)).toBeLessThan(15);

    // Estado sin casillas legales: los tres niveles deben pasar.
    const lleno = Array<Player | null>(TOTAL).fill(1);
    lleno[TOTAL - 1] = 2;
    const sinLegales: WalkingDotsState = {
      board: lleno,
      currentPlayer: 1,
      pasesSeguidos: 0,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    expect(casillasLegales(sinLegales.board, 1)).toEqual([]);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      expect(elegirMovimiento(sinLegales, dif, rng)).toBe('pasar');
    }
  });

  it('es 100% determinista para una misma semilla rng', () => {
    let state = createInitialState();
    state = playMove(state, idx(1, 2));
    state = playMove(state, idx(5, 4));
    state = playMove(state, idx(2, 2));

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(state, dif, crearRng(777));
      const m2 = elegirMovimiento(state, dif, crearRng(777));
      expect(m1).toBe(m2);
    }
  });

  it('facil elige casillas legales al azar y pasa solo cuando casillasLegales es vacío', () => {
    // J1 solo tiene jugadas dentro de su territorio cerrado, además pasesSeguidos=1 y J1 va arriba.
    const board = tableroVacio();
    for (let f = 0; f < TAMANO; f++) {
      board[idx(f, 2)] = 1;
      board[idx(f, 3)] = 2;
    }
    const state: WalkingDotsState = {
      board,
      currentPlayer: 1,
      pasesSeguidos: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    const legales = casillasLegales(board, 1);
    expect(legales.length).toBeGreaterThan(0);

    const mLow = elegirMovimiento(state, 'facil', () => 0.0);
    const mHigh = elegirMovimiento(state, 'facil', () => 0.99);
    expect(typeof mLow).toBe('number');
    expect(typeof mHigh).toBe('number');
    expect(legales).toContain(mLow);
    expect(legales).toContain(mHigh);
    expect(mLow).not.toBe(mHigh);
  });

  it('medio y difícil pasan para ganar cuando pasesSeguidos === 1 y van adelante; no pasan si van atrás con disputa', () => {
    // J1 domina la mitad izquierda cercada + contacto en centro; va ganando 20 a 6.
    const bGanando = tableroVacio();
    for (let f = 0; f < TAMANO; f++) {
      bGanando[idx(f, 2)] = 1;
    }
    bGanando[idx(3, 3)] = 1; // todavía tiene casillas en disputa en el lado derecho
    bGanando[idx(5, 5)] = 2;
    bGanando[idx(5, 4)] = 2;

    const pGan = puntajes(bGanando);
    expect(pGan.total[1]).toBeGreaterThan(pGan.total[2]);
    expect(casillasLegales(bGanando, 1).some(c => pGan.duenoDeVacia[c] === null)).toBe(true);

    const sGanando: WalkingDotsState = {
      board: bGanando,
      currentPlayer: 1,
      pasesSeguidos: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(sGanando, dif, crearRng(3));
      expect(mov).toBe('pasar');
      const fin = playMove(sGanando, mov);
      expect(fin.status).toBe('finished');
      expect(fin.winner).toBe(1);
    }

    // Ahora J2 tiene pasesSeguidos === 1 pero va perdiendo (con casillas disputadas): no debe pasar.
    const sPerdiendo: WalkingDotsState = {
      board: bGanando,
      currentPlayer: 2,
      pasesSeguidos: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(sPerdiendo, dif, crearRng(3));
      expect(typeof mov).toBe('number');
      expect(esLegal(bGanando, mov as number, 2)).toBe(true);
    }
  });

  it('medio y difícil evitan auto-rellenar territorio propio cerrado', () => {
    // J1 encierra la esquina (0,0) con (0,1)=1, (1,0)=1, (1,1)=1, y además toca la frontera en (2,2)=1.
    const board = tableroVacio();
    board[idx(0, 1)] = 1;
    board[idx(1, 0)] = 1;
    board[idx(1, 1)] = 1;
    board[idx(2, 2)] = 1;
    board[idx(5, 5)] = 2;

    const area = puntajes(board);
    expect(area.duenoDeVacia[idx(0, 0)]).toBe(1);

    const state: WalkingDotsState = {
      board,
      currentPlayer: 1,
      pasesSeguidos: 0,
      status: 'playing',
      winner: null,
      lastMove: null,
    };

    const rng = crearRng(15);
    for (const dif of ['medio', 'dificil'] as const) {
      for (let i = 0; i < 5; i++) {
        const mov = elegirMovimiento(state, dif, rng);
        expect(typeof mov).toBe('number');
        expect(mov).not.toBe(idx(0, 0));
        expect(area.duenoDeVacia[mov as number]).toBeNull();
      }
    }

    // Si solo quedan casillas dentro del territorio propio cerrado, medio y difícil pasan.
    const bCerrado = tableroVacio();
    for (let f = 0; f < TAMANO; f++) {
      bCerrado[idx(f, 2)] = 1;
      bCerrado[idx(f, 3)] = 2;
    }
    const sSoloCerrado: WalkingDotsState = {
      board: bCerrado,
      currentPlayer: 1,
      pasesSeguidos: 0,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    expect(casillasLegales(bCerrado, 1).length).toBeGreaterThan(0);
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sSoloCerrado, dif, rng)).toBe('pasar');
    }
  });

  it('difícil toma decisión exacta de pasar cuando pasesSeguidos === 1 y está empatado', () => {
    // Caso A: Empate 22 vs 22 con pasesSeguidos=1; la única casilla disputada (0,2)=2 abre una bolsa de 5 para J2.
    // Si J1 juega (0,2), J2 responde (0,3) y gana 26 a 23; si J1 pasa, asegura el empate.
    const bEmpateMalo = Array<Player | null>(TOTAL).fill(null);
    const bolsilloMalo = new Set([idx(0, 2), idx(0, 3), idx(0, 4), idx(0, 5), idx(0, 6)]);
    const celdaCerradaJ1 = idx(6, 0);

    // Vecinos de (6,0)=42 son (5,0)=35 y (6,1)=43 -> ambos para J1.
    const j1Fijos = new Set([idx(0, 1), idx(5, 0), idx(6, 1)]);
    // Vecinos inferiores del bolsillo: (1,2)..(1,6) -> todos para J2.
    const j2Fijos = new Set([idx(1, 2), idx(1, 3), idx(1, 4), idx(1, 5), idx(1, 6)]);

    let c1 = 0;
    let c2 = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (bolsilloMalo.has(i) || i === celdaCerradaJ1) continue;
      if (j1Fijos.has(i)) {
        bEmpateMalo[i] = 1;
        c1++;
      } else if (j2Fijos.has(i)) {
        bEmpateMalo[i] = 2;
        c2++;
      }
    }
    for (let i = 0; i < TOTAL; i++) {
      if (bolsilloMalo.has(i) || i === celdaCerradaJ1 || bEmpateMalo[i] !== null) continue;
      if (c1 < 21) {
        bEmpateMalo[i] = 1;
        c1++;
      } else {
        bEmpateMalo[i] = 2;
        c2++;
      }
    }

    const pMalo = puntajes(bEmpateMalo);
    expect(pMalo.total).toEqual({ 1: 22, 2: 22 });

    const sEmpateMalo: WalkingDotsState = {
      board: bEmpateMalo,
      currentPlayer: 1,
      pasesSeguidos: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    expect(elegirMovimiento(sEmpateMalo, 'dificil', crearRng(5))).toBe('pasar');

    // Caso B: Empate 24 vs 24 con pasesSeguidos=1 y queda 1 única casilla disputada (0,2)=2 -> jugar gana 25 a 24.
    const bEmpateBueno = Array<Player | null>(TOTAL).fill(null);
    const unicaDisputa = idx(0, 2);
    const j1FijosB = new Set([idx(0, 1), idx(1, 2), idx(5, 0), idx(6, 1)]);
    const j2FijosB = new Set([idx(0, 3)]);
    c1 = 0;
    c2 = 0;
    for (let i = 0; i < TOTAL; i++) {
      if (i === unicaDisputa || i === celdaCerradaJ1) continue;
      if (j1FijosB.has(i)) {
        bEmpateBueno[i] = 1;
        c1++;
      } else if (j2FijosB.has(i)) {
        bEmpateBueno[i] = 2;
        c2++;
      }
    }
    for (let i = 0; i < TOTAL; i++) {
      if (i === unicaDisputa || i === celdaCerradaJ1 || bEmpateBueno[i] !== null) continue;
      if (c1 < 23) {
        bEmpateBueno[i] = 1;
        c1++;
      } else {
        bEmpateBueno[i] = 2;
        c2++;
      }
    }

    const pBueno = puntajes(bEmpateBueno);
    expect(pBueno.total).toEqual({ 1: 24, 2: 24 });

    const sEmpateBueno: WalkingDotsState = {
      board: bEmpateBueno,
      currentPlayer: 1,
      pasesSeguidos: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    expect(elegirMovimiento(sEmpateBueno, 'dificil', crearRng(5))).toBe(unicaDisputa);
  });

  it('difícil sella cuello de botella para asegurar gran territorio', () => {
    // Muro en col 2 desde fila 1 hasta fila 6 excepto el hueco (0,2)=2 que conecta cols 0..1 (12 vacías).
    // J1 está en (1,2) y (0,3)? Mejor: J1 en col 2 filas 1..6, J2 se acerca en (0,3).
    // Si J1 juega (0,2), cierra 12 casillas de cols 0..1 inmediatamente (+13 pts); si juega en otro lado, J2 entra por (0,2).
    const board = tableroVacio();
    for (let f = 1; f < TAMANO; f++) board[idx(f, 2)] = 1;
    board[idx(0, 3)] = 2;
    board[idx(1, 3)] = 1; // da otra jugada disputada en (2,3), (1,4), etc.
    board[idx(5, 5)] = 2;

    const state: WalkingDotsState = {
      board,
      currentPlayer: 1,
      pasesSeguidos: 0,
      status: 'playing',
      winner: null,
      lastMove: null,
    };

    expect(elegirMovimiento(state, 'dificil', crearRng(19))).toBe(idx(0, 2));
  });

  it('calibración: dificil > medio > facil (> 65% con partidas espejo) y azar gana a facil', () => {
    const rng = crearRng(2026);
    const N = 20; // 10 como J1 + 10 como J2 (partidas espejo)
    let dificilGana = 0;
    let medioGana = 0;

    for (let i = 0; i < N; i++) {
      const comoJ1 = i % 2 === 0;
      if (comoJ1) {
        if (simular('dificil', 'medio', rng) === 1) dificilGana++;
        if (simular('medio', 'facil', rng) === 1) medioGana++;
      } else {
        if (simular('medio', 'dificil', rng) === 2) dificilGana++;
        if (simular('facil', 'medio', rng) === 2) medioGana++;
      }
    }

    const M = 40;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      const comoJ1 = i % 2 === 0;
      if (comoJ1) {
        if (simular('azar', 'facil', rng) === 1) azarGana++;
      } else {
        if (simular('facil', 'azar', rng) === 2) azarGana++;
      }
    }

    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(M * 0.15);
  });
});
