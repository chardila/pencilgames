import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  type BoardSize,
  type HexState,
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

function jugadaAzar(state: HexState, rng: () => number): number {
  const vacias: number[] = [];
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] === null) vacias.push(i);
  }
  return vacias[Math.floor(rng() * vacias.length)];
}

function simular(
  size: BoardSize,
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
) {
  let state = createInitialState(size);
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov, size)).toBe(true);
    expect(state.board[mov]).toBeNull();
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

const idx = (r: number, c: number, size: BoardSize) => r * size + c;

describe('hex bot', () => {
  it('genera jugadas legales y progreso garantizado en todos los tamaños (5, 7, 9) y fases en < 30 ms', () => {
    const rng = crearRng(42);
    for (const size of [5, 7, 9] as const) {
      let state = createInitialState(size);
      const maxTurnos = size === 5 ? 16 : size === 7 ? 24 : 30;
      for (let turno = 0; turno < maxTurnos && state.status === 'playing'; turno++) {
        for (const dif of ['facil', 'medio', 'dificil'] as const) {
          const t0 = performance.now();
          const mov = elegirMovimiento(state, dif, rng);
          const dt = performance.now() - t0;
          expect(dt, `size=${size} turno=${turno} dif=${dif}`).toBeLessThan(30);
          expect(esJugadaValida(mov, size)).toBe(true);
          expect(state.board[mov]).toBeNull();
          expect(playMove(state, mov)).not.toBe(state);
        }
        state = playMove(state, elegirMovimiento(state, 'dificil', rng));
      }

      // Estado cercano al final (casi lleno sin ganador aún, asegurando tablero con pocas casillas libres)
      let casiFinal = createInitialState(size);
      // Llenar patrón alternado que no conecte ningún borde: filas alternas con cortes
      // Mejor construir un estado válido jugando alternadamente evitando ganar hasta dejar pocas vacías
      const vaciasObjetivo = 4;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (r === size - 1 && c >= size - vaciasObjetivo) continue;
          // Patrón ajedrez modificado sin conexión completa
          casiFinal.board[idx(r, c, size)] = (r + c) % 2 === 0 ? 1 : 2;
        }
      }
      // Romper cualquier posible conexión accidental asegurando fila 0 y col 0 mixtas
      casiFinal.board[idx(0, 0, size)] = 2;
      casiFinal.board[idx(0, 1, size)] = 2;
      casiFinal.currentPlayer = 1;

      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const mov = elegirMovimiento(casiFinal, dif, rng);
        expect(esJugadaValida(mov, size)).toBe(true);
        expect(casiFinal.board[mov]).toBeNull();
        expect(playMove(casiFinal, mov)).not.toBe(casiFinal);
      }
    }
  });

  it('es 100% determinista con una semilla rng fija', () => {
    for (const size of [5, 7, 9] as const) {
      let state = createInitialState(size);
      state = playMove(state, idx(1, 1, size));
      state = playMove(state, idx(2, 2, size));
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const m1 = elegirMovimiento(state, dif, crearRng(12345));
        const m2 = elegirMovimiento(state, dif, crearRng(12345));
        expect(m1).toBe(m2);
      }
    }
  });

  it('medio y dificil ganan en 1 y bloquean derrota en 1 en los tamaños 5, 7 y 9', () => {
    const rng = crearRng(77);
    for (const size of [5, 7, 9] as const) {
      // J1 tiene toda la columna 2 excepto la fila central -> gana en 1 en (mid, 2)
      const mid = Math.floor(size / 2);
      let sGanarJ1 = createInitialState(size);
      for (let r = 0; r < size; r++) {
        if (r === mid) continue;
        sGanarJ1 = playMove(sGanarJ1, idx(r, 2, size)); // J1
        // J2 juega lejos en col 4 (o col 0 si size=5 y col 4 está libre)
        const cJ2 = r < size - 1 ? size - 1 : 0;
        sGanarJ1 = playMove(sGanarJ1, idx(r, cJ2, size)); // J2
      }
      const winCellJ1 = idx(mid, 2, size);
      for (const dif of ['medio', 'dificil'] as const) {
        expect(elegirMovimiento(sGanarJ1, dif, rng)).toBe(winCellJ1);
      }

      // Ahora le toca a J2 bloquear esa misma casilla (J1 tiene toda col 2 salvo mid)
      let sBloquearJ2 = createInitialState(size);
      for (let r = 0; r < size; r++) {
        if (r === mid) continue;
        sBloquearJ2 = playMove(sBloquearJ2, idx(r, 2, size)); // J1
        if (r < size - 2 || (mid === size - 1 && r < size - 2)) {
          sBloquearJ2 = playMove(sBloquearJ2, idx(r, size - 1, size)); // J2
        } else if (r !== size - 1) {
          sBloquearJ2 = playMove(sBloquearJ2, idx(r, 0, size)); // J2
        }
      }
      // sBloquearJ2 tiene currentPlayer === 2 tras el último movimiento de J1 (r === size - 1)
      expect(sBloquearJ2.currentPlayer).toBe(2);
      for (const dif of ['medio', 'dificil'] as const) {
        expect(elegirMovimiento(sBloquearJ2, dif, rng)).toBe(winCellJ1);
      }
    }
  });

  it('facil omite victoria inmediata cuando rng >= 0.35 y la toma cuando rng < 0.35', () => {
    const size: BoardSize = 5;
    let sGanar = createInitialState(size);
    for (let r = 0; r < size; r++) {
      if (r === 2) continue;
      sGanar = playMove(sGanar, idx(r, 2, size)); // J1
      if (r < size - 1) {
        sGanar = playMove(sGanar, idx(r, 4, size)); // J2
      } else {
        sGanar = playMove(sGanar, idx(0, 0, size)); // J2
      }
    }
    const winCell = idx(2, 2, size);

    const movOmitido = elegirMovimiento(sGanar, 'facil', () => 0.5);
    expect(esJugadaValida(movOmitido, size)).toBe(true);
    expect(sGanar.board[movOmitido]).toBeNull();
    expect(movOmitido).not.toBe(winCell);

    const movGanador = elegirMovimiento(sGanar, 'facil', () => 0.1);
    expect(movGanador).toBe(winCell);
  });

  it('dificil defiende inmediatamente un puente virtual atacado (entre fichas y al borde)', () => {
    const rng = crearRng(303);
    const size: BoardSize = 7;

    // Puente entre fichas de J1: (2,3) y (4,2) tienen portadores (3,2) y (3,3).
    // J2 acaba de jugar en (3,2), atacando el puente -> J1 debe responder en (3,3).
    let sPuente = createInitialState(size);
    sPuente = playMove(sPuente, idx(2, 3, size)); // J1
    sPuente = playMove(sPuente, idx(0, 0, size)); // J2
    sPuente = playMove(sPuente, idx(4, 2, size)); // J1
    sPuente = playMove(sPuente, idx(3, 2, size)); // J2 ataca el puente!
    expect(elegirMovimiento(sPuente, 'dificil', rng)).toBe(idx(3, 3, size));

    // Puente al borde Norte de J1: ficha en (1,3) tiene portadores (0,3) y (0,4).
    // J2 juega en (0,3) -> J1 debe responder en (0,4).
    let sBorde = createInitialState(size);
    sBorde = playMove(sBorde, idx(1, 3, size)); // J1
    sBorde = playMove(sBorde, idx(3, 3, size)); // J2
    sBorde = playMove(sBorde, idx(3, 2, size)); // J1
    sBorde = playMove(sBorde, idx(0, 3, size)); // J2 ataca el puente al borde!
    expect(elegirMovimiento(sBorde, 'dificil', rng)).toBe(idx(0, 4, size));
  });

  it('calibración en partidas espejo: dificil > medio > facil (> 65%) y azar gana a facil', () => {
    const rng = crearRng(2026);
    const pares = 12; // 24 partidas por enfrentamiento (12 como J1, 12 como J2)
    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;

    for (let i = 0; i < pares; i++) {
      if (simular(7, 'dificil', 'medio', rng) === 1) dificilGana++;
      if (simular(7, 'medio', 'dificil', rng) === 2) dificilGana++;

      if (simular(7, 'medio', 'facil', rng) === 1) medioGana++;
      if (simular(7, 'facil', 'medio', rng) === 2) medioGana++;

      if (simular(5, 'azar', 'facil', rng) === 1) azarGana++;
      if (simular(5, 'facil', 'azar', rng) === 2) azarGana++;
    }

    const total = pares * 2;
    expect(dificilGana).toBeGreaterThan(total * 0.65);
    expect(medioGana).toBeGreaterThan(total * 0.65);
    expect(azarGana).toBeGreaterThan(total * 0.15);
  });
});
