import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  type Move,
  type NotaktoState,
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

function crearEstadoDesdeSecuencia(movimientos: Array<[number, number]>): NotaktoState {
  let state = createInitialState();
  for (const [board, cell] of movimientos) {
    state = playMove(state, { board, cell });
  }
  return state;
}

function jugadaAzar(state: NotaktoState, rng: () => number): Move {
  const legales: Move[] = [];
  for (let board = 0; board < state.boards.length; board++) {
    if (state.deadBoards[board]) continue;
    for (let cell = 0; cell < 9; cell++) {
      if (state.boards[board][cell] === null) {
        legales.push({ board, cell });
      }
    }
  }
  return legales[Math.floor(rng() * legales.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number,
  estadoInicial: NotaktoState = createInitialState()
) {
  let state = estadoInicial;
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('notakto bot', () => {
  it('genera jugadas legales, deterministas y en < 30 ms en estados iniciales, intermedios y finales', () => {
    const estados: NotaktoState[] = [
      createInitialState(),
      // Intermedio: tablero 0 muerto, tableros 1 y 2 en juego
      crearEstadoDesdeSecuencia([
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 4],
        [2, 0],
        [1, 2],
      ]),
      // Cercano al final: solo tablero 2 vivo con jugadas seguras y suicidas
      crearEstadoDesdeSecuencia([
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 0],
        [2, 1],
      ]),
      // Cercano al final forzado: todas las casillas restantes matan el último tablero vivo
      crearEstadoDesdeSecuencia([
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 0],
        [2, 1],
        [2, 3],
        [2, 4],
      ]),
    ];

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      for (const state of estados) {
        const t0 = performance.now();
        const movA = elegirMovimiento(state, dif, crearRng(123));
        const elapsed = performance.now() - t0;
        const movB = elegirMovimiento(state, dif, crearRng(123));

        expect(elapsed).toBeLessThan(30);
        expect(movA).toEqual(movB);
        expect(esJugadaValida(movA)).toBe(true);
        expect(playMove(state, movA)).not.toBe(state);
      }
    }
  });

  it('completa partidas legales en < 30 ms por jugada en los 3 niveles', () => {
    const rng = crearRng(42);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      let state = createInitialState();
      while (state.status === 'playing') {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        expect(performance.now() - t0).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(state, mov);
        expect(next).not.toBe(state);
        state = next;
      }
      expect(state.status).toBe('won');
    }
  });

  it('facil evita matar el último tablero vivo cuando rng < 0.65 y puede suicidarse cuando rng >= 0.65', () => {
    // Tableros 0 y 1 muertos; tablero 2 tiene {0, 1} -> cell 2 mata el último tablero vivo.
    const state = crearEstadoDesdeSecuencia([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
    ]);

    const movSeguro = elegirMovimiento(state, 'facil', () => 0.1);
    expect(esJugadaValida(movSeguro)).toBe(true);
    expect(movSeguro).not.toEqual({ board: 2, cell: 2 });
    expect(playMove(state, movSeguro).status).toBe('playing');

    const movSuicida = elegirMovimiento(state, 'facil', () => 0.8);
    expect(movSuicida).toEqual({ board: 2, cell: 2 });
    expect(playMove(state, movSuicida).status).toBe('won');
  });

  it('medio nunca mata el último tablero vivo si hay alternativa y resuelve tácticas a 2 plies', () => {
    // 1) Nunca mata el último tablero vivo cuando existen jugadas seguras
    const sEvitar = crearEstadoDesdeSecuencia([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
    ]);
    for (let seed = 1; seed <= 20; seed++) {
      const mov = elegirMovimiento(sEvitar, 'medio', crearRng(seed));
      expect(mov).not.toEqual({ board: 2, cell: 2 });
      expect(playMove(sEvitar, mov).status).toBe('playing');
    }

    // 2) Fuerza victoria inmediata a 2 plies: tablero 2 con {0, 1, 3} -> jugar 4 deja todas las respuestas perdedoras
    const sForzar = crearEstadoDesdeSecuencia([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 3],
    ]);
    expect(elegirMovimiento(sForzar, 'medio', crearRng(7))).toEqual({
      board: 2,
      cell: 4,
    });

    // 3) Evita trampa a 2 plies: tablero 2 con {1, 2, 3} -> solo jugar 5 evita que el rival fuerce derrota en 1 respuesta
    const sEvitarTrampa = crearEstadoDesdeSecuencia([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
    expect(elegirMovimiento(sEvitarTrampa, 'medio', crearRng(11))).toEqual({
      board: 2,
      cell: 5,
    });
  });

  it('difícil juega óptimo en misère y gana siempre como J1 desde el tablero inicial', () => {
    const rng = crearRng(2025);

    // Desde tablero inicial, J1 tiene estrategia ganadora exacta contra cualquier oponente
    for (let i = 0; i < 25; i++) {
      expect(simular('dificil', 'medio', rng)).toBe(1);
      expect(simular('dificil', 'facil', rng)).toBe(1);
      expect(simular('dificil', 'azar', rng)).toBe(1);
    }
    for (let i = 0; i < 10; i++) {
      expect(simular('dificil', 'dificil', rng)).toBe(1);
    }

    // En 1 solo tablero vacío vivo, la única jugada ganadora es el centro (celda 4)
    const unTableroVacio = crearEstadoDesdeSecuencia([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
    expect(elegirMovimiento(unTableroVacio, 'dificil', crearRng(3))).toEqual({
      board: 2,
      cell: 4,
    });

    // Con exactamente 2 tableros vacíos vivos (posición P), gana quien NO tiene el turno actual (J1)
    const dosTablerosVacios = crearEstadoDesdeSecuencia([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
    expect(dosTablerosVacios.currentPlayer).toBe(2);
    for (let i = 0; i < 20; i++) {
      // Turno actual es J2; ponemos a difícil como J1 (segundo en actuar sobre los 2 tableros)
      expect(simular('dificil', 'medio', rng, dosTablerosVacios)).toBe(1);
      expect(simular('dificil', 'azar', rng, dosTablerosVacios)).toBe(1);
    }
  });

  it('calibración espejo: dificil > medio > facil (> 65%) y azar gana partidas a facil', () => {
    const rng = crearRng(909);
    const PARES = 40; // 80 partidas por duelo (40 como J1 + 40 como J2)
    let dificilVsMedio = 0;
    let medioVsFacil = 0;
    let azarVsFacil = 0;

    for (let i = 0; i < PARES; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilVsMedio++;
      if (simular('medio', 'dificil', rng) === 2) dificilVsMedio++;

      if (simular('medio', 'facil', rng) === 1) medioVsFacil++;
      if (simular('facil', 'medio', rng) === 2) medioVsFacil++;

      if (simular('azar', 'facil', rng) === 1) azarVsFacil++;
      if (simular('facil', 'azar', rng) === 2) azarVsFacil++;
    }

    const total = PARES * 2;
    expect(dificilVsMedio).toBeGreaterThan(total * 0.65);
    expect(medioVsFacil).toBeGreaterThan(total * 0.65);
    expect(azarVsFacil).toBeGreaterThan(total * 0.25);
  });
});
