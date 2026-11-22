import { describe, expect, it } from 'vitest';
import {
  CELDAS,
  celdasElegibles,
  createInitialState,
  esJugadaValida,
  playMove,
  type Move,
  type WildCatsState,
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

function jugadaAzar(state: WildCatsState, rng: () => number): Move {
  const elegibles = celdasElegibles(state);
  return { celda: elegibles[Math.floor(rng() * elegibles.length)] };
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number,
) {
  let state = createInitialState();
  while (state.fase === 'jugando') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

describe('wild-cats bot', () => {
  it('genera jugadas legales y avanza el estado en fases iniciales, intermedias, con veto y finales en < 30 ms', () => {
    const rng = crearRng(42);
    let state = createInitialState();

    // Estado inicial (J1) y respuesta (J2), avanzando una partida completa.
    for (let paso = 0; paso < 30 && state.fase === 'jugando'; paso++) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, crearRng(100 + paso));
        const duracion = performance.now() - t0;
        expect(duracion).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(celdasElegibles(state)).toContain(mov.celda);
        expect(playMove(state, mov)).not.toBe(state);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }

    // Caso límite: todas las celdas ocupadas menos 2, y una de ellas vetada.
    const casiLleno = createInitialState();
    for (let i = 0; i < CELDAS - 2; i++) {
      casiLleno.tablero[i] = i % 2 === 0 ? 1 : 2;
    }
    casiLleno.vetada = CELDAS - 2;
    casiLleno.currentPlayer = 1;
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const mov = elegirMovimiento(casiLleno, dif, crearRng(7));
      expect(mov).toEqual({ celda: CELDAS - 1 });
      expect(playMove(casiLleno, mov)).not.toBe(casiLleno);
    }

    // Caso límite extremo: solo queda 1 vacía y está vetada -> celdasElegibles la devuelve.
    const soloVetada = createInitialState();
    for (let i = 0; i < CELDAS - 1; i++) {
      soloVetada.tablero[i] = i % 2 === 0 ? 1 : 2;
    }
    soloVetada.vetada = CELDAS - 1;
    soloVetada.currentPlayer = 1;
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const mov = elegirMovimiento(soloVetada, dif, crearRng(9));
      expect(mov).toEqual({ celda: CELDAS - 1 });
    }
  });

  it('anti-trampa estricta: como J2 con misma semilla rng, mutar state.eleccionJ1 y ultimaRevelacion produce exactamente la misma jugada', () => {
    const base = createInitialState();
    base.tablero[6] = 1;
    base.tablero[7] = 1;
    base.tablero[12] = 2;
    base.tablero[18] = 2;
    base.vetada = 11;
    base.ronda = 4;
    base.currentPlayer = 2;

    const eleccionesPrueba = [null, 0, 5, 8, 13, 17, 24];

    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const esperado = elegirMovimiento(
        { ...base, eleccionJ1: 0, ultimaRevelacion: null },
        dif,
        crearRng(777),
      );
      for (const eleccion of eleccionesPrueba) {
        const mutado: WildCatsState = {
          ...base,
          tablero: base.tablero.slice(),
          eleccionJ1: eleccion,
          ultimaRevelacion:
            eleccion === null
              ? null
              : { elecciones: { 1: eleccion, 2: 24 }, choque: eleccion === 24 },
        };
        const obtenido = elegirMovimiento(mutado, dif, crearRng(777));
        expect(obtenido).toEqual(esperado);
      }
    }
  });

  it('medio y dificil completan 4 en línea inmediata y dificil choca/bloquea 3 en línea rival', () => {
    // J1 tiene 3 en línea en fila 0: 0, 1, 2 -> gana en 3.
    const sGanar = createInitialState();
    sGanar.tablero[0] = 1;
    sGanar.tablero[1] = 1;
    sGanar.tablero[2] = 1;
    sGanar.tablero[20] = 2;
    sGanar.tablero[21] = 2;
    sGanar.currentPlayer = 1;
    sGanar.ronda = 4;

    expect(elegirMovimiento(sGanar, 'medio', crearRng(5))).toEqual({ celda: 3 });
    expect(elegirMovimiento(sGanar, 'dificil', () => 0)).toEqual({ celda: 3 });
    expect(elegirMovimiento(sGanar, 'dificil', () => 0.9999)).toEqual({ celda: 3 });

    // J2 frente a J1 con 3 en línea en 0, 1, 2 -> dificil bloquea/choca en 3 y medio la prioriza en su top.
    const sBloquear: WildCatsState = {
      ...sGanar,
      currentPlayer: 2,
      eleccionJ1: 15,
    };
    expect(elegirMovimiento(sBloquear, 'medio', () => 0)).toEqual({ celda: 3 });
    expect(elegirMovimiento(sBloquear, 'dificil', () => 0)).toEqual({ celda: 3 });
    expect(elegirMovimiento(sBloquear, 'dificil', () => 0.9999)).toEqual({ celda: 3 });
  });

  it('facil omite una línea de 4 inmediata cuando rng >= 0.35 y la toma cuando rng < 0.35', () => {
    const sGanar = createInitialState();
    sGanar.tablero[0] = 1;
    sGanar.tablero[1] = 1;
    sGanar.tablero[2] = 1;
    sGanar.tablero[20] = 2;
    sGanar.tablero[21] = 2;
    sGanar.currentPlayer = 1;

    const omitido = elegirMovimiento(sGanar, 'facil', () => 0.5);
    expect(esJugadaValida(omitido)).toBe(true);
    expect(celdasElegibles(sGanar)).toContain(omitido.celda);
    expect(omitido.celda).not.toBe(3);

    const tomado = elegirMovimiento(sGanar, 'facil', () => 0.1);
    expect(tomado).toEqual({ celda: 3 });
  });

  it('calibración determinista: dificil > medio > facil (> 65%) y azar gana a facil', () => {
    const rng = crearRng(20261122);
    const PARES = 30;
    const PARES_AZAR = 40;

    let dificilGana = 0;
    let medioGana = 0;
    for (let i = 0; i < PARES; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'dificil', rng) === 2) dificilGana++;
      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('facil', 'medio', rng) === 2) medioGana++;
    }

    let azarGana = 0;
    for (let i = 0; i < PARES_AZAR; i++) {
      if (simular('azar', 'facil', rng) === 1) azarGana++;
      if (simular('facil', 'azar', rng) === 2) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(medioGana).toBeGreaterThan(PARES * 2 * 0.65);
    expect(azarGana).toBeGreaterThan(PARES_AZAR * 2 * 0.15);
  });
});
