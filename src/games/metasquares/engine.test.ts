import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  movimientosLegales,
  playMove,
  contarOcupadas,
  TODOS_LOS_CUADRADOS,
  TAMANO,
  OBJETIVO,
  type MetaSquaresState,
  type Player,
} from './engine';

/** Aplica una secuencia de celdas alternando jugadores desde el estado inicial. */
function jugarSecuencia(celdas: number[]): MetaSquaresState {
  let s = createInitialState();
  for (const celda of celdas) s = playMove(s, { celda });
  return s;
}

describe('metasquares engine - geometría', () => {
  it('la retícula 7x7 tiene exactamente 196 cuadrados posibles', () => {
    // Σ_{k=1}^{6} k·(7-k)² = 36+50+48+36+20+6 = 196
    expect(TODOS_LOS_CUADRADOS).toHaveLength(196);
  });

  it('cada cuadrado tiene 4 esquinas distintas, en rango y ordenadas asc', () => {
    for (const sq of TODOS_LOS_CUADRADOS) {
      expect(sq.corners).toHaveLength(4);
      const set = new Set(sq.corners);
      expect(set.size).toBe(4);
      for (const c of sq.corners) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(TAMANO * TAMANO);
      }
      const ordenadas = [...sq.corners].sort((a, b) => a - b);
      expect(sq.corners).toEqual(ordenadas);
    }
  });

  it('no hay dos cuadrados con el mismo conjunto de esquinas', () => {
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(new Set(claves).size).toBe(TODOS_LOS_CUADRADOS.length);
  });

  it('incluye el cuadrado axis-aligned 1x1 de la esquina (0,0)', () => {
    // celdas 0,1,7,8 → ordenadas [0,1,7,8]
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(claves).toContain('0,1,7,8');
  });

  it('incluye un cuadrado inclinado (vector de borde (1,2))', () => {
    // ancla (2,0): (2,0),(3,2),(1,3),(0,1) → celdas 2,17,22,7 → [2,7,17,22]
    const claves = TODOS_LOS_CUADRADOS.map(sq => sq.corners.join(','));
    expect(claves).toContain('2,7,17,22');
  });
});

describe('metasquares engine - estado inicial', () => {
  it('empieza vacío, turno del jugador 1, marcador 0-0', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(49);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.scores).toEqual({ 1: 0, 2: 0 });
    expect(s.claimed).toEqual([]);
    expect(s.lastMove).toBeNull();
    expect(s.status).toEqual({ kind: 'playing' });
    expect(OBJETIVO).toBe(5);
  });

  it('movimientosLegales devuelve las 49 celdas al empezar', () => {
    expect(movimientosLegales(createInitialState())).toHaveLength(49);
  });

  it('esJugadaValida acepta { celda: 0..48 } y rechaza el resto', () => {
    expect(esJugadaValida({ celda: 0 })).toBe(true);
    expect(esJugadaValida({ celda: 48 })).toBe(true);
    expect(esJugadaValida({ celda: 49 })).toBe(false);
    expect(esJugadaValida({ celda: -1 })).toBe(false);
    expect(esJugadaValida({ celda: 1.5 })).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({ cell: 3 })).toBe(false);
  });
});

