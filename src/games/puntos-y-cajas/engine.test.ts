import { describe, expect, it } from 'vitest';
import { createInitialState, playLine, type LineId, type PuntosYCajasState } from './engine';

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

  it('juega un tablero de tamaño 4 (el que se publica) completo hasta terminar', () => {
    // Board.astro fija SIZE = 4: 4x4 puntos, 24 líneas (12 h + 12 v) y 9 cajas.
    let state: PuntosYCajasState = createInitialState(4);
    expect(state.size).toBe(4);
    expect(state.horizontalLines).toHaveLength(4);
    expect(state.horizontalLines[0]).toHaveLength(3);
    expect(state.verticalLines).toHaveLength(3);
    expect(state.verticalLines[0]).toHaveLength(4);
    expect(state.boxOwners.flat()).toHaveLength(9);

    const jugadas: LineId[] = [];
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 3; col++) jugadas.push({ type: 'h', row, col });
    }
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) jugadas.push({ type: 'v', row, col });
    }
    expect(jugadas).toHaveLength(24);

    for (const jugada of jugadas) {
      expect(state.status).toBe('playing'); // sólo la jugada 24 puede terminarla
      state = playLine(state, jugada);
    }

    expect(state.status).toBe('finished');
    expect(state.boxOwners.flat().every(dueno => dueno !== null)).toBe(true);
    expect(state.scores[1] + state.scores[2]).toBe(9);
    expect(state.boxOwners.flat().filter(d => d === 1)).toHaveLength(state.scores[1]);
    expect(state.boxOwners.flat().filter(d => d === 2)).toHaveLength(state.scores[2]);

    // Una vez terminada, ninguna jugada adicional cambia el estado.
    expect(playLine(state, { type: 'h', row: 0, col: 0 })).toEqual(state);
  });
});
