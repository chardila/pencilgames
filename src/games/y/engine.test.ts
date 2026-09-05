import { describe, it, expect } from 'vitest';
import {
  cellCount,
  coordsOf,
  createInitialState,
  esJugadaValida,
  getNeighbors,
  indexOf,
  type BoardSize,
} from './engine';

describe('cellCount', () => {
  it('devuelve N(N+1)/2 para cada tamaño', () => {
    expect(cellCount(7)).toBe(28);
    expect(cellCount(9)).toBe(45);
    expect(cellCount(11)).toBe(66);
  });
});

describe('indexOf / coordsOf', () => {
  it('son inversas y biyectivas sobre [0, cellCount)', () => {
    for (const N of [7, 9, 11] as BoardSize[]) {
      const vistos = new Set<number>();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c <= r; c++) {
          const i = indexOf(r, c);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(cellCount(N));
          expect(vistos.has(i)).toBe(false);
          vistos.add(i);
          expect(coordsOf(i)).toEqual({ r, c });
        }
      }
      expect(vistos.size).toBe(cellCount(N));
    }
  });
});

describe('createInitialState', () => {
  it('crea un estado por defecto N=9 con 45 celdas vacías y turno de J1', () => {
    const s = createInitialState();
    expect(s.size).toBe(9);
    expect(s.board).toHaveLength(45);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.winningCells).toBeNull();
    expect(s.lastMove).toBeNull();
  });

  it('permite N=7 y N=11', () => {
    expect(createInitialState(7).board).toHaveLength(28);
    expect(createInitialState(11).board).toHaveLength(66);
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros en [0, cellCount(size))', () => {
    expect(esJugadaValida(0, 7)).toBe(true);
    expect(esJugadaValida(27, 7)).toBe(true);
    expect(esJugadaValida(44, 9)).toBe(true);
  });

  it('rechaza fuera de rango, floats, strings, NaN y otros tipos', () => {
    expect(esJugadaValida(-1, 7)).toBe(false);
    expect(esJugadaValida(28, 7)).toBe(false);
    expect(esJugadaValida(2.5, 7)).toBe(false);
    expect(esJugadaValida('3', 7)).toBe(false);
    expect(esJugadaValida(null, 7)).toBe(false);
    expect(esJugadaValida({}, 7)).toBe(false);
    expect(esJugadaValida(NaN, 7)).toBe(false);
  });
});

describe('getNeighbors', () => {
  const grado = (r: number, c: number, N: BoardSize) =>
    getNeighbors(indexOf(r, c), N).length;

  it('el ápice (0,0) tiene 2 vecinos', () => {
    for (const N of [7, 9, 11] as BoardSize[]) expect(grado(0, 0, N)).toBe(2);
  });

  it('las esquinas inferiores tienen 2 vecinos (simetría con el ápice)', () => {
    for (const N of [7, 9, 11] as BoardSize[]) {
      expect(grado(N - 1, 0, N)).toBe(2);
      expect(grado(N - 1, N - 1, N)).toBe(2);
    }
  });

  it('un punto medio de lado (no esquina) tiene 4 vecinos', () => {
    // Lado izquierdo (c=0), fila intermedia
    expect(grado(3, 0, 7)).toBe(4);
    // Lado derecho (c=r), fila intermedia
    expect(grado(3, 3, 7)).toBe(4);
    // Lado inferior (r=N-1), columna intermedia
    expect(grado(6, 3, 7)).toBe(4);
  });

  it('una celda interior tiene 6 vecinos', () => {
    expect(grado(3, 1, 7)).toBe(6);
    expect(grado(4, 2, 9)).toBe(6);
  });

  it('getNeighbors es recíproco', () => {
    const N: BoardSize = 7;
    for (let i = 0; i < cellCount(N); i++) {
      for (const v of getNeighbors(i, N)) {
        expect(getNeighbors(v, N)).toContain(i);
      }
    }
  });

  it('el ápice conecta con las dos celdas de la fila 1', () => {
    expect(getNeighbors(indexOf(0, 0), 7).sort((a, b) => a - b)).toEqual(
      [indexOf(1, 0), indexOf(1, 1)].sort((a, b) => a - b)
    );
  });
});
