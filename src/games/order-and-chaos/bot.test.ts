import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  TAMANO,
  type CellValue,
  type Move,
  type OrdenCaosState,
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

function jugadaAzar(state: OrdenCaosState, rng: () => number): Move {
  const vacias: number[] = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] === null) vacias.push(i);
  }
  const cell = vacias[Math.floor(rng() * vacias.length)];
  const marca = rng() < 0.5 ? 'X' : 'O';
  return { cell, marca };
}

function simular(
  difOrden: Dificultad | 'azar',
  difCaos: Dificultad | 'azar',
  rng: () => number
) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? difOrden : difCaos;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

function tableroSinCinco(): CellValue[] {
  const patron: CellValue[] = [];
  for (let f = 0; f < 6; f++) {
    for (let c = 0; c < 6; c++) {
      patron.push(Math.floor(c / 2 + f) % 2 === 0 ? 'X' : 'O');
    }
  }
  return patron;
}

describe('order-and-chaos bot', () => {
  it('genera jugadas legales en estado inicial, intermedio y con 1 casilla vacía en < 30 ms', () => {
    const rng = crearRng(42);
    let state = createInitialState();

    // Inicial + intermedio a lo largo de una partida
    for (let turno = 0; turno < 20 && state.status === 'playing'; turno++) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(state.board[mov.cell]).toBeNull();
        expect(playMove(state, mov)).not.toBe(state);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }

    // Estado final con exactamente 1 casilla vacía para Orden y para Caos
    const base = tableroSinCinco();
    base[35] = null;
    for (const player of [1, 2] as const) {
      const casiLleno: OrdenCaosState = {
        board: [...base],
        currentPlayer: player,
        status: 'playing',
        winner: null,
        lastMove: null,
        linea: null,
      };
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const mov = elegirMovimiento(casiLleno, dif, rng);
        expect(esJugadaValida(mov)).toBe(true);
        expect(mov.cell).toBe(35);
        expect(playMove(casiLleno, mov)).not.toBe(casiLleno);
      }
    }
  });

  it('es 100% determinista dada la misma semilla rng', () => {
    const state = playMove(createInitialState(), { cell: idx(2, 2), marca: 'X' });
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(state, dif, crearRng(1234));
      const m2 = elegirMovimiento(state, dif, crearRng(1234));
      expect(m1).toEqual(m2);
    }
  });

  it('medio y difícil: Orden completa 5 en línea y Caos bloquea 4 en línea', () => {
    const rng = crearRng(7);

    // 4 en fila para X: cols 0..3 en fila 2 -> falta (2,4) con 'X'
    const boardX = Array<CellValue>(36).fill(null);
    for (const c of [0, 1, 2, 3]) boardX[idx(2, c)] = 'X';
    boardX[idx(0, 0)] = 'O';
    boardX[idx(5, 5)] = 'O';

    const sOrdenX: OrdenCaosState = {
      board: boardX,
      currentPlayer: 1,
      status: 'playing',
      winner: null,
      lastMove: { cell: idx(5, 5), marca: 'O' },
      linea: null,
    };
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(sOrdenX, dif, rng);
      expect(mov).toEqual({ cell: idx(2, 4), marca: 'X' });
    }

    // 4 en diagonal desplazada para O: (1,0), (2,1), (3,2), (4,3) -> falta (5,4) con 'O' para ganar
    // Caos (player 2) debe bloquear poniendo 'X' en (5,4)
    const boardO = Array<CellValue>(36).fill(null);
    boardO[idx(1, 0)] = 'O';
    boardO[idx(2, 1)] = 'O';
    boardO[idx(3, 2)] = 'O';
    boardO[idx(4, 3)] = 'O';
    boardO[idx(0, 5)] = 'X';

    const sOrdenO: OrdenCaosState = {
      board: boardO,
      currentPlayer: 1,
      status: 'playing',
      winner: null,
      lastMove: { cell: idx(0, 5), marca: 'X' },
      linea: null,
    };
    const sCaosO: OrdenCaosState = {
      ...sOrdenO,
      currentPlayer: 2,
      lastMove: { cell: idx(4, 3), marca: 'O' },
    };
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sOrdenO, dif, rng)).toEqual({ cell: idx(5, 4), marca: 'O' });
      expect(elegirMovimiento(sCaosO, dif, rng)).toEqual({ cell: idx(5, 4), marca: 'X' });
    }
  });

  it('medio y difícil: Caos neutraliza ventanas de 3 abiertas matando ambas ventanas', () => {
    const rng = crearRng(99);
    // Fila 3: null, X, X, X, null, null -> casilla (3,4) con 'O' mata las dos ventanas (3,0..4 y 3,1..5)
    // Casilla (3,0) solo mataría una ventana y dejaría X en 1,2,3,4,5 viva!
    const board = Array<CellValue>(36).fill(null);
    board[idx(3, 1)] = 'X';
    board[idx(3, 2)] = 'X';
    board[idx(3, 3)] = 'X';
    board[idx(0, 0)] = 'O';
    board[idx(0, 5)] = 'O';
    board[idx(5, 0)] = 'O';

    const state: OrdenCaosState = {
      board,
      currentPlayer: 2,
      status: 'playing',
      winner: null,
      lastMove: { cell: idx(3, 3), marca: 'X' },
      linea: null,
    };

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, rng);
      expect(mov).toEqual({ cell: idx(3, 4), marca: 'O' });
    }
  });

  it('facil omite 5 en línea o bloqueos urgentes cuando rng >= 0.35', () => {
    const board = Array<CellValue>(36).fill(null);
    for (const c of [0, 1, 2, 3]) board[idx(2, c)] = 'X';
    board[idx(0, 0)] = 'O';

    const sOrden: OrdenCaosState = {
      board,
      currentPlayer: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
      linea: null,
    };
    const omitidoOrden = elegirMovimiento(sOrden, 'facil', () => 0.5);
    expect(esJugadaValida(omitidoOrden)).toBe(true);
    expect(omitidoOrden).not.toEqual({ cell: idx(2, 4), marca: 'X' });

    const ganadoOrden = elegirMovimiento(sOrden, 'facil', () => 0.1);
    expect(ganadoOrden).toEqual({ cell: idx(2, 4), marca: 'X' });

    const sCaos: OrdenCaosState = { ...sOrden, currentPlayer: 2 };
    const omitidoCaos = elegirMovimiento(sCaos, 'facil', () => 0.5);
    expect(esJugadaValida(omitidoCaos)).toBe(true);
    expect(omitidoCaos).not.toEqual({ cell: idx(2, 4), marca: 'O' });
  });

  it('calibración espejo: dificil > medio > facil (> 65%) y azar gana a facil', () => {
    const rng = crearRng(2026);
    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;
    const PARES = 20; // 40 partidas espejo por duelo
    const PARES_AZAR = 30; // 60 partidas espejo azar vs facil

    for (let i = 0; i < PARES; i++) {
      // dificil vs medio (espejo: Orden y Caos)
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'dificil', rng) === 2) dificilGana++;

      // medio vs facil (espejo: Orden y Caos)
      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('facil', 'medio', rng) === 2) medioGana++;
    }

    for (let i = 0; i < PARES_AZAR; i++) {
      if (simular('azar', 'facil', rng) === 1) azarGana++;
      if (simular('facil', 'azar', rng) === 2) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(medioGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(azarGana).toBeGreaterThan(PARES_AZAR * 2 * 0.1);
  });
});