describe('metasquares engine - playMove básico', () => {
  it('coloca la ficha del jugador en turno y alterna el turno', () => {
    let s = createInitialState();
    s = playMove(s, { celda: 10 });
    expect(s.board[10]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    expect(s.lastMove).toBe(10);
  });

  it('rechaza celda ocupada devolviendo el mismo estado', () => {
    let s = createInitialState();
    s = playMove(s, { celda: 10 });
    const rechazado = playMove(s, { celda: 10 });
    expect(rechazado).toBe(s);
  });

  it('rechaza celda fuera de rango devolviendo el mismo estado', () => {
    const s = createInitialState();
    expect(playMove(s, { celda: 99 })).toBe(s);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState();
    const copia = JSON.parse(JSON.stringify(s));
    playMove(s, { celda: 0 });
    expect(s).toEqual(copia);
  });

  it('contarOcupadas cuenta las celdas de cada jugador', () => {
    const s = jugarSecuencia([0, 20, 1, 21, 7]);
    expect(contarOcupadas(s)).toEqual({ 1: 3, 2: 2 });
  });
});

describe('metasquares engine - detección y scoring de cuadrados', () => {
  it('completar un cuadrado 1x1 suma 1 punto y lo registra en claimed', () => {
    // J1 en 0,1,7 ; J2 en 20,21,22 (rellenos inertes) ; J1 cierra en 8
    const s = jugarSecuencia([0, 20, 1, 21, 7, 22, 8]);
    expect(s.scores[1]).toBe(1);
    expect(s.claimed).toHaveLength(1);
    expect(s.claimed[0]).toEqual({ player: 1, corners: [0, 1, 7, 8] });
  });

  it('un cuadrado ya anotado no se vuelve a contar en jugadas posteriores', () => {
    let s = jugarSecuencia([0, 20, 1, 21, 7, 22, 8]); // J1 anota [0,1,7,8]
    expect(s.scores[1]).toBe(1);
    s = playMove(s, { celda: 23 }); // J2
    s = playMove(s, { celda: 2 }); // J1, no cierra ningún cuadrado nuevo aquí
    expect(s.scores[1]).toBe(1);
    expect(s.claimed).toHaveLength(1);
  });

  it('una sola jugada puede completar dos cuadrados y suma ambos', () => {
    // J1 ocupa 0,1,2,7,8,9 salvo la celda 8; al poner 8 cierra
    // [0,1,7,8] y [1,2,8,9] a la vez.
    const s = jugarSecuencia([0, 20, 1, 21, 2, 22, 7, 23, 9, 24, 8]);
    expect(s.scores[1]).toBe(2);
    expect(s.claimed).toHaveLength(2);
  });

  it('detecta un cuadrado inclinado', () => {
    // Cuadrado inclinado de celdas [2,7,17,22]. J1 pone 2,7,17 y cierra en 22.
    const s = jugarSecuencia([2, 0, 7, 1, 17, 3, 22]);
    expect(s.scores[1]).toBe(1);
    expect(s.claimed[0].corners).toEqual([2, 7, 17, 22]);
  });

  it('un cuadrado con esquinas de dos jugadores no cuenta', () => {
    // J1: 0,1,7 ; J2 cierra en 8 → el cuadrado [0,1,7,8] es mixto
    const s = jugarSecuencia([0, 20, 1, 21, 7, 8]);
    expect(s.scores[1]).toBe(0);
    expect(s.scores[2]).toBe(0);
    expect(s.claimed).toEqual([]);
  });
});

describe('metasquares engine - fin de partida', () => {
  it('llegar a 5 puntos gana de inmediato', () => {
    const j1: number[] = [];
    for (let f = 0; f < 6; f++) {
      j1.push(f * 7 + 0);
      if (!(f === 5)) j1.push(f * 7 + 1);
    }
    // j1 = [0,1,7,8,14,15,21,22,28,29,35]  (falta 36)
    const j2 = [5, 6, 12, 13, 19, 20, 26, 27, 33, 34, 40];
    let s2 = createInitialState();
    for (let i = 0; i < j1.length; i++) {
      s2 = playMove(s2, { celda: j1[i] });
      if (i < j2.length && s2.status.kind === 'playing') {
        s2 = playMove(s2, { celda: j2[i] });
      }
    }
    s2 = playMove(s2, { celda: 36 }); // cierra el 5.º cuadrado de la columna
    expect(s2.status).toEqual({ kind: 'won', winner: 1 });
    expect(s2.scores[1]).toBeGreaterThanOrEqual(5);
  });

  it('no se pueden jugar más movimientos tras ganar', () => {
    // J1 forma la doble columna col0(filas0-5)/col1(filas0-4) y cierra en 36
    // → 5 cuadrados 1x1 y victoria. J2 juega inerte en cols 5-6.
    const ganado = jugarSecuencia([
      0, 5, 7, 6, 14, 12, 21, 13, 28, 19, 35, 20, 1, 26, 8, 27, 15, 33, 22, 34,
      29, 40, 36,
    ]);
    expect(ganado.status).toEqual({ kind: 'won', winner: 1 });
    const despues = playMove(ganado, { celda: 2 });
    expect(despues).toBe(ganado);
  });

  it('tablero lleno bajo objetivo: gana la mayoría (rama sintética)', () => {
    const board: (Player | null)[] = [];
    for (let i = 0; i < 49; i++) board.push(i === 48 ? null : ((i % 2) + 1) as Player);
    const mover: Player = 2;
    const post = [...board];
    post[48] = mover;
    const claimed = TODOS_LOS_CUADRADOS.filter(sq =>
      sq.corners.every(c => post[c] === mover),
    ).map(sq => ({ player: mover, corners: sq.corners }));
    const s: MetaSquaresState = {
      board,
      currentPlayer: mover,
      scores: { 1: 3, 2: 2 },
      claimed,
      lastMove: null,
      status: { kind: 'playing' },
    };
    expect(playMove(s, { celda: 48 }).status).toEqual({ kind: 'won', winner: 1 });
  });

  it('tablero lleno con marcador empatado: draw (rama sintética)', () => {
    const board: (Player | null)[] = [];
    for (let i = 0; i < 49; i++) board.push(i === 48 ? null : ((i % 2) + 1) as Player);
    const mover: Player = 2;
    const post = [...board];
    post[48] = mover;
    const claimed = TODOS_LOS_CUADRADOS.filter(sq =>
      sq.corners.every(c => post[c] === mover),
    ).map(sq => ({ player: mover, corners: sq.corners }));
    const s: MetaSquaresState = {
      board,
      currentPlayer: mover,
      scores: { 1: 3, 2: 3 },
      claimed,
      lastMove: null,
      status: { kind: 'playing' },
    };
    expect(playMove(s, { celda: 48 }).status).toEqual({ kind: 'draw' });
  });
});

describe('metasquares engine - fuzz', () => {
  it('500 partidas aleatorias: sin excepciones e invariantes se mantienen', () => {
    let rng = 123456789;
    const rand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };
    for (let partida = 0; partida < 500; partida++) {
      let s = createInitialState();
      let guard = 0;
      while (s.status.kind === 'playing' && guard++ < 100) {
        const opciones = movimientosLegales(s);
        expect(opciones.length).toBeGreaterThan(0);
        const celda = opciones[Math.floor(rand() * opciones.length)];
        s = playMove(s, { celda });
        for (const p of [1, 2] as const) {
          expect(s.scores[p]).toBe(
            s.claimed.filter(c => c.player === p).length,
          );
        }
      }
      expect(s.status.kind).not.toBe('playing');
      if (s.status.kind === 'won') {
        const w = s.status.winner;
        const otro = w === 1 ? 2 : 1;
        const lleno = s.board.every(c => c !== null);
        expect(
          s.scores[w] >= OBJETIVO || (lleno && s.scores[w] > s.scores[otro]),
        ).toBe(true);
      } else {
        expect(s.board.every(c => c !== null)).toBe(true);
        expect(s.scores[1]).toBe(s.scores[2]);
      }
    }
  });
});
