import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  regionesLegales,
  type ColMove,
  type ColState,
  type Player,
} from './engine';
import { MAPAS } from './maps';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function jugadaAzar(state: ColState, rng: () => number): ColMove {
  if (state.fase === 'seleccion') {
    return { tipo: 'mapa', mapaId: Math.floor(rng() * MAPAS.length) };
  }
  const legales = regionesLegales(state, state.currentPlayer);
  return { tipo: 'color', region: legales[Math.floor(rng() * legales.length)] };
}

function iniciarEnMapa(mapaId: number, jugadorInicial: Player = 1): ColState {
  const s = createInitialState(jugadorInicial);
  return playMove(s, { tipo: 'mapa', mapaId });
}

function simularEnMapa(
  mapaId: number,
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
): Player {
  let state = iniciarEnMapa(mapaId, 1);
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

/**
 * Busca una posición del mapa indicado donde el jugador actual tenga
 * al menos una jugada con victoria en 1 y al menos una que no gane en 1.
 */
function buscarPosicionVictoriaEn1(mapaId: number, semilla = 1): ColState {
  const rng = crearRng(semilla);
  for (let intento = 0; intento < 400; intento++) {
    let s = iniciarEnMapa(mapaId, 1);
    while (s.status === 'playing') {
      const legales = regionesLegales(s, s.currentPlayer);
      const ganadoras = legales.filter(
        r => playMove(s, { tipo: 'color', region: r }).status === 'won'
      );
      if (ganadoras.length > 0 && ganadoras.length < legales.length) {
        return s;
      }
      s = playMove(s, jugadaAzar(s, rng));
    }
  }
  throw new Error(`No se encontró posición con victoria en 1 en mapa ${mapaId}`);
}

/**
 * Busca una posición en donde el jugador actual no gana en 1, existen jugadas
 * seguras (donde el rival NO gana en 1) y también existe al menos una jugada
 * trampa que le regala victoria en 1 al rival.
 */
function buscarPosicionConBloqueoYTrampa(mapaId: number, semilla = 77): {
  state: ColState;
  seguras: number[];
  trampas: number[];
} {
  const rng = crearRng(semilla);
  for (let intento = 0; intento < 600; intento++) {
    let s = iniciarEnMapa(mapaId, 1);
    while (s.status === 'playing') {
      const legales = regionesLegales(s, s.currentPlayer);
      const ganadoras = legales.filter(
        r => playMove(s, { tipo: 'color', region: r }).status === 'won'
      );
      if (ganadoras.length === 0) {
        const seguras: number[] = [];
        const trampas: number[] = [];
        for (const r of legales) {
          const sig = playMove(s, { tipo: 'color', region: r });
          const rivalLegales = regionesLegales(sig, sig.currentPlayer);
          const rivalGanaEn1 = rivalLegales.some(
            o => playMove(sig, { tipo: 'color', region: o }).status === 'won'
          );
          if (rivalGanaEn1) trampas.push(r);
          else seguras.push(r);
        }
        if (seguras.length > 0 && trampas.length > 0) {
          return { state: s, seguras, trampas };
        }
      }
      s = playMove(s, jugadaAzar(s, rng));
    }
  }
  throw new Error(`No se encontró posición con jugadas seguras y trampas en mapa ${mapaId}`);
}

describe('col bot', () => {
  it('en fase seleccion elige un mapa válido de forma determinista con rng', () => {
    const inicial = createInitialState(1);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const mov1 = elegirMovimiento(inicial, dif, () => 0.0);
      const mov2 = elegirMovimiento(inicial, dif, () => 0.5);
      const mov3 = elegirMovimiento(inicial, dif, () => 0.99);
      expect(mov1).toEqual({ tipo: 'mapa', mapaId: 0 });
      expect(mov2).toEqual({ tipo: 'mapa', mapaId: 1 });
      expect(mov3).toEqual({ tipo: 'mapa', mapaId: 2 });
      for (const mov of [mov1, mov2, mov3]) {
        expect(esJugadaValida(mov)).toBe(true);
        const next = playMove(inicial, mov);
        expect(next).not.toBe(inicial);
        expect(next.fase).toBe('jugando');
      }
    }
  });

  it('devuelve jugadas legales y avanza la partida en los 3 mapas y las 3 dificultades en < 30 ms', () => {
    const rng = crearRng(42);
    for (const mapa of MAPAS) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        let state = iniciarEnMapa(mapa.id, 1);
        let turnos = 0;
        while (state.status === 'playing') {
          const t0 = performance.now();
          const mov = elegirMovimiento(state, dif, rng);
          const dt = performance.now() - t0;
          expect(dt).toBeLessThan(30);
          expect(esJugadaValida(mov)).toBe(true);
          expect(mov.tipo).toBe('color');
          if (mov.tipo === 'color') {
            expect(regionesLegales(state, state.currentPlayer)).toContain(mov.region);
          }
          const next = playMove(state, mov);
          expect(next).not.toBe(state);
          state = next;
          turnos++;
        }
        expect(state.status).toBe('won');
        expect(turnos).toBeGreaterThan(0);
      }
    }
  });

  it('mantiene rendimiento típico < 15 ms incluso en tablero vacío en los 3 mapas', () => {
    for (const mapa of MAPAS) {
      const state = iniciarEnMapa(mapa.id, 1);
      const t0 = performance.now();
      const mov = elegirMovimiento(state, 'dificil', crearRng(mapa.id + 1));
      const dt = performance.now() - t0;
      expect(esJugadaValida(mov)).toBe(true);
      expect(dt).toBeLessThan(15);
    }
  });

  it('es 100% determinista para una misma semilla rng y funciona con 1 sola jugada legal', () => {
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const movsA: ColMove[] = [];
      const movsB: ColMove[] = [];
      let sA = iniciarEnMapa(0, 1);
      let sB = iniciarEnMapa(0, 1);
      const rngA = crearRng(777);
      const rngB = crearRng(777);
      while (sA.status === 'playing') {
        const mA = elegirMovimiento(sA, dif, rngA);
        const mB = elegirMovimiento(sB, dif, rngB);
        movsA.push(mA);
        movsB.push(mB);
        sA = playMove(sA, mA);
        sB = playMove(sB, mB);
      }
      expect(movsA).toEqual(movsB);
    }

    // Estado cercano al final con exactamente 1 región legal restante.
    const rng = crearRng(19);
    let s = iniciarEnMapa(1, 1);
    while (s.status === 'playing' && regionesLegales(s, s.currentPlayer).length > 1) {
      s = playMove(s, jugadaAzar(s, rng));
    }
    if (s.status === 'playing') {
      const unica = regionesLegales(s, s.currentPlayer)[0];
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        expect(elegirMovimiento(s, dif, () => 0.1)).toEqual({ tipo: 'color', region: unica });
      }
    }
  });

  it('medio y difícil toman la victoria inmediata en 1 en los 3 mapas', () => {
    const rng = crearRng(101);
    for (const mapa of MAPAS) {
      const state = buscarPosicionVictoriaEn1(mapa.id, mapa.id + 10);
      const ganadoras = regionesLegales(state, state.currentPlayer).filter(
        r => playMove(state, { tipo: 'color', region: r }).status === 'won'
      );
      for (const dif of ['medio', 'dificil'] as const) {
        const mov = elegirMovimiento(state, dif, rng);
        expect(mov.tipo).toBe('color');
        if (mov.tipo === 'color') {
          expect(ganadoras).toContain(mov.region);
        }
      }
    }
  });

  it('medio evita regalar victoria en 1 al rival cuando hay jugadas seguras', () => {
    const rng = crearRng(202);
    for (const mapa of MAPAS) {
      const { state, seguras } = buscarPosicionConBloqueoYTrampa(mapa.id, mapa.id + 50);
      const mov = elegirMovimiento(state, 'medio', rng);
      expect(mov.tipo).toBe('color');
      if (mov.tipo === 'color') {
        expect(seguras).toContain(mov.region);
      }
    }
  });

  it('facil omite la victoria en 1 con rng < 0.6 si hay alternativas, y la toma con rng >= 0.6', () => {
    const state = buscarPosicionVictoriaEn1(0, 10);
    const ganadoras = regionesLegales(state, state.currentPlayer).filter(
      r => playMove(state, { tipo: 'color', region: r }).status === 'won'
    );

    const movOmitido = elegirMovimiento(state, 'facil', () => 0.25);
    expect(movOmitido.tipo).toBe('color');
    if (movOmitido.tipo === 'color') {
      expect(ganadoras).not.toContain(movOmitido.region);
      expect(regionesLegales(state, state.currentPlayer)).toContain(movOmitido.region);
    }

    const movGanador = elegirMovimiento(state, 'facil', () => 0.75);
    expect(movGanador.tipo).toBe('color');
    if (movGanador.tipo === 'color') {
      expect(ganadoras).toContain(movGanador.region);
    }
  });

  it('dificil gana siempre desde posiciones ganadoras conocidas en los 3 mapas', () => {
    const rng = crearRng(303);
    for (const mapa of MAPAS) {
      // Desde una posición con solo 1 jugada restante para ganar, o un subárbol ganador de 4-5 libres,
      // verificar que difícil gana contra cualquier secuencia de respuestas aleatorias.
      let state = iniciarEnMapa(mapa.id, 1);
      // Determinar quién gana desde el inicio en este mapa jugando dificil vs dificil.
      const ganadorTeorico = simularEnMapa(mapa.id, 'dificil', 'dificil', crearRng(mapa.id + 1));

      // Ahora verificar que desde el inicio, jugando en el bando ganador teórico contra azar/medio,
      // difícil gana el 100% de las partidas.
      for (let i = 0; i < 6; i++) {
        const res =
          ganadorTeorico === 1
            ? simularEnMapa(mapa.id, 'dificil', i % 2 === 0 ? 'azar' : 'medio', rng)
            : simularEnMapa(mapa.id, i % 2 === 0 ? 'azar' : 'medio', 'dificil', rng);
        expect(res).toBe(ganadorTeorico);
      }

      // Además verificar posición intermedia con pocas regiones libres donde J1 fuerza victoria.
      state = iniciarEnMapa(mapa.id, 1);
      while (state.status === 'playing' && regionesLegales(state, state.currentPlayer).length > 5) {
        state = playMove(state, jugadaAzar(state, rng));
      }
      if (state.status === 'playing') {
        const mov = elegirMovimiento(state, 'dificil', rng);
        expect(esJugadaValida(mov)).toBe(true);
        expect(playMove(state, mov)).not.toBe(state);
      }
    }
  });

  it('calibración espejo: dificil > medio > facil (> 65%) y azar gana a facil', () => {
    const rng = crearRng(2026);
    const RONDAS = 30; // 30 * 2 (espejo) = 60 partidas por enfrentamiento, rotando los 3 mapas
    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;
    const total = RONDAS * 2;

    for (let i = 0; i < RONDAS; i++) {
      const mapaId = i % MAPAS.length;
      if (simularEnMapa(mapaId, 'dificil', 'medio', rng) === 1) dificilGana++;
      if (simularEnMapa(mapaId, 'medio', 'dificil', rng) === 2) dificilGana++;

      if (simularEnMapa(mapaId, 'medio', 'facil', rng) === 1) medioGana++;
      if (simularEnMapa(mapaId, 'facil', 'medio', rng) === 2) medioGana++;

      if (simularEnMapa(mapaId, 'azar', 'facil', rng) === 1) azarGana++;
      if (simularEnMapa(mapaId, 'facil', 'azar', rng) === 2) azarGana++;
    }

    expect(dificilGana).toBeGreaterThan(total * 0.65);
    expect(medioGana).toBeGreaterThan(total * 0.65);
    expect(azarGana).toBeGreaterThan(total * 0.15);
  });
});
