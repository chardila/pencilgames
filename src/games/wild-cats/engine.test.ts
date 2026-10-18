import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  celdasElegibles,
  lineaGanadora,
  LINEAS,
  CELDAS,
  type Celda,
} from './engine';

const vacio = () => createInitialState();

function tableroCon(jugador: 1 | 2, celdas: number[]): Celda[] {
  const t = vacio().tablero;
  for (const c of celdas) t[c] = jugador;
  return t;
}

describe('LINEAS', () => {
  it('tiene 28 líneas de 4 celdas distintas dentro de 0..24', () => {
    expect(LINEAS).toHaveLength(28);
    for (const l of LINEAS) {
      expect(l).toHaveLength(4);
      expect(new Set(l).size).toBe(4);
      for (const c of l) {
        expect(Number.isInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(CELDAS);
      }
    }
  });
});

describe('createInitialState', () => {
  it('arranca vacío, ronda 1, turno de J1', () => {
    const s = createInitialState();
    expect(s.tablero).toEqual(Array(25).fill(null));
    expect(s.currentPlayer).toBe(1);
    expect(s.eleccionJ1).toBeNull();
    expect(s.vetada).toBeNull();
    expect(s.ronda).toBe(1);
    expect(s.ultimaRevelacion).toBeNull();
    expect(s.fase).toBe('jugando');
    expect(s.winner).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta celdas 0..24', () => {
    expect(esJugadaValida({ celda: 0 })).toBe(true);
    expect(esJugadaValida({ celda: 24 })).toBe(true);
  });
  it('rechaza todo lo demás', () => {
    for (const p of [null, {}, { celda: 25 }, { celda: -1 }, { celda: 1.5 }, { celda: '3' }, [3]]) {
      expect(esJugadaValida(p)).toBe(false);
    }
  });
});

describe('celdasElegibles', () => {
  it('inicialmente son las 25', () => {
    expect(celdasElegibles(vacio())).toHaveLength(25);
  });
  it('excluye las ocupadas', () => {
    const s = vacio();
    s.tablero[0] = 1;
    s.tablero[7] = 2;
    const e = celdasElegibles(s);
    expect(e).not.toContain(0);
    expect(e).not.toContain(7);
    expect(e).toHaveLength(23);
  });
  it('excluye la vetada', () => {
    const s = vacio();
    s.vetada = 12;
    const e = celdasElegibles(s);
    expect(e).not.toContain(12);
    expect(e).toHaveLength(24);
  });
  it('si la vetada es la única vacía, sigue elegible', () => {
    const s = vacio();
    s.tablero = Array<Celda>(25).fill(1);
    s.tablero[12] = null;
    s.vetada = 12;
    expect(celdasElegibles(s)).toEqual([12]);
  });
  it('la elección pendiente de J1 sigue elegible', () => {
    const s = vacio();
    s.eleccionJ1 = 5;
    expect(celdasElegibles(s)).toContain(5);
  });
});

describe('lineaGanadora', () => {
  it.each([
    [[0, 1, 2, 3]],
    [[1, 2, 3, 4]],
    [[0, 5, 10, 15]],
    [[0, 6, 12, 18]],
    [[4, 8, 12, 16]],
  ])('detecta la línea %j', (celdas) => {
    const l = lineaGanadora(tableroCon(1, celdas), 1);
    expect(l).not.toBeNull();
    expect([...l!].sort((a, b) => a - b)).toEqual(celdas);
  });
  it('3 seguidas no ganan', () => {
    expect(lineaGanadora(tableroCon(1, [0, 1, 2]), 1)).toBeNull();
  });
  it('no envuelve entre filas (3,4,5,6)', () => {
    expect(lineaGanadora(tableroCon(1, [3, 4, 5, 6]), 1)).toBeNull();
  });
  it('no confunde jugadores', () => {
    expect(lineaGanadora(tableroCon(1, [0, 1, 2, 3]), 2)).toBeNull();
  });
});
