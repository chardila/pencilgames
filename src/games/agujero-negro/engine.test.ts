import { describe, expect, it } from 'vitest';
import { createInitialState, getNeighbors, placeNumber, type AgujeroNegroState } from './engine';

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

  it('no permite jugar después de terminada la partida', () => {
    let state: AgujeroNegroState = createInitialState();
    for (let posicion = 0; posicion < 20; posicion++) {
      state = placeNumber(state, posicion);
    }
    const next = placeNumber(state, 20);
    expect(next).toEqual(state);
  });
});
