import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  vecinosLibres,
  type Player,
  type SnakesState,
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

function jugadaAzar(state: SnakesState, rng: () => number): number {
  const libres = vecinosLibres(state, state.currentPlayer);
  return libres[Math.floor(rng() * libres.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
): Player {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov =
      dif === 'azar'
        ? jugadaAzar(state, rng)
        : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    expect(vecinosLibres(state, state.currentPlayer)).toContain(mov);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('snakes bot', () => {
  it('genera jugadas legales en < 30 ms por turno en estados iniciales, intermedios y finales', () => {
    const rng = crearRng(42);
    let state = createInitialState();
    let turnos = 0;
    while (state.status === 'playing' && turnos < 47) {
      const libres = vecinosLibres(state, state.currentPlayer);
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const dt = performance.now() - t0;
        expect(dt).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(libres).toContain(mov);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
      turnos++;
    }
    expect(turnos).toBeGreaterThan(4);
  });

  it('es 100% determinista para una misma semilla rng', () => {
    const state = playMove(playMove(createInitialState(), 9), 39);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(state, dif, crearRng(123));
      const m2 = elegirMovimiento(state, dif, crearRng(123));
      expect(m1).toBe(m2);
    }
  });

  it('medio y difícil encierran al rival en 1 cuando pueden; fácil solo con prob. 0.35', () => {
    // J2 rodeado en la esquina (0,0): ocupamos (0,1)=1 y (1,1)=8; J2 está en (1,0)=7 con única salida (0,0)=0.
    // J1 está en (0,2)=2; si J1 juega (0,1)=1 ya no aplica, mejor:
    // J2 cabeza en (0,0)=0, vecinos (0,1)=1 y (1,0)=7.
    // Si (1,0)=7 ya está ocupado por J2 y (0,1)=1 está libre, J1 con cabeza en (0,2)=2 puede jugar 1 (encierra en 1) o 9 (no encierra).
    const state: SnakesState = {
      caminos: {
        1: [8, 9, 2],
        2: [40, 39, 7, 0],
      },
      currentPlayer: 1,
      status: 'playing',
      winner: null,
    };
    // Confirmar que 1 encierra a J2 y que J1 tiene otras salidas (3, 9 ya ocupado -> 3 está libre).
    expect(vecinosLibres(state, 1)).toEqual(expect.arrayContaining([1, 3]));
    expect(playMove(state, 1).status).toBe('won');
    expect(playMove(state, 3).status).toBe('playing');

    const rng = crearRng(7);
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(state, dif, rng)).toBe(1);
    }

    expect(elegirMovimiento(state, 'facil', () => 0.1)).toBe(1);
    const omitido = elegirMovimiento(state, 'facil', () => 0.5);
    expect(omitido).not.toBe(1);
    expect(vecinosLibres(state, 1)).toContain(omitido);
  });

  it('medio y difícil evitan callejones sin continuación y maximizan área accesible', () => {
    // J1 cabeza en 1 (0,1): vecino 0 (0,0) es un callejón sin salida porque (1,0)=7 está ocupado.
    // Vecino 2 (0,2) abre hacia todo el tablero derecho/inferior.
    const state: SnakesState = {
      caminos: {
        1: [8, 7, 14, 15, 16, 17, 10, 3, 2],
        2: [40],
      },
      currentPlayer: 1,
      status: 'playing',
      winner: null,
    };
    // Ajustamos: mejor J1 cabeza en 1 (0,1) con 7 (1,0) ocupado y 8 (1,1) ocupado,
    // así 0 (0,0) tiene 0 salidas y 2 (0,2) tiene salidas.
    const stateCallejon: SnakesState = {
      caminos: {
        1: [7, 8, 1],
        2: [40],
      },
      currentPlayer: 1,
      status: 'playing',
      winner: null,
    };
    // Desde 1 (0,1): vecinos libres son 0 (0,0) [callejón] y 2 (0,2) [abierto].
    expect(vecinosLibres(stateCallejon, 1).sort((a, b) => a - b)).toEqual([0, 2]);
    const rng = crearRng(11);
    expect(elegirMovimiento(stateCallejon, 'medio', rng)).toBe(2);
    expect(elegirMovimiento(stateCallejon, 'dificil', rng)).toBe(2);

    // Sala pequeña (4 celdas: {0,1,7,8}) vs sala grande (8 celdas: {21,22,28,29,35,36,42,43}).
    // Columna 2 (2,9,16,23,30,37,44) sellada por J2; J2 queda en una bolsa de 5 celdas en la esquina inferior derecha.
    const stateSalas: SnakesState = {
      caminos: {
        1: [14, 15],
        2: [
          44, 37, 30, 23, 16, 9, 2, 3, 4, 5, 6, 13, 12, 11, 10, 17, 18, 19, 20,
          27, 26, 25, 24, 31, 32, 33, 34, 38, 39, 40,
        ],
      },
      currentPlayer: 1,
      status: 'playing',
      winner: null,
    };
    // Desde 15 (2,1): 14 y 16 están ocupados. Libres: 8 (arriba, 4 celdas) y 22 (abajo, 8 celdas).
    // J2 en 40 (5,5) tiene 5 celdas libres {41, 45, 46, 47, 48}, así 8 pierde (4 <= 5) y 22 gana (8 > 5).
    expect(vecinosLibres(stateSalas, 1).sort((a, b) => a - b)).toEqual([8, 22]);
    expect(elegirMovimiento(stateSalas, 'medio', rng)).toBe(22);
    expect(elegirMovimiento(stateSalas, 'dificil', rng)).toBe(22);
    void state;
  });

  it('difícil resuelve componentes separadas eligiendo el camino de mayor supervivencia', () => {
    // Columna 3 completa ocupada (3,10,17,24,31,38,45) separa el tablero:
    // Izquierda (cols 0..2) para J1, Derecha (cols 4..6) para J2.
    // J2 en col 4..6 tiene suficiente espacio para ~12 jugadas.
    // J1 está en 15 (2,1) con 16, 22, 23 ocupados o formando un corte:
    // Si J1 va a 8 (1,1), puede recorrer el rectángulo superior (8,1,0,7,14,21,28,35,42,43,36,29...)
    // Si J1 va a 22 (3,1), queda atrapado en una bolsa más pequeña o corta el acceso al norte.
    // Más claro: en cols 0..2, fila 0..3:
    // Ocupados por J1: [3, 10, 17, 24, 31, 38, 45] no, pongamos a J1 en [24, 17, 10, 3, 2, 9, 16, 23, 22, 15] -> no,
    // hagamos una situación simple exacta:
    // J2 está encerrado en esquina inferior derecha con exactamente 4 movimientos posibles:
    // camino J2 = [45, 38, 31, 32, 33, 34, 41] -> libres cerca de 41: 48,47,46,39,40?
    // Más limpio: muro en fila 3 (21..27) ocupando 21,22,23,24,25,26,27.
    // J1 está arriba (filas 0..2) en 8 (1,1). 1, 7, 9 están libres... espera:
    // Si 15 (2,1) y 2 (0,2) están ocupados, desde 8 (1,1):
    //   - Ir a 7 (1,0) -> luego 0 (0,0) -> 1 (0,1) -> FIN (3 pasos).
    //   - Ir a 1 (0,1) -> 0 (0,0) -> 7 (1,0) -> 14 (2,0) -> FIN (4 pasos)!
    // Mientras J2 abajo tiene exactamente 3 pasos posibles (ej. en [46, 47, 48] con 40,41,39 ocupados).
    // ¡Con 3 pasos de J2, 3 pasos de J1 PIERDE (le toca a J1 después del 3er paso de J2) y 4 pasos GANA!
    const state: SnakesState = {
      caminos: {
        1: [27, 26, 25, 24, 23, 22, 21, 15, 16, 9, 8],
        2: [3, 10, 17, 2, 18, 19, 20, 39, 40, 41, 47],
      },
      currentPlayer: 1,
      status: 'playing',
      winner: null,
    };
    // Verifiquemos los libres de J1 desde 8 (1,1):
    // 15 (abajo) ocupado, 9 (der) ocupado. Libres: 1 (0,1) y 7 (1,0).
    // En la zona superior izquierda quedan libres: 0(0,0), 1(0,1), 7(1,0), 14(2,0) -> ¡4 celdas!
    // Además 11,12,13,4,5,6? No, 2, 9, 16, 23 están todos ocupados, cortando cols 0..1 de cols 3..6!
    // Así J1 solo tiene el subgrafo {0, 1, 7, 14} (un camino L de 4 celdas: 8 -> 1 -> 0 -> 7 -> 14)!
    // Si J1 juega 7: desde 7 solo puede ir a 0 -> 1 (y 14 queda aislado: máximo 3 pasos, o 7->14 se acaba en 1 paso)!
    // Si J1 juega 1: 1 -> 0 -> 7 -> 14 (4 pasos!).
    // Veamos J2 desde 47 (6,5): 40 (5,5) ocupado, 41 (5,6) ocupado -> libres: 46 (6,4) y 48 (6,6).
    // Añadamos ocupación de 46 para que J2 tenga camino lineal 47 -> 48 -> ... no hace falta, si 46 está libre,
    // J2 puede ir por 46->45->44->43->42 (muchos pasos) si no está bloqueado. Bloqueemos 46 y 48?
    // Si 46 ocupado y 48 libre, 41 ocupado, 34 libre... mejor bloqueemos 34 y 46 en camino de J2:
    const stateExacto: SnakesState = {
      caminos: {
        1: [27, 26, 25, 24, 23, 22, 21, 15, 16, 9, 8],
        2: [2, 3, 10, 17, 18, 19, 20, 39, 40, 41, 34, 46, 47],
      },
      currentPlayer: 1,
      status: 'playing',
      winner: null,
    };
    // Desde 47 (6,5): 40 ocupado, 46 ocupado -> único libre es 48 (6,6), y desde 48: 41 ocupado -> 0 salidas (J2 tiene solo 1 paso)!
    // Pongamos a J2 en 33 (4,5) con [32,39,40,41,34] ocupando alrededor para que tenga 3 pasos: 33->47 no,
    // 35, 36, 37, 38, 45, 44, 43, 42... mejor: J2 en 46 (6,4) con 45, 39, 40, 41, 34 ocupados:
    // libres de J2: 46 -> 47 -> 48 -> fin (2 pasos)!
    // Con J2 teniendo 3 pasos: J2 en 45 (6,3) -> 46 -> 47 -> 48 (3 pasos), bloqueando 38, 39, 40, 41:
    const stateParidad: SnakesState = {
      caminos: {
        1: [27, 26, 25, 24, 23, 22, 21, 15, 16, 9, 8],
        2: [2, 3, 10, 17, 18, 19, 20, 38, 39, 40, 41, 44, 45],
      },
      currentPlayer: 1,
      status: 'playing',
      winner: null,
    };
    // Desde 45 (6,3): 38 y 44 ocupados -> único libre 46 -> 47 -> 48 (exactamente 3 pasos: 46, 47, 48)!
    // J1 tiene 2 opciones desde 8: 7 (máx 3 pasos -> PIERDE porque J2 también tiene 3) vs 1 (4 pasos -> GANA!).
    expect(vecinosLibres(stateParidad, 1).sort((a, b) => a - b)).toEqual([1, 7]);
    expect(elegirMovimiento(stateParidad, 'dificil', crearRng(5))).toBe(1);
  });

  it('calibración: dificil > medio > facil (> 65% con partidas espejo) y azar gana a facil', () => {
    const rng = crearRng(2026);
    const N = 24; // 12 como J1 + 12 como J2 (partidas espejo)
    let dificilGana = 0;
    let medioGana = 0;

    for (let i = 0; i < N; i++) {
      const asP1 = i % 2 === 0;
      if (asP1) {
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
      const asP1 = i % 2 === 0;
      if (asP1) {
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
