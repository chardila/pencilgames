import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  getNeighbors,
  placeNumber,
  TOTAL_POSITIONS,
  type AgujeroNegroState,
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

function jugadaAzar(state: AgujeroNegroState, rng: () => number): number {
  const vacias: number[] = [];
  for (const c of state.cells) {
    if (c.value === null) vacias.push(c.id);
  }
  return vacias[Math.floor(rng() * vacias.length)];
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
): { ganador: 1 | 2 | null; state: AgujeroNegroState } {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = placeNumber(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  const ganador =
    state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
  return { ganador, state };
}

/** Construye un estado personalizado sin pasar por el orden secuencial del motor. */
function estadoPersonalizado(
  asignaciones: Array<{ id: number; player: 1 | 2; value: number }>,
  currentPlayer: 1 | 2,
  nextValue: Record<1 | 2, number>
): AgujeroNegroState {
  const state = createInitialState();
  const map = new Map(asignaciones.map(a => [a.id, a]));
  const cells = state.cells.map(c => {
    const a = map.get(c.id);
    return a ? { ...c, player: a.player, value: a.value } : c;
  });
  return {
    ...state,
    cells,
    currentPlayer,
    nextValue,
  };
}

describe('agujero-negro bot', () => {
  it('genera jugadas legales y progreso garantizado en menos de 30 ms en los 3 niveles', () => {
    const rng = crearRng(2026);
    let state = createInitialState();
    const tiemposDificil: number[] = [];

    while (state.status === 'playing') {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const elapsed = performance.now() - t0;
        expect(elapsed).toBeLessThan(30);
        if (dif === 'dificil') tiemposDificil.push(elapsed);
        expect(esJugadaValida(mov)).toBe(true);
        expect(state.cells[mov].value).toBeNull();
        expect(placeNumber(state, mov)).not.toBe(state);
      }
      state = placeNumber(state, elegirMovimiento(state, 'dificil', rng));
    }

    const promedioDificil =
      tiemposDificil.reduce((acc, t) => acc + t, 0) / tiemposDificil.length;
    expect(promedioDificil).toBeLessThan(15);
  });

  it('es 100% determinista con una misma semilla rng', () => {
    const state = placeNumber(placeNumber(createInitialState(), 4), 7);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(state, dif, crearRng(12345));
      const m2 = elegirMovimiento(state, dif, crearRng(12345));
      expect(m1).toBe(m2);
    }
  });

  it('medio y difícil eligen la jugada óptima cuando quedan 2 casillas vacías', () => {
    const rng = crearRng(77);
    // Dejamos vacías solo las casillas 0 (vecinos 1,2) y 20 (vecinos 14,19).
    // En 1,2 ponemos fichas altas de J1 (9 y 8). En 14,19 ponemos fichas bajas de J1 (1 y 2) y altas de J2 (9 y 8 en vecinos? 20 tiene vecinos 14 y 19).
    // Si J2 coloca su 10 en 0, 20 queda como agujero negro (destruye 14 y 19).
    // Si J2 coloca su 10 en 20, 0 queda como agujero negro (destruye 1 y 2 -> J1 pierde 17!).
    const asignaciones: Array<{ id: number; player: 1 | 2; value: number }> = [
      { id: 1, player: 1, value: 9 },
      { id: 2, player: 1, value: 8 },
      { id: 14, player: 2, value: 9 },
      { id: 19, player: 2, value: 8 },
    ];
    let p1Val = 1;
    let p2Val = 1;
    for (let id = 3; id < TOTAL_POSITIONS; id++) {
      if (id === 14 || id === 19 || id === 20) continue;
      if (p1Val <= 7) {
        asignaciones.push({ id, player: 1, value: p1Val++ });
      } else {
        asignaciones.push({ id, player: 2, value: p2Val++ });
      }
    }
    // J1 ya tiene 1..9 (solo falta 10? aquí 1..7 + 8,9 + ... ajustemos a 19 ocupadas).
    const ocupadas = new Set(asignaciones.map(a => a.id));
    expect(ocupadas.size).toBe(19);
    expect(ocupadas.has(0)).toBe(false);
    expect(ocupadas.has(20)).toBe(false);

    const state = estadoPersonalizado(asignaciones, 2, { 1: 11, 2: 10 });
    // J2 debe jugar en 20 para que 0 sea el agujero negro y destruya 9+8 de J1 (y salve 9+8 de J2 en 14,19).
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(state, dif, rng)).toBe(20);
    }
  });

  it('medio y difícil protegen números altos en casillas seguras y medio acerca números bajos a fichas altas rivales', () => {
    const rng = crearRng(99);
    // Escenario A: J1 va a colocar su 10. La esquina 0 tiene sus 2 vecinos (1, 2) ya ocupados (0 vecinos vacíos -> 100% segura),
    // mientras las demás vacías tienen múltiples vecinos vacíos.
    const stateSeguro = estadoPersonalizado(
      [
        { id: 1, player: 2, value: 2 },
        { id: 2, player: 2, value: 3 },
        { id: 3, player: 1, value: 1 },
        { id: 4, player: 1, value: 2 },
        { id: 5, player: 2, value: 1 },
      ],
      1,
      { 1: 10, 2: 9 }
    );
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(stateSeguro, dif, rng)).toBe(0);
    }

    // Escenario B: J2 va a colocar un número bajo (1) y J1 ya colocó un 9 en la casilla 7 (interior).
    // Medio debe colocar el 1 adyacente a la ficha alta del rival (vecinos de 7).
    const stateBajo = estadoPersonalizado(
      [
        { id: 7, player: 1, value: 9 },
        { id: 15, player: 1, value: 1 },
      ],
      2,
      { 1: 2, 2: 1 }
    );
    const movMedio = elegirMovimiento(stateBajo, 'medio', rng);
    expect(getNeighbors(7)).toContain(movMedio);
  });

  it('difícil resuelve exactamente con <= 8 vacías evitando trampas de 1 ply', () => {
    const rng = crearRng(314);
    // Quedan 3 casillas vacías: 0 (vecinos 1,2), 15 (vecinos 10,16), 20 (vecinos 14,19).
    // Turno de J1 con valor 10. Después J2 juega su 10 en una de las 2 restantes, dejando la última como agujero negro.
    // Vecinos de 0: 1(J2:9), 2(J2:8) -> si 0 es agujero, J2 pierde 17.
    // Vecinos de 15: 10(J1:9), 16(J1:8) -> si 15 es agujero, J1 pierde 17.
    // Vecinos de 20: 14(J1:7), 19(J1:6) -> si 20 es agujero, J1 pierde 13.
    // Si J1 juega en 0, J2 elegirá dejar 15 como agujero (-17 para J1).
    // Si J1 juega en 20, J2 elegirá dejar 15 como agujero (-17 para J1).
    // Si J1 juega en 15, entonces quedan 0 y 20: J2 deberá dejar 0 (-17 para J2) o 20 (-13 para J1)!
    // Además J2 prefiere dejar 20 (J1 pierde 13) antes que 0 (J2 pierde 17), así que J1 pierde 13 en vez de 17 -> 15 es la jugada exacta!
    const asignaciones: Array<{ id: number; player: 1 | 2; value: number }> = [
      { id: 1, player: 2, value: 9 },
      { id: 2, player: 2, value: 8 },
      { id: 10, player: 1, value: 9 },
      { id: 16, player: 1, value: 8 },
      { id: 14, player: 1, value: 7 },
      { id: 19, player: 1, value: 6 },
    ];
    let v1 = 1;
    let v2 = 1;
    for (let id = 0; id < TOTAL_POSITIONS; id++) {
      if ([0, 15, 20, 1, 2, 10, 16, 14, 19].includes(id)) continue;
      if (v1 <= 5) {
        asignaciones.push({ id, player: 1, value: v1++ });
      } else {
        asignaciones.push({ id, player: 2, value: v2++ });
      }
    }
    const state = estadoPersonalizado(asignaciones, 1, { 1: 10, 2: 10 });
    expect(elegirMovimiento(state, 'dificil', rng)).toBe(15);
  });

  it('difícil preserva más puntos en números altos (>= 7) frente a fácil', () => {
    const rng = crearRng(555);
    let sobrevivientesDificil = 0;
    let sobrevivientesFacil = 0;
    const pares = 12;

    for (let i = 0; i < pares; i++) {
      const p1 = simular('dificil', 'facil', rng).state;
      for (const c of p1.cells) {
        if (c.value !== null && c.value >= 7 && !p1.destroyedCells.includes(c.id)) {
          if (c.player === 1) sobrevivientesDificil += c.value;
          else sobrevivientesFacil += c.value;
        }
      }
      const p2 = simular('facil', 'dificil', rng).state;
      for (const c of p2.cells) {
        if (c.value !== null && c.value >= 7 && !p2.destroyedCells.includes(c.id)) {
          if (c.player === 2) sobrevivientesDificil += c.value;
          else sobrevivientesFacil += c.value;
        }
      }
    }

    expect(sobrevivientesDificil).toBeGreaterThan(sobrevivientesFacil);
  });

  it('calibración espejo: dificil > medio > facil (> 65%) y azar gana a facil', () => {
    const rng = crearRng(404);
    const PARES = 20; // 40 partidas por cruce (espejo J1/J2)

    let difWins = 0;
    let difDecisivas = 0;
    let medWins = 0;
    let medDecisivas = 0;

    for (let i = 0; i < PARES; i++) {
      // Espejo Difícil vs Medio
      const r1 = simular('dificil', 'medio', rng);
      if (r1.ganador !== null) {
        difDecisivas++;
        if (r1.ganador === 1) difWins++;
      }
      const r2 = simular('medio', 'dificil', rng);
      if (r2.ganador !== null) {
        difDecisivas++;
        if (r2.ganador === 2) difWins++;
      }

      // Espejo Medio vs Fácil
      const m1 = simular('medio', 'facil', rng);
      if (m1.ganador !== null) {
        medDecisivas++;
        if (m1.ganador === 1) medWins++;
      }
      const m2 = simular('facil', 'medio', rng);
      if (m2.ganador !== null) {
        medDecisivas++;
        if (m2.ganador === 2) medWins++;
      }
    }

    let azarWins = 0;
    const M = 40;
    for (let i = 0; i < M; i++) {
      const res = i % 2 === 0 ? simular('azar', 'facil', rng) : simular('facil', 'azar', rng);
      const azarJugador = i % 2 === 0 ? 1 : 2;
      if (res.ganador === azarJugador) azarWins++;
    }

    expect(difWins / difDecisivas).toBeGreaterThan(0.65);
    expect(medWins / medDecisivas).toBeGreaterThan(0.65);
    expect(azarWins).toBeGreaterThan(M * 0.2);
  });
});
