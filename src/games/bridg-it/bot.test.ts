import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  puedeJugar,
  type BridgItState,
  type Edge,
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

function jugadasLegales(state: BridgItState): Edge[] {
  const legales: Edge[] = [];
  if (state.currentPlayer === 1) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        const edge: Edge = { type: 'h', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const edge: Edge = { type: 'v', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
  } else {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const edge: Edge = { type: 'h', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        const edge: Edge = { type: 'v', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
  }
  return legales;
}

function jugadaAzar(state: BridgItState, rng: () => number): Edge {
  const legales = jugadasLegales(state);
  return legales[Math.floor(rng() * legales.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
) {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    expect(puedeJugar(state, mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('bridg-it bot', () => {
  it('genera jugadas legales, deterministas y en < 30 ms por turno (< 15 ms típico) en estados iniciales, intermedios y finales', () => {
    const rng = crearRng(12);
    let state = createInitialState();
    let totalMs = 0;
    let mediciones = 0;

    // Estado inicial y partida completa alternando difícil vs medio para recorrer inicio, medio y final.
    while (state.status === 'playing') {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const r1 = crearRng(77 + mediciones);
        const r2 = crearRng(77 + mediciones);
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, r1);
        const dt = performance.now() - t0;
        totalMs += dt;
        mediciones++;

        expect(dt).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(puedeJugar(state, mov)).toBe(true);
        expect(playMove(state, mov)).not.toBe(state);
        expect(elegirMovimiento(state, dif, r2)).toEqual(mov);
      }
      const difTurno = state.currentPlayer === 1 ? 'dificil' : 'medio';
      state = playMove(state, elegirMovimiento(state, difTurno, rng));
    }

    expect(totalMs / mediciones).toBeLessThan(15);
  });

  it('medio y difícil toman victoria inmediata en 1 tanto como J1 como J2', () => {
    const rng = crearRng(5);

    // J1 a un paso: redV(0..3, 2) trazadas, falta redV(4, 2).
    let sP1Gana = createInitialState();
    for (const [m1, m2] of [
      [{ type: 'v', row: 0, col: 2 } as Edge, { type: 'h', row: 0, col: 0 } as Edge],
      [{ type: 'v', row: 1, col: 2 } as Edge, { type: 'h', row: 1, col: 0 } as Edge],
      [{ type: 'v', row: 2, col: 2 } as Edge, { type: 'h', row: 2, col: 0 } as Edge],
      [{ type: 'v', row: 3, col: 2 } as Edge, { type: 'h', row: 3, col: 0 } as Edge],
    ]) {
      sP1Gana = playMove(sP1Gana, m1);
      sP1Gana = playMove(sP1Gana, m2);
    }
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sP1Gana, dif, rng)).toEqual({ type: 'v', row: 4, col: 2 });
    }

    // J2 a un paso: blueH(2, 0..3) trazadas, falta blueH(2, 4).
    let sP2Gana = createInitialState();
    for (const [m1, m2] of [
      [{ type: 'v', row: 0, col: 0 } as Edge, { type: 'h', row: 2, col: 0 } as Edge],
      [{ type: 'v', row: 0, col: 1 } as Edge, { type: 'h', row: 2, col: 1 } as Edge],
      [{ type: 'v', row: 0, col: 2 } as Edge, { type: 'h', row: 2, col: 2 } as Edge],
      [{ type: 'v', row: 0, col: 3 } as Edge, { type: 'h', row: 2, col: 3 } as Edge],
    ]) {
      sP2Gana = playMove(sP2Gana, m1);
      sP2Gana = playMove(sP2Gana, m2);
    }
    sP2Gana = playMove(sP2Gana, { type: 'v', row: 0, col: 4 }); // turno pasa a J2
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sP2Gana, dif, rng)).toEqual({ type: 'h', row: 2, col: 4 });
    }
  });

  it('medio y difícil bloquean amenaza rival en 1 tanto como J2 como J1 (cruzamientos V/H y H/V)', () => {
    const rng = crearRng(9);

    // J1 amenaza ganar con redV(4, 1) -> J2 debe bloquear con blueH(4, 1).
    let sBloqueaP2 = createInitialState();
    for (const [m1, m2] of [
      [{ type: 'v', row: 0, col: 1 } as Edge, { type: 'h', row: 0, col: 4 } as Edge],
      [{ type: 'v', row: 1, col: 1 } as Edge, { type: 'h', row: 1, col: 4 } as Edge],
      [{ type: 'v', row: 2, col: 1 } as Edge, { type: 'h', row: 2, col: 4 } as Edge],
    ]) {
      sBloqueaP2 = playMove(sBloqueaP2, m1);
      sBloqueaP2 = playMove(sBloqueaP2, m2);
    }
    sBloqueaP2 = playMove(sBloqueaP2, { type: 'v', row: 3, col: 1 }); // J1 queda a 1 jugada: redV(4,1)
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sBloqueaP2, dif, rng)).toEqual({ type: 'h', row: 4, col: 1 });
    }

    // J1 amenaza ganar con redH(4, 1) (cruzando blueV(3, 2)) -> J2 debe bloquear con blueV(3, 2).
    let sBloqueaCruzado = createInitialState();
    for (const [m1, m2] of [
      [{ type: 'v', row: 0, col: 1 } as Edge, { type: 'h', row: 0, col: 4 } as Edge],
      [{ type: 'v', row: 1, col: 1 } as Edge, { type: 'h', row: 1, col: 4 } as Edge],
      [{ type: 'v', row: 2, col: 1 } as Edge, { type: 'h', row: 2, col: 4 } as Edge],
      [{ type: 'v', row: 3, col: 1 } as Edge, { type: 'h', row: 3, col: 4 } as Edge],
    ]) {
      sBloqueaCruzado = playMove(sBloqueaCruzado, m1);
      sBloqueaCruzado = playMove(sBloqueaCruzado, m2);
    }
    // Bloqueamos el salto directo redV(4, 1) por estado y dejamos redV(4, 2) hecha para que redH(4,1) gane en 1
    sBloqueaCruzado.redV[4][2] = true;
    sBloqueaCruzado.blueH[4][1] = true;
    for (const dif of ['medio', 'dificil'] as const) {
      // Ahora es turno de J1? No, tras el loop es turno de J1; jugamos una arista inocua de J1 y pasamos turno a J2.
      const turnoP2 = playMove(sBloqueaCruzado, { type: 'h', row: 0, col: 0 });
      expect(turnoP2.currentPlayer).toBe(2);
      expect(elegirMovimiento(turnoP2, dif, rng)).toEqual({ type: 'v', row: 3, col: 2 });
    }

    // J2 amenaza ganar con blueH(1, 4) -> J1 debe bloquear con redV(1, 4).
    let sBloqueaP1 = createInitialState();
    for (const [m1, m2] of [
      [{ type: 'v', row: 0, col: 0 } as Edge, { type: 'h', row: 1, col: 0 } as Edge],
      [{ type: 'v', row: 0, col: 1 } as Edge, { type: 'h', row: 1, col: 1 } as Edge],
      [{ type: 'v', row: 0, col: 2 } as Edge, { type: 'h', row: 1, col: 2 } as Edge],
      [{ type: 'v', row: 0, col: 3 } as Edge, { type: 'h', row: 1, col: 3 } as Edge],
    ]) {
      sBloqueaP1 = playMove(sBloqueaP1, m1);
      sBloqueaP1 = playMove(sBloqueaP1, m2);
    }
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sBloqueaP1, dif, rng)).toEqual({ type: 'v', row: 1, col: 4 });
    }
  });

  it('facil omite una victoria inmediata con probabilidad 0.6 si hay otras aristas legales', () => {
    let sP1Gana = createInitialState();
    for (const [m1, m2] of [
      [{ type: 'v', row: 0, col: 2 } as Edge, { type: 'h', row: 0, col: 0 } as Edge],
      [{ type: 'v', row: 1, col: 2 } as Edge, { type: 'h', row: 1, col: 0 } as Edge],
      [{ type: 'v', row: 2, col: 2 } as Edge, { type: 'h', row: 2, col: 0 } as Edge],
      [{ type: 'v', row: 3, col: 2 } as Edge, { type: 'h', row: 3, col: 0 } as Edge],
    ]) {
      sP1Gana = playMove(sP1Gana, m1);
      sP1Gana = playMove(sP1Gana, m2);
    }

    const movOmitido = elegirMovimiento(sP1Gana, 'facil', () => 0.3);
    expect(esJugadaValida(movOmitido)).toBe(true);
    expect(puedeJugar(sP1Gana, movOmitido)).toBe(true);
    expect(movOmitido).not.toEqual({ type: 'v', row: 4, col: 2 });
    expect(playMove(sP1Gana, movOmitido).status).toBe('playing');

    const movGanador = elegirMovimiento(sP1Gana, 'facil', () => 0.8);
    expect(movGanador).toEqual({ type: 'v', row: 4, col: 2 });
    expect(playMove(sP1Gana, movGanador).status).toBe('won');
  });

  it('medio acorta su camino mediante distancia 0-1 BFS', () => {
    // J1 ya tiene redV(0,2), redV(1,2), redV(2,2) -> distancia 0-1 BFS es 2; solo redV(3,2) o redV(4,2) la bajan a 1.
    let state = createInitialState();
    state = playMove(state, { type: 'v', row: 0, col: 2 });
    state = playMove(state, { type: 'h', row: 0, col: 0 });
    state = playMove(state, { type: 'v', row: 1, col: 2 });
    state = playMove(state, { type: 'h', row: 4, col: 0 });
    state = playMove(state, { type: 'v', row: 2, col: 2 });
    state = playMove(state, { type: 'h', row: 4, col: 4 });

    const mov = elegirMovimiento(state, 'medio', crearRng(3));
    expect([
      { type: 'v', row: 3, col: 2 },
      { type: 'v', row: 4, col: 2 },
    ]).toContainEqual(mov);
  });

  it('dificil como J1 gana el 100% de las partidas frente a dificil, medio y azar (estrategia exacta)', () => {
    const rng = crearRng(2026);
    for (let i = 0; i < 15; i++) {
      const rival = i < 5 ? 'dificil' : i < 10 ? 'medio' : 'azar';
      expect(simular('dificil', rival, rng)).toBe(1);
    }
  });

  it('dificil como J1 fuera de árbol (estado sintético desviado) recurre a alfa-beta y devuelve jugada válida en < 30 ms', () => {
    // Creamos un estado donde Blue bloqueó la mayor parte del tablero (sin 2 árboles disjuntos), dejando un puente único para J1.
    const state = createInitialState();
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (c !== 2) state.blueH[r][c] = true;
      }
    }
    // Además bloqueamos blueV en fila 0 para romper pares de árboles en filas superiores, dejando un camino en col 2
    state.blueV[0][1] = true;
    state.blueV[0][2] = true;
    state.blueV[0][3] = true;
    state.blueV[0][4] = true;
    state.redV[0][2] = true;
    state.redV[1][2] = true;
    state.currentPlayer = 1;

    const t0 = performance.now();
    const mov = elegirMovimiento(state, 'dificil', crearRng(11));
    expect(performance.now() - t0).toBeLessThan(30);
    expect(esJugadaValida(mov)).toBe(true);
    expect(puedeJugar(state, mov)).toBe(true);
    expect([
      { type: 'v', row: 2, col: 2 },
      { type: 'v', row: 3, col: 2 },
      { type: 'v', row: 4, col: 2 },
    ]).toContainEqual(mov);
  });

  it('calibración espejo: dificil > medio > facil (> 65%) y jugador aleatorio gana a facil', () => {
    const rng = crearRng(909);
    const PARES = 10; // 20 partidas espejo por duelo
    const PARES_AZAR = 20; // 40 partidas espejo azar vs facil

    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;

    for (let i = 0; i < PARES * 2; i++) {
      const aEsJ1 = i % 2 === 0;
      const g1 = aEsJ1 ? simular('dificil', 'medio', rng) : simular('medio', 'dificil', rng);
      if ((aEsJ1 && g1 === 1) || (!aEsJ1 && g1 === 2)) dificilGana++;

      const g2 = aEsJ1 ? simular('medio', 'facil', rng) : simular('facil', 'medio', rng);
      if ((aEsJ1 && g2 === 1) || (!aEsJ1 && g2 === 2)) medioGana++;
    }

    for (let i = 0; i < PARES_AZAR * 2; i++) {
      const azarEsJ1 = i % 2 === 0;
      const g = azarEsJ1 ? simular('azar', 'facil', rng) : simular('facil', 'azar', rng);
      if ((azarEsJ1 && g === 1) || (!azarEsJ1 && g === 2)) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(medioGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(azarGana).toBeGreaterThan(PARES_AZAR * 2 * 0.1);
  });
});
