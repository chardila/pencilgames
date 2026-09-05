import { describe, it, expect } from 'vitest';
import { createInitialState, esJugadaValida } from './engine';

describe('createInitialState', () => {
  it('crea las cuatro matrices de aristas con las dimensiones correctas, todas en false', () => {
    const state = createInitialState();
    expect(state.redH.length).toBe(6);
    expect(state.redH.every(fila => fila.length === 5 && fila.every(v => v === false))).toBe(true);
    expect(state.redV.length).toBe(5);
    expect(state.redV.every(fila => fila.length === 6 && fila.every(v => v === false))).toBe(true);
    expect(state.blueH.length).toBe(5);
    expect(state.blueH.every(fila => fila.length === 4 && fila.every(v => v === false))).toBe(true);
    expect(state.blueV.length).toBe(4);
    expect(state.blueV.every(fila => fila.length === 5 && fila.every(v => v === false))).toBe(true);
  });

  it('inicia con el jugador 1 (rojo), en juego, sin ganador', () => {
    const state = createInitialState();
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.winningPath).toBeNull();
    expect(state.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta un Edge bien formado', () => {
    expect(esJugadaValida({ type: 'h', row: 0, col: 0 })).toBe(true);
    expect(esJugadaValida({ type: 'v', row: 3, col: 2 })).toBe(true);
  });

  it('rechaza payloads mal formados', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(42)).toBe(false);
    expect(esJugadaValida({ type: 'x', row: 0, col: 0 })).toBe(false);
    expect(esJugadaValida({ type: 'h', row: -1, col: 0 })).toBe(false);
    expect(esJugadaValida({ type: 'h', row: 1.5, col: 0 })).toBe(false);
    expect(esJugadaValida({ type: 'h', row: 0 })).toBe(false);
  });
});
