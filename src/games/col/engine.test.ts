import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  regionesLegales,
  type ColState,
} from './engine';
import { MAPAS } from './maps';

describe('createInitialState', () => {
  it('empieza en fase seleccion, sin mapa, J1 por defecto', () => {
    const s = createInitialState();
    expect(s).toMatchObject({
      mapaId: null,
      fase: 'seleccion',
      colores: [],
      currentPlayer: 1,
      jugadorInicial: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    });
  });

  it('respeta el jugador inicial indicado', () => {
    const s = createInitialState(2);
    expect(s.currentPlayer).toBe(2);
    expect(s.jugadorInicial).toBe(2);
  });
});

describe('esJugadaValida', () => {
  it('acepta jugada de mapa con mapaId entero 0..2', () => {
    expect(esJugadaValida({ tipo: 'mapa', mapaId: 0 })).toBe(true);
    expect(esJugadaValida({ tipo: 'mapa', mapaId: 2 })).toBe(true);
  });
  it('acepta jugada de color con region entera >= 0', () => {
    expect(esJugadaValida({ tipo: 'color', region: 5 })).toBe(true);
  });
  it('rechaza basura', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida({ tipo: 'mapa', mapaId: 9 })).toBe(false);
    expect(esJugadaValida({ tipo: 'mapa', mapaId: 1.5 })).toBe(false);
    expect(esJugadaValida({ tipo: 'color', region: -1 })).toBe(false);
    expect(esJugadaValida({ tipo: 'color' })).toBe(false);
    expect(esJugadaValida({ tipo: 'otra', region: 0 })).toBe(false);
    expect(esJugadaValida([])).toBe(false);
  });
});

describe('regionesLegales', () => {
  function enJuego(mapaId = 0): ColState {
    return {
      mapaId,
      fase: 'jugando',
      colores: Array(MAPAS[mapaId].regiones.length).fill(0),
      currentPlayer: 1,
      jugadorInicial: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
  }

  it('en fase seleccion o terminado devuelve []', () => {
    expect(regionesLegales(createInitialState(), 1)).toEqual([]);
  });

  it('con el tablero vacío, todas las regiones son legales para ambos', () => {
    const s = enJuego(0);
    const n = MAPAS[0].regiones.length;
    expect(regionesLegales(s, 1)).toHaveLength(n);
    expect(regionesLegales(s, 2)).toHaveLength(n);
  });

  it('una región con vecina de mi color deja de ser legal para mí, no para el rival', () => {
    const s = enJuego(0);
    // mapa 0: la región 0 es adyacente a 1, 3, 4
    s.colores[0] = 1;
    const legalesJ1 = regionesLegales(s, 1);
    expect(legalesJ1).not.toContain(0); // ya coloreada
    expect(legalesJ1).not.toContain(1);
    expect(legalesJ1).not.toContain(3);
    expect(legalesJ1).not.toContain(4);
    const legalesJ2 = regionesLegales(s, 2);
    expect(legalesJ2).toContain(1);
    expect(legalesJ2).toContain(3);
    expect(legalesJ2).toContain(4);
  });
});
