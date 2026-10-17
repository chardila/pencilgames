import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  buscarLinea,
  playMove,
  TAMANO,
  type CellValue,
  type OrdenCaosState,
} from './engine';

const idx = (f: number, c: number) => f * TAMANO + c;
const vacio = (): CellValue[] => Array<CellValue>(36).fill(null);
const conMarcas = (celdas: number[], m: 'X' | 'O'): CellValue[] => {
  const b = vacio();
  celdas.forEach(i => (b[i] = m));
  return b;
};

describe('createInitialState', () => {
  it('tablero vacío de 36, empieza Orden (jugador 1)', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(36);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.lastMove).toBeNull();
    expect(s.linea).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta {cell, marca} válidos', () => {
    expect(esJugadaValida({ cell: 0, marca: 'X' })).toBe(true);
    expect(esJugadaValida({ cell: 35, marca: 'O' })).toBe(true);
  });
  it('rechaza lo demás', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({ cell: 0 })).toBe(false);
    expect(esJugadaValida({ cell: 0, marca: 'S' })).toBe(false);
    expect(esJugadaValida({ cell: 36, marca: 'X' })).toBe(false);
    expect(esJugadaValida({ cell: -1, marca: 'X' })).toBe(false);
    expect(esJugadaValida({ cell: 1.5, marca: 'X' })).toBe(false);
  });
});

describe('buscarLinea', () => {
  it('detecta cinco en horizontal, vertical y las dos diagonales', () => {
    const h = [0, 1, 2, 3, 4].map(c => idx(2, c));
    const v = [0, 1, 2, 3, 4].map(f => idx(f, 5));
    const d1 = [0, 1, 2, 3, 4].map(k => idx(k + 1, k + 1));
    const d2 = [0, 1, 2, 3, 4].map(k => idx(k, 5 - k));
    for (const linea of [h, v, d1, d2]) {
      expect(buscarLinea(conMarcas(linea, 'X'))).toEqual(linea);
      expect(buscarLinea(conMarcas(linea, 'O'))).toEqual(linea);
    }
  });
  it('cuatro no basta y una racha de seis cuenta', () => {
    expect(buscarLinea(conMarcas([0, 1, 2, 3].map(c => idx(0, c)), 'X'))).toBeNull();
    expect(buscarLinea(conMarcas([0, 1, 2, 3, 4, 5].map(c => idx(0, c)), 'X'))).not.toBeNull();
  });
  it('no mezcla X y O ni envuelve filas', () => {
    const b = conMarcas([0, 1, 3, 4].map(c => idx(1, c)), 'X');
    b[idx(1, 2)] = 'O';
    expect(buscarLinea(b)).toBeNull();
    // cuatro al final de una fila y uno al inicio de la siguiente
    const w = conMarcas([idx(0, 2), idx(0, 3), idx(0, 4), idx(0, 5), idx(1, 0)], 'X');
    expect(buscarLinea(w)).toBeNull();
  });
});

describe('playMove', () => {
  it('coloca la marca elegida y alterna Orden/Caos', () => {
    let s = playMove(createInitialState(), { cell: 0, marca: 'X' });
    expect(s.board[0]).toBe('X');
    expect(s.currentPlayer).toBe(2);
    s = playMove(s, { cell: 1, marca: 'X' });
    expect(s.board[1]).toBe('X'); // Caos también puede poner X
    expect(s.currentPlayer).toBe(1);
    expect(s.lastMove).toEqual({ cell: 1, marca: 'X' });
  });
  it('rechaza casilla ocupada y jugadas mal formadas', () => {
    const s = playMove(createInitialState(), { cell: 0, marca: 'X' });
    expect(playMove(s, { cell: 0, marca: 'O' })).toBe(s);
    expect(playMove(s, { cell: 99, marca: 'X' })).toBe(s);
    expect(playMove(s, { cell: 3, marca: 'Z' } as never)).toBe(s);
  });
  it('no muta el estado anterior', () => {
    const s = createInitialState();
    playMove(s, { cell: 0, marca: 'X' });
    expect(s.board[0]).toBeNull();
  });
  it('Orden gana al completar cinco, aunque lo complete Caos', () => {
    const b = conMarcas([0, 1, 2, 3].map(c => idx(0, c)), 'X');
    const s: OrdenCaosState = { ...createInitialState(), board: b, currentPlayer: 1 };
    const fin = playMove(s, { cell: idx(0, 4), marca: 'X' });
    expect(fin.status).toBe('won');
    expect(fin.winner).toBe(1);
    expect(fin.linea).toEqual([0, 1, 2, 3, 4].map(c => idx(0, c)));
    // Caos obligado a cerrar: la línea sigue siendo victoria de Orden
    const forzado = playMove({ ...s, currentPlayer: 2 }, { cell: idx(0, 4), marca: 'X' });
    expect(forzado.winner).toBe(1);
  });
  it('Caos gana si el tablero se llena sin cinco seguidos', () => {
    // Patrón sin cinco en línea; se deja libre la última casilla.
    const patron: CellValue[] = [];
    for (let f = 0; f < 6; f++) {
      for (let c = 0; c < 6; c++) {
        patron.push(Math.floor(c / 2 + f) % 2 === 0 ? 'X' : 'O');
      }
    }
    expect(buscarLinea(patron)).toBeNull();
    const ultima = 35;
    const marca = patron[ultima]!;
    const b = [...patron];
    b[ultima] = null;
    const fin = playMove(
      { ...createInitialState(), board: b, currentPlayer: 2 },
      { cell: ultima, marca },
    );
    expect(fin.status).toBe('won');
    expect(fin.winner).toBe(2);
    expect(fin.linea).toBeNull();
  });
  it('tras el fin ignora más jugadas', () => {
    const b = conMarcas([0, 1, 2, 3].map(c => idx(0, c)), 'X');
    const fin = playMove({ ...createInitialState(), board: b }, { cell: 4, marca: 'X' });
    expect(playMove(fin, { cell: 10, marca: 'O' })).toBe(fin);
  });
});

describe('partidas aleatorias', () => {
  it('siempre terminan en ≤36 jugadas con ganador coherente', () => {
    for (let p = 0; p < 500; p++) {
      let s = createInitialState();
      let n = 0;
      while (s.status === 'playing') {
        const libres = s.board.map((c, i) => (c === null ? i : -1)).filter(i => i >= 0);
        const cell = libres[Math.floor(Math.random() * libres.length)];
        s = playMove(s, { cell, marca: Math.random() < 0.5 ? 'X' : 'O' });
        expect(++n).toBeLessThanOrEqual(36);
      }
      if (s.winner === 1) {
        expect(s.linea).toHaveLength(5);
        expect(buscarLinea(s.board)).not.toBeNull();
      } else {
        expect(s.winner).toBe(2);
        expect(s.board.every(c => c !== null)).toBe(true);
        expect(buscarLinea(s.board)).toBeNull();
      }
    }
  });
});
