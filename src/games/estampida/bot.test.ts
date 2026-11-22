import { describe, expect, it } from 'vitest';
import {
  celdasQueCopian,
  createInitialState,
  esJugadaValida,
  playMove,
  TAMANO,
  type Cell,
  type Direccion,
  type EstampidaState,
  type Move,
  type Player,
} from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

const DIRECCIONES: Direccion[] = ['arriba', 'abajo', 'izquierda', 'derecha'];

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: EstampidaState, rng: () => number): Move {
  if (state.fase === 'setup') {
    const vacias: number[] = [];
    for (let i = 0; i < state.board.length; i++) {
      if (state.board[i] === null) vacias.push(i);
    }
    return { tipo: 'colocar', celda: vacias[Math.floor(rng() * vacias.length)] };
  }
  const legales = DIRECCIONES.filter(
    dir => celdasQueCopian(state.board, state.currentPlayer, dir).length > 0,
  );
  return { tipo: 'estampida', dir: legales[Math.floor(rng() * legales.length)] };
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number,
): Player | null {
  let state = createInitialState();
  while (state.fase !== 'finished') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    if (state.fase === 'playing' && mov.tipo === 'estampida') {
      expect(celdasQueCopian(state.board, state.currentPlayer, mov.dir).length).toBeGreaterThan(0);
    }
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

function construirEstadoPlaying(
  board: Cell[],
  currentPlayer: Player,
): EstampidaState {
  return {
    board,
    fase: 'playing',
    currentPlayer,
    colocadas: { 1: 5, 2: 5 },
    winner: null,
    ultimasCopias: [],
    ultimaDireccion: null,
  };
}

const idx = (fila: number, col: number) => fila * TAMANO + col;

describe('estampida bot', () => {
  it('genera jugadas legales en setup, juego medio y final en menos de 30 ms por turno', () => {
    const rng = crearRng(42);
    let state = createInitialState();
    let maxMs = 0;
    let totalDificilMs = 0;
    let turnosDificil = 0;

    while (state.fase !== 'finished') {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const elapsed = performance.now() - t0;
        if (elapsed > maxMs) maxMs = elapsed;
        if (dif === 'dificil') {
          totalDificilMs += elapsed;
          turnosDificil++;
        }
        expect(elapsed).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        if (state.fase === 'setup') {
          expect(mov.tipo).toBe('colocar');
          if (mov.tipo === 'colocar') {
            expect(state.board[mov.celda]).toBeNull();
          }
        } else {
          expect(mov.tipo).toBe('estampida');
          if (mov.tipo === 'estampida') {
            expect(
              celdasQueCopian(state.board, state.currentPlayer, mov.dir).length,
            ).toBeGreaterThan(0);
          }
        }
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }

    expect(maxMs).toBeLessThan(30);
    expect(totalDificilMs / turnosDificil).toBeLessThan(15);
  });

  it('es determinista respecto al parámetro rng', () => {
    const s0 = createInitialState();
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(s0, dif, crearRng(777));
      const m2 = elegirMovimiento(s0, dif, crearRng(777));
      expect(m1).toEqual(m2);
    }

    let sPlay = s0;
    const rngPlay = crearRng(19);
    while (sPlay.fase === 'setup') {
      sPlay = playMove(sPlay, jugadaAzar(sPlay, rngPlay));
    }
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(sPlay, dif, crearRng(888));
      const m2 = elegirMovimiento(sPlay, dif, crearRng(888));
      expect(m1).toEqual(m2);
    }
  });

  it('invariantes en setup: medio y difícil evitan bordes y se separan de fichas previas', () => {
    const s0 = createInitialState();
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(s0, dif, crearRng(10));
      expect(mov.tipo).toBe('colocar');
      if (mov.tipo === 'colocar') {
        const fila = Math.floor(mov.celda / TAMANO);
        const col = mov.celda % TAMANO;
        expect(fila).toBeGreaterThanOrEqual(1);
        expect(fila).toBeLessThanOrEqual(6);
        expect(col).toBeGreaterThanOrEqual(1);
        expect(col).toBeLessThanOrEqual(6);
      }
    }

    // J1 colocó en (3,3) y J2 en (1,1); J1 coloca su 2.ª ficha: medio y difícil no se pegan a (3,3) ni van al borde.
    let s2 = playMove(s0, { tipo: 'colocar', celda: idx(3, 3) });
    s2 = playMove(s2, { tipo: 'colocar', celda: idx(1, 1) });
    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(s2, dif, crearRng(20));
      expect(mov.tipo).toBe('colocar');
      if (mov.tipo === 'colocar') {
        const fila = Math.floor(mov.celda / TAMANO);
        const col = mov.celda % TAMANO;
        const distPropia = Math.abs(fila - 3) + Math.abs(col - 3);
        expect(fila).toBeGreaterThanOrEqual(1);
        expect(fila).toBeLessThanOrEqual(6);
        expect(col).toBeGreaterThanOrEqual(1);
        expect(col).toBeLessThanOrEqual(6);
        expect(distPropia).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('invariante en playing: medio y difícil toman la dirección de mayor ganancia clara', () => {
    // J1 forma una columna vertical de 4 fichas en col 2 (filas 2..5).
    // Hacia 'derecha' copia 4 fichas (col 3); hacia 'arriba' solo 1; 'izquierda' 4 pero en col 1 (borde cerca);
    // bloqueamos izquierda con J2 en col 1 para que 'derecha' sea indiscutiblemente la mayor ganancia (4 vs 1).
    const board: Cell[] = Array<Cell>(64).fill(null);
    board[idx(2, 2)] = 1;
    board[idx(3, 2)] = 1;
    board[idx(4, 2)] = 1;
    board[idx(5, 2)] = 1;
    board[idx(1, 2)] = 2; // bloquea arriba de J1
    board[idx(2, 1)] = 2;
    board[idx(3, 1)] = 2;
    board[idx(4, 1)] = 2;
    board[idx(5, 1)] = 2;
    // Con esto: arriba=0, izquierda=0, abajo=1 (6,2), derecha=4 (2..5, 3).
    // Agregamos una ficha libre de J1 en (7,0) con (6,0)=null para tener >=2 direcciones legales (abajo=0, arriba=1, derecha=1+4=5).
    board[idx(7, 0)] = 1;
    // Así 'arriba' copia 1 (6,0) y 'derecha' copia 5 ((7,1) y (2..5,3)).
    const state = construirEstadoPlaying(board, 1);

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, crearRng(5));
      expect(mov).toEqual({ tipo: 'estampida', dir: 'derecha' });
    }
  });

  it('invariante en playing: difícil aprovecha salto de turno (cerrarTurno) para barrer el final y ganar', () => {
    // Tablero casi lleno: 60 casillas ocupadas, 4 vacías.
    // J1 tiene 29 fichas, J2 tiene 31 fichas. Le toca a J1.
    // Vacías: (0,0), (0,1), (0,2), (7,7).
    // En (0,3)=1, (1,0)=2, (1,1)=2, (1,2)=2, (6,7)=1, (7,6)=1.
    // Si J1 juega 'izquierda': ocupa (0,2) desde (0,3) -> 30 vs 31.
    //   En ese punto J2 puede jugar 'arriba' desde (1,0),(1,1) para ocupar (0,0),(0,1) -> J2=33, J1 luego ocupa (7,7) -> J1=31 vs J2=33 (pierde J1!).
    // Si J1 juega 'abajo' (ocupando (7,7) desde (6,7)) -> NO, eso deja (0,0),(0,1),(0,2) a J2.
    // Mejor diseño exacto de salto de turno:
    // J1=30, J2=30, vacías 4: (0,0), (0,1), (0,2), (7,7).
    // Colocamos:
    //   (1,0)=1, (1,1)=1, (1,2)=1 (para que J1 pueda subir si tuviera turno, pero bloqueado si J2 sube? No, hagamos que J1 gane por salto!).
    // Hagamos:
    //   Vacías: (0,0), (0,1), (0,2), (1,0) -> 4 vacías. Total fichas: J1=29, J2=31.
    //   Resto del tablero lleno con J1=29, J2=31, donde todas las fichas de J2 rodeando las vacías solo pueden entrar por:
    //   (2,0)=2 (solo sube a (1,0)).
    //   (0,3)=1 (izquierda a (0,2)).
    //   (1,1)=1 (sube a (0,1), izquierda a (1,0)).
    //   (1,2)=1 (sube a (0,2)).
    //   Si J1 juega 'izquierda': ocupa (1,0) desde (1,1) Y (0,2) desde (0,3)!
    //   Quedan vacías (0,0) y (0,1). Ahora ¿puede J2 mover? (2,0) tiene (1,0)=1 arriba -> NO! Ninguna ficha de J2 tiene vacía adyacente!
    //   Por lo tanto `cerrarTurno` SALTA a J2 y le vuelve a tocar a J1!
    //   J1 juega 'arriba' desde (1,0) y (1,1), llenando (0,0) y (0,1) -> J1 termina con 29+4=33 vs J2=31 (GANA J1!).
    //   En cambio si J1 jugaba 'arriba' primero: ocupaba (0,1) y (0,2) (31 vs 31), dejando (1,0) libre -> J2 subía desde (2,0) a (1,0) (32) y luego (0,0) (33 vs 31, PIERDE J1!).
    const board: Cell[] = Array<Cell>(64).fill(null);
    // Rellenar todo primero con patrón seguro (sin adyacentes vacías salvo las 4 indicadas)
    let unos = 0;
    let doses = 0;
    for (let i = 0; i < 64; i++) {
      if (i === idx(0, 0) || i === idx(0, 1) || i === idx(0, 2) || i === idx(1, 0)) {
        continue;
      }
      if (i === idx(0, 3) || i === idx(1, 1) || i === idx(1, 2)) {
        board[i] = 1;
        unos++;
      } else if (i === idx(2, 0)) {
        board[i] = 2;
        doses++;
      } else if (unos < 29) {
        board[i] = 1;
        unos++;
      } else {
        board[i] = 2;
        doses++;
      }
    }
    expect(unos).toBe(29);
    expect(doses).toBe(31);

    const state = construirEstadoPlaying(board, 1);
    const mov = elegirMovimiento(state, 'dificil', crearRng(1));
    expect(mov).toEqual({ tipo: 'estampida', dir: 'izquierda' });
  });

  it('facil en playing varía direcciones legales con rng', () => {
    const board: Cell[] = Array<Cell>(64).fill(null);
    board[idx(3, 3)] = 1;
    board[idx(4, 4)] = 2;
    const state = construirEstadoPlaying(board, 1);

    const rng = crearRng(12345);
    const dirs = new Set<Direccion>();
    for (let s = 1; s <= 24; s++) {
      const mov = elegirMovimiento(state, 'facil', rng);
      expect(mov.tipo).toBe('estampida');
      if (mov.tipo === 'estampida') dirs.add(mov.dir);
    }
    expect(dirs.size).toBeGreaterThanOrEqual(3);
  });

  it('calibración: dificil > medio > facil (> 65% en partidas espejo) y azar gana a facil', () => {
    const rng = crearRng(2026);
    const N = 20; // 10 pares de partidas espejo (J1 y J2 alternados)
    let dificilGana = 0;
    let medioGana = 0;

    for (let i = 0; i < N; i++) {
      const dificilEsJ1 = i % 2 === 0;
      const g1 = simular(dificilEsJ1 ? 'dificil' : 'medio', dificilEsJ1 ? 'medio' : 'dificil', rng);
      if (g1 === (dificilEsJ1 ? 1 : 2)) dificilGana++;

      const medioEsJ1 = i % 2 === 0;
      const g2 = simular(medioEsJ1 ? 'medio' : 'facil', medioEsJ1 ? 'facil' : 'medio', rng);
      if (g2 === (medioEsJ1 ? 1 : 2)) medioGana++;
    }

    const M = 40;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      const azarEsJ1 = i % 2 === 0;
      const g = simular(azarEsJ1 ? 'azar' : 'facil', azarEsJ1 ? 'facil' : 'azar', rng);
      if (g === (azarEsJ1 ? 1 : 2)) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(N * 0.65);
    expect(medioGana).toBeGreaterThan(N * 0.65);
    expect(azarGana).toBeGreaterThan(M * 0.15);
  });
});
