import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  getNeighbors,
  placeNumber,
  TOTAL_POSITIONS,
  esJugadaValida,
  type AgujeroNegroState,
} from './engine';

describe('agujero negro — getNeighbors', () => {
  it('una esquina tiene exactamente 2 vecinos', () => {
    expect(getNeighbors(0)).toHaveLength(2); // vértice superior
    expect(getNeighbors(15)).toHaveLength(2); // vértice inferior izquierdo
    expect(getNeighbors(20)).toHaveLength(2); // vértice inferior derecho
  });

  it('una posición de borde (no esquina) tiene más de 2 y menos de 6 vecinos', () => {
    const vecinos = getNeighbors(1);
    expect(vecinos.length).toBeGreaterThan(2);
    expect(vecinos.length).toBeLessThan(6);
  });

  it('una posición interior tiene hasta 6 vecinos', () => {
    expect(getNeighbors(7)).toHaveLength(6);
  });

  it('la relación de vecindad es simétrica', () => {
    for (let id = 0; id < 21; id++) {
      for (const vecino of getNeighbors(id)) {
        expect(getNeighbors(vecino)).toContain(id);
      }
    }
  });
});

describe('agujero negro — partida', () => {
  it('empieza con 21 celdas vacías y le toca al jugador 1 con el número 1', () => {
    const state = createInitialState();
    expect(state.cells).toHaveLength(21);
    expect(state.cells.every(c => c.value === null)).toBe(true);
    expect(state.currentPlayer).toBe(1);
    expect(state.nextValue).toEqual({ 1: 1, 2: 1 });
    expect(state.status).toBe('playing');
  });

  it('colocar un número avanza el siguiente valor del jugador y pasa el turno', () => {
    const state = createInitialState();
    const next = placeNumber(state, 5);
    const celda = next.cells.find(c => c.id === 5)!;
    expect(celda.value).toBe(1);
    expect(celda.player).toBe(1);
    expect(next.currentPlayer).toBe(2);
    expect(next.nextValue[1]).toBe(2);
  });

  it('ignora colocar sobre una posición ya ocupada', () => {
    const state = placeNumber(createInitialState(), 0);
    const next = placeNumber(state, 0);
    expect(next).toEqual(state);
  });

  it('termina la partida exactamente después de colocar el segundo 10, con 20 celdas ocupadas y 1 vacía', () => {
    let state: AgujeroNegroState = createInitialState();
    // Alternamos 1,2,3,...,1,2,3,... en las posiciones 0..19, dejando la 20 vacía.
    for (let posicion = 0; posicion < 20; posicion++) {
      state = placeNumber(state, posicion);
    }

    expect(state.status).toBe('finished');
    expect(state.cells.filter(c => c.value !== null)).toHaveLength(20);
    expect(state.cells.filter(c => c.value === null)).toHaveLength(1);
    expect(state.blackHole).toBe(20);
    expect(state.destroyedCells).toEqual(getNeighbors(20));
  });

  it('la puntuación final solo cuenta los números sobrevivientes y ambas sumas son consistentes', () => {
    let state: AgujeroNegroState = createInitialState();
    for (let posicion = 0; posicion < 20; posicion++) {
      state = placeNumber(state, posicion);
    }

    const sobrevivientes = state.cells.filter(
      c => c.value !== null && !state.destroyedCells.includes(c.id)
    );
    const sumaEsperada = { 1: 0, 2: 0 } as Record<1 | 2, number>;
    for (const c of sobrevivientes) {
      sumaEsperada[c.player as 1 | 2] += c.value as number;
    }

    expect(state.scores).toEqual(sumaEsperada);
  });

  it('un agujero negro interior destruye 6 celdas y las puntuaciones se calculan a mano', () => {
    // Dejamos vacía la posición 7 (fila 3, columna 1): interior, 6 vecinos.
    const orden = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    expect(orden).toHaveLength(20);
    expect(orden).not.toContain(7);

    let state: AgujeroNegroState = createInitialState();
    for (const posicion of orden) {
      state = placeNumber(state, posicion);
    }

    expect(state.status).toBe('finished');
    expect(state.blackHole).toBe(7);

    // Vecinos de 7 calculados a mano sobre el triángulo:
    //   misma fila: 6 y 8 · fila de arriba: 3 y 4 · fila de abajo: 11 y 12
    expect([...state.destroyedCells].sort((a, b) => a - b)).toEqual([3, 4, 6, 8, 11, 12]);

    // Reparto a mano: la jugada k (0-indexada) la hace el jugador (k par -> 1,
    // k impar -> 2) con el valor floor(k/2) + 1.
    //   id 3  -> k=3  -> J2, valor 2
    //   id 4  -> k=4  -> J1, valor 3
    //   id 6  -> k=6  -> J1, valor 4
    //   id 8  -> k=7  -> J2, valor 4
    //   id 11 -> k=10 -> J1, valor 6
    //   id 12 -> k=11 -> J2, valor 6
    // Cada jugador colocó 1..10 = 55 puntos en total.
    //   J1 pierde 3 + 4 + 6 = 13  -> 55 - 13 = 42
    //   J2 pierde 2 + 4 + 6 = 12  -> 55 - 12 = 43
    expect(state.scores).toEqual({ 1: 42, 2: 43 });
  });

  it('no permite jugar después de terminada la partida', () => {
    let state: AgujeroNegroState = createInitialState();
    for (let posicion = 0; posicion < 20; posicion++) {
      state = placeNumber(state, posicion);
    }
    const next = placeNumber(state, 20);
    expect(next).toEqual(state);
  });
});

describe('agujero-negro - guarda de payload (esJugadaValida)', () => {
  it('acepta números enteros válidos entre 0 y TOTAL_POSITIONS - 1', () => {
    for (let i = 0; i < TOTAL_POSITIONS; i++) {
      expect(esJugadaValida(i)).toBe(true);
    }
  });

  it('rechaza índices fuera de rango', () => {
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(TOTAL_POSITIONS)).toBe(false);
    expect(esJugadaValida(100)).toBe(false);
  });

  it('rechaza números no enteros o especiales', () => {
    expect(esJugadaValida(3.14)).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
    expect(esJugadaValida(Infinity)).toBe(false);
  });

  it('rechaza tipos no numéricos', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(undefined)).toBe(false);
    expect(esJugadaValida('10')).toBe(false);
    expect(esJugadaValida({ id: 5 })).toBe(false);
  });
});

