import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  celdasElegibles,
  lineaGanadora,
  playMove,
  causaFin,
  MAX_RONDAS,
  type WildCatsState,
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

/** Aplica la secuencia comprobando que cada jugada es legal (nueva referencia). */
function jugar(secuencia: number[], inicial: WildCatsState = createInitialState()): WildCatsState {
  let s = inicial;
  for (const celda of secuencia) {
    const n = playMove(s, { celda });
    expect(n).not.toBe(s);
    s = n;
  }
  return s;
}

describe('playMove', () => {
  it('ronda normal: J1 guarda en secreto y luego J2 resuelve', () => {
    const a = jugar([0]);
    expect(a.eleccionJ1).toBe(0);
    expect(a.currentPlayer).toBe(2);
    expect(a.tablero).toEqual(Array(25).fill(null));
    expect(a.ronda).toBe(1);

    const b = jugar([0, 1]);
    expect(b.tablero[0]).toBe(1);
    expect(b.tablero[1]).toBe(2);
    expect(b.currentPlayer).toBe(1);
    expect(b.eleccionJ1).toBeNull();
    expect(b.ronda).toBe(2);
    expect(b.vetada).toBeNull();
    expect(b.ultimaRevelacion).toEqual({ elecciones: { 1: 0, 2: 1 }, choque: false });
  });

  it('choque: tablero intacto, celda vetada, ronda avanza', () => {
    const s = jugar([6, 6]);
    expect(s.tablero).toEqual(Array(25).fill(null));
    expect(s.vetada).toBe(6);
    expect(s.ultimaRevelacion).toEqual({ elecciones: { 1: 6, 2: 6 }, choque: true });
    expect(s.ronda).toBe(2);
    expect(s.currentPlayer).toBe(1);
  });

  it('la celda vetada se rechaza para J1 y J2, y se levanta tras una ronda sin choque', () => {
    const s = jugar([6, 6]);
    expect(playMove(s, { celda: 6 })).toBe(s);
    const medio = jugar([7], s);
    expect(playMove(medio, { celda: 6 })).toBe(medio);
    const despues = jugar([7, 8], s);
    expect(celdasElegibles(despues)).toContain(6);
  });

  it('un segundo choque reemplaza el veto', () => {
    expect(jugar([6, 6, 9, 9]).vetada).toBe(9);
  });

  it('rechaza jugadas ilegales con la misma referencia', () => {
    const s = jugar([0, 1]);
    expect(playMove(s, { celda: 0 })).toBe(s);
    expect(playMove(s, { celda: 1 })).toBe(s);
    expect(playMove(s, { celda: 25 })).toBe(s);
    expect(playMove(s, { celda: -1 })).toBe(s);
    const fin = jugar([0, 5, 1, 6, 2, 7, 3, 20]);
    expect(fin.fase).toBe('finished');
    expect(playMove(fin, { celda: 24 })).toBe(fin);
  });

  it('no muta el estado recibido', () => {
    const s = createInitialState();
    const copia = structuredClone(s);
    playMove(s, { celda: 3 });
    expect(s).toEqual(copia);
    const m = jugar([3]);
    const copiaM = structuredClone(m);
    playMove(m, { celda: 4 });
    expect(m).toEqual(copiaM);
  });

  it('si ambos completan línea en la misma ronda es empate', () => {
    const s = jugar([0, 5, 1, 6, 2, 7, 3, 8]);
    expect(lineaGanadora(s.tablero, 1)).not.toBeNull();
    expect(lineaGanadora(s.tablero, 2)).not.toBeNull();
    expect(s.fase).toBe('finished');
    expect(s.winner).toBeNull();
  });

  it('gana solo J1', () => {
    const s = jugar([0, 5, 1, 6, 2, 7, 3, 20]);
    expect(s.fase).toBe('finished');
    expect(s.winner).toBe(1);
  });

  it('gana solo J2', () => {
    const s = jugar([10, 0, 11, 1, 12, 2, 20, 3]);
    expect(s.fase).toBe('finished');
    expect(s.winner).toBe(2);
  });

  it('con <= 1 casilla vacía y sin línea es empate', () => {
    // Reparto sin línea de 4; se vacían 0 (J1), 1 (J2) y 12.
    const reparto = '1222121211112121112122122';
    const tablero: Celda[] = [...reparto].map((c) => (c === '1' ? 1 : 2));
    expect(lineaGanadora(tablero, 1)).toBeNull();
    expect(lineaGanadora(tablero, 2)).toBeNull();
    tablero[0] = null;
    tablero[1] = null;
    tablero[12] = null;
    const base = { ...vacio(), tablero, ronda: 12 };
    const s = jugar([0, 1], base);
    expect(s.tablero.filter((c) => c === null)).toHaveLength(1);
    expect(s.fase).toBe('finished');
    expect(s.winner).toBeNull();
    // Un choque con 3 vacías no reduce las vacías: la partida sigue.
    const c = jugar([12, 12], base);
    expect(c.fase).toBe('jugando');
    expect(c.vetada).toBe(12);
  });

  it('una línea completada en la última ronda gana en vez de empatar', () => {
    const base: WildCatsState = {
      ...vacio(),
      tablero: tableroCon(1, [0, 1, 2]),
      ronda: MAX_RONDAS,
    };
    const s = jugar([3, 20], base);
    expect(s.fase).toBe('finished');
    expect(s.winner).toBe(1);
  });

  it('tope de rondas: un choque en la última ronda termina en empate', () => {
    const s = jugar([3, 3], { ...vacio(), ronda: MAX_RONDAS });
    expect(s.fase).toBe('finished');
    expect(s.winner).toBeNull();
  });

  it('el estado a mitad de ronda sobrevive a JSON y structuredClone', () => {
    const s = jugar([0, 1, 2, 2, 4]);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    expect(structuredClone(s)).toEqual(s);
  });

  it('es determinista', () => {
    const seq = [0, 1, 6, 6, 7, 8, 2, 3];
    expect(jugar(seq)).toEqual(jugar(seq));
  });
});

