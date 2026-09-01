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
    expect(
      regionesLegales(
        { ...createInitialState(), fase: 'terminado', mapaId: 0 },
        1
      )
    ).toEqual([]);
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

import { playMove, type ColMove } from './engine';

describe('playMove — fase seleccion', () => {
  it('jugada de mapa entra a jugando sin cambiar turno e inicializa colores', () => {
    const s = createInitialState(2);
    const r = playMove(s, { tipo: 'mapa', mapaId: 1 });
    expect(r.fase).toBe('jugando');
    expect(r.mapaId).toBe(1);
    expect(r.currentPlayer).toBe(2); // sin cambio
    expect(r.colores).toHaveLength(MAPAS[1].regiones.length);
    expect(r.colores.every(c => c === 0)).toBe(true);
    expect(r.lastMove).toBeNull();
  });

  it('jugada de color en fase seleccion no hace nada', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'color', region: 0 })).toBe(s);
  });

  it('mapaId fuera de rango no hace nada', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'mapa', mapaId: 5 } as ColMove)).toBe(s);
  });
});

describe('playMove — fase jugando', () => {
  function trasElegir(mapaId = 0, inicial: 1 | 2 = 1): ColState {
    return playMove(createInitialState(inicial), { tipo: 'mapa', mapaId });
  }

  it('colorear una región vacía sin vecinas de mi color alterna el turno', () => {
    const s = trasElegir(0);
    const r = playMove(s, { tipo: 'color', region: 0 });
    expect(r.colores[0]).toBe(1);
    expect(r.currentPlayer).toBe(2);
    expect(r.lastMove).toBe(0);
    expect(r.status).toBe('playing');
  });

  it('colorear una región ya coloreada no hace nada', () => {
    let s = trasElegir(0);
    s = playMove(s, { tipo: 'color', region: 0 }); // J1
    expect(playMove(s, { tipo: 'color', region: 0 })).toBe(s); // J2 sobre la misma
  });

  it('J1 no puede colorear una región vecina a otra suya', () => {
    let s = trasElegir(0);
    s = playMove(s, { tipo: 'color', region: 0 }); // J1 -> region 0
    s = playMove(s, { tipo: 'color', region: 2 }); // J2 -> region 2 (no adyacente a 0)
    // turno de J1; region 1 es adyacente a 0 (color de J1) -> ilegal
    expect(playMove(s, { tipo: 'color', region: 1 })).toBe(s);
  });

  it('detecta la victoria cuando el rival se queda sin jugadas', () => {
    // Mapa 0: la región 10 (esquina) sólo es adyacente a 7 y 11.
    // Dejamos 10 vacía, 7 y 11 de J2, y todo lo demás de J1.
    // -> 10 es legal para J1 (ninguna vecina es de J1) e ilegal para J2.
    const colores = Array(MAPAS[0].regiones.length).fill(1) as (0 | 1 | 2)[];
    colores[7] = 2;
    colores[11] = 2;
    colores[10] = 0;
    const s: ColState = {
      mapaId: 0,
      fase: 'jugando',
      colores,
      currentPlayer: 1,
      jugadorInicial: 1,
      status: 'playing',
      winner: null,
      lastMove: null,
    };
    expect(regionesLegales(s, 1)).toEqual([10]);
    const r = playMove(s, { tipo: 'color', region: 10 });
    expect(r.status).toBe('won');
    expect(r.winner).toBe(1);
    expect(r.fase).toBe('terminado');
    expect(r.currentPlayer).toBe(1); // el turno no pasa al ganar
  });

  it('no muta el estado de entrada', () => {
    const s = trasElegir(0);
    const copia = JSON.parse(JSON.stringify(s));
    playMove(s, { tipo: 'color', region: 5 });
    expect(s).toEqual(copia);
  });

  it('tras status won cualquier jugada devuelve el mismo objeto', () => {
    const won: ColState = {
      mapaId: 0,
      fase: 'terminado',
      colores: Array(MAPAS[0].regiones.length).fill(1),
      currentPlayer: 1,
      jugadorInicial: 1,
      status: 'won',
      winner: 1,
      lastMove: 0,
    };
    expect(playMove(won, { tipo: 'color', region: 2 })).toBe(won);
  });
});

describe('partidas aleatorias', () => {
  it('20 000 partidas terminan siempre con un ganador válido', () => {
    let rng = 123456789;
    const rand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };
    const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];

    for (let i = 0; i < 20000; i++) {
      const mapaId = Math.floor(rand() * MAPAS.length);
      let s = playMove(createInitialState(pick([1, 2] as const)), {
        tipo: 'mapa',
        mapaId,
      });
      let guardia = 0;
      while (s.status === 'playing') {
        if (guardia++ > 500) throw new Error('bucle infinito');
        const legales = regionesLegales(s, s.currentPlayer);
        if (legales.length === 0) {
          throw new Error('jugador sin jugadas pero status seguía en playing');
        }
        s = playMove(s, { tipo: 'color', region: pick(legales) });
      }
      expect(s.status).toBe('won');
      expect(s.winner === 1 || s.winner === 2).toBe(true);
      expect(s.fase).toBe('terminado');
    }
  });
});
