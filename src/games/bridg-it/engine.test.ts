import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  slotAToEdge,
  slotBToEdge,
  getSlotAStatus,
  getSlotBStatus,
  puedeJugar,
} from './engine';

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

describe('slotAToEdge / slotBToEdge', () => {
  it('slot A da la arista roja h para el jugador 1 en cualquier posición válida', () => {
    expect(slotAToEdge(1, 0, 0)).toEqual({ type: 'h', row: 0, col: 0 });
    expect(slotAToEdge(1, 5, 4)).toEqual({ type: 'h', row: 5, col: 4 });
  });

  it('slot A da la arista azul v para el jugador 2 solo cuando r-1 está en rango', () => {
    expect(slotAToEdge(2, 0, 0)).toBeNull(); // r-1 = -1, fuera de rango
    expect(slotAToEdge(2, 1, 0)).toEqual({ type: 'v', row: 0, col: 0 });
    expect(slotAToEdge(2, 5, 0)).toBeNull(); // r-1 = 4, fuera de rango (blueV solo 0-3)
  });

  it('slot B da la arista roja v para el jugador 1 en cualquier posición válida', () => {
    expect(slotBToEdge(1, 0, 0)).toEqual({ type: 'v', row: 0, col: 0 });
    expect(slotBToEdge(1, 4, 5)).toEqual({ type: 'v', row: 4, col: 5 });
  });

  it('slot B da la arista azul h para el jugador 2 solo cuando c-1 está en rango', () => {
    expect(slotBToEdge(2, 0, 0)).toBeNull(); // c-1 = -1
    expect(slotBToEdge(2, 0, 1)).toEqual({ type: 'h', row: 0, col: 0 });
    expect(slotBToEdge(2, 0, 5)).toBeNull(); // c-1 = 4, fuera de rango (blueH solo 0-3)
  });
});

describe('getSlotAStatus / getSlotBStatus', () => {
  it('reporta vacío cuando no hay arista dibujada', () => {
    const state = createInitialState();
    expect(getSlotAStatus(state, 2, 2)).toEqual({ drawn: false, owner: null });
    expect(getSlotBStatus(state, 2, 2)).toEqual({ drawn: false, owner: null });
  });

  it('reporta el dueño rojo cuando redH está marcada', () => {
    const state = createInitialState();
    state.redH[2][2] = true;
    expect(getSlotAStatus(state, 2, 2)).toEqual({ drawn: true, owner: 1 });
  });

  it('reporta el dueño azul cuando blueV está marcada', () => {
    const state = createInitialState();
    state.blueV[1][2] = true; // corresponde a slot A en r=2,c=2 (r-1=1)
    expect(getSlotAStatus(state, 2, 2)).toEqual({ drawn: true, owner: 2 });
  });
});

describe('puedeJugar', () => {
  it('permite la primera jugada de rojo en cualquier arista propia', () => {
    const state = createInitialState();
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(true);
  });

  it('rechaza redibujar una arista propia ya trazada', () => {
    const state = createInitialState();
    state.redH[0][0] = true;
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(false);
  });

  it('bloquea la arista roja cruzada una vez trazada la azul correspondiente', () => {
    const state = createInitialState();
    state.currentPlayer = 2;
    state.blueV[0][0] = true; // ocupa el slot A en (r=1,c=0)
    state.currentPlayer = 1;
    expect(puedeJugar(state, { type: 'h', row: 1, col: 0 })).toBe(false);
  });

  it('bloquea la arista azul cruzada una vez trazada la roja correspondiente', () => {
    const state = createInitialState();
    state.redV[0][1] = true; // ocupa el slot B en (r=0,c=1)
    state.currentPlayer = 2;
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(false);
  });

  it('permite jugar en los bordes donde la arista cruzada no existe (sin lanzar error)', () => {
    const state = createInitialState();
    // redH(0,0): slot A en r=0, blueV correspondiente sería r-1=-1, no existe.
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(true);
    state.currentPlayer = 2;
    // blueH(0,0): slot B en c=1, redV correspondiente es (0,1); si no está trazada, se puede jugar.
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(true);
  });

  it('rechaza coordenadas fuera de rango para el jugador activo', () => {
    const state = createInitialState();
    expect(puedeJugar(state, { type: 'h', row: 0, col: 5 })).toBe(false); // redH col máx es 4
    state.currentPlayer = 2;
    expect(puedeJugar(state, { type: 'h', row: 0, col: 4 })).toBe(false); // blueH col máx es 3
  });
});