describe('causaFin', () => {
  const terminado = (t: Celda[], over: Partial<WildCatsState> = {}): WildCatsState => ({
    ...vacio(),
    tablero: t,
    fase: 'finished',
    ...over,
  });

  it('null mientras se juega', () => {
    expect(causaFin(vacio())).toBeNull();
  });

  it('victoria con una sola casilla vacía: linea', () => {
    const t = tableroCon(2, [20, 21, 22, 23]);
    for (let i = 0; i < 20; i++) t[i] = i % 2 === 0 ? 1 : 2;
    t[24] = null;
    expect(causaFin(terminado(t, { winner: 2 }))).toBe('linea');
  });

  it('victoria en la ronda MAX_RONDAS: linea', () => {
    const t = tableroCon(1, [0, 1, 2, 3]);
    expect(causaFin(terminado(t, { winner: 1, ronda: MAX_RONDAS }))).toBe('linea');
  });

  it('ambos completan línea en la misma revelación: dos-lineas', () => {
    let s = vacio();
    s = { ...s, tablero: [...tableroCon(1, [0, 1, 2]).map((c, i) => c ?? ([5, 6, 7].includes(i) ? 2 : null))] };
    s = jugar([3, 8], s);
    expect(s.fase).toBe('finished');
    expect(s.winner).toBeNull();
    expect(causaFin(s)).toBe('dos-lineas');
  });

  it('sin línea y con ≤1 vacía: casillas', () => {
    const t: Celda[] = Array.from({ length: 25 }, (_, i) => ((Math.floor(i / 10) + (i % 5)) % 2 === 0 ? 1 : 2) as 1 | 2);
    t[0] = null;
    expect(lineaGanadora(t, 1)).toBeNull();
    expect(lineaGanadora(t, 2)).toBeNull();
    expect(causaFin(terminado(t))).toBe('casillas');
  });

  it('sin línea en la ronda MAX_RONDAS con más vacías: rondas', () => {
    expect(causaFin(terminado(vacio().tablero, { ronda: MAX_RONDAS }))).toBe('rondas');
  });
});
