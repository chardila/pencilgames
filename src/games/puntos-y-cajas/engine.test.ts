import { describe, expect, it } from 'vitest';
import { createInitialState, playLine, type PuntosYCajasState } from './engine';

describe('puntos y cajas engine', () => {
  it('empieza sin líneas, sin cajas y le toca al jugador 1', () => {
    const state = createInitialState(2); // 1x1 caja, la más simple posible
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.scores).toEqual({ 1: 0, 2: 0 });
  });

  it('trazar una línea que no completa una caja pasa el turno', () => {
    const state = createInitialState(2);
    const next = playLine(state, { type: 'h', row: 0, col: 0 });
    expect(next.horizontalLines[0][0]).toBe(true);
    expect(next.currentPlayer).toBe(2);
    expect(next.scores).toEqual({ 1: 0, 2: 0 });
  });

  it('completar una caja de 1x1 anota un punto y repite turno', () => {
    let state: PuntosYCajasState = createInitialState(2);
    state = playLine(state, { type: 'h', row: 0, col: 0 }); // jugador 1, pasa a 2
    state = playLine(state, { type: 'h', row: 1, col: 0 }); // jugador 2, pasa a 1
    state = playLine(state, { type: 'v', row: 0, col: 0 }); // jugador 1, pasa a 2
    const next = playLine(state, { type: 'v', row: 0, col: 1 }); // jugador 2 cierra la caja

    expect(next.boxOwners[0][0]).toBe(2);
    expect(next.scores).toEqual({ 1: 0, 2: 1 });
    expect(next.currentPlayer).toBe(2); // turno extra
    expect(next.status).toBe('finished'); // única caja del tablero 1x1
  });

  it('ignora una línea ya trazada', () => {
    const state = playLine(createInitialState(2), { type: 'h', row: 0, col: 0 });
    const next = playLine(state, { type: 'h', row: 0, col: 0 });
    expect(next).toEqual(state);
  });

  it('ignora una línea fuera de rango', () => {
    const state = createInitialState(2);
    const next = playLine(state, { type: 'h', row: 5, col: 5 });
    expect(next).toEqual(state);
  });

  it('una línea interior puede completar dos cajas a la vez', () => {
    // Tablero 3x3 (size=3, cajas en cuadrícula 2x2). La línea horizontal
    // h(1,0) es el lado compartido entre la caja de arriba, (0,0), y la
    // caja de abajo, (1,0): es su "bottom" y su "top" respectivamente.
    // Dejamos ambas cajas con todos sus otros 3 lados trazados, de modo
    // que trazar h(1,0) al final las completa a las dos en la misma jugada.
    let state: PuntosYCajasState = createInitialState(3);
    // Caja superior (0,0): top, left, right ya trazadas; falta bottom = h(1,0)
    state = playLine(state, { type: 'h', row: 0, col: 0 }); // top (0,0)
    state = playLine(state, { type: 'v', row: 0, col: 0 }); // left (0,0)
    state = playLine(state, { type: 'v', row: 0, col: 1 }); // right (0,0)
    // Caja inferior (1,0): left, right, bottom ya trazadas; falta top = h(1,0) (compartida)
    state = playLine(state, { type: 'v', row: 1, col: 0 }); // left (1,0)
    state = playLine(state, { type: 'v', row: 1, col: 1 }); // right (1,0)
    state = playLine(state, { type: 'h', row: 2, col: 0 }); // bottom (1,0)

    const totalAntes = state.scores[1] + state.scores[2];
    const next = playLine(state, { type: 'h', row: 1, col: 0 }); // cierra ambas a la vez

    expect(next.boxOwners[0][0]).not.toBeNull();
    expect(next.boxOwners[1][0]).not.toBeNull();
    expect(next.scores[1] + next.scores[2]).toBe(totalAntes + 2);
  });
});
