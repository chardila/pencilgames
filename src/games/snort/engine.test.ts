import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  vecinas,
  casillaLegal,
  tieneJugadaLegal,
  playMove,
  TAMANO,
  type CellValue,
  type SnortState,
} from './engine';

const idx = (fila: number, col: number) => fila * TAMANO + col;
const vacio = (): CellValue[] => Array<CellValue>(TAMANO * TAMANO).fill(null);
const con = (board: CellValue[], extra: Record<number, CellValue>): SnortState => ({
  ...createInitialState(),
  board: board.map((c, i) => (i in extra ? extra[i] : c)),
});

describe('createInitialState', () => {
  it('tablero vacío de 36 casillas, turno del jugador 1', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(36);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros en [0, 36)', () => {
    expect(esJugadaValida(0)).toBe(true);
    expect(esJugadaValida(35)).toBe(true);
  });
  it('rechaza lo demás', () => {
    for (const x of [-1, 36, 1.5, '3', null, undefined, {}, NaN]) {
      expect(esJugadaValida(x)).toBe(false);
    }
  });
});

describe('vecinas', () => {
  it('centro: 4; esquina: 2; borde: 3; sin envolver filas', () => {
    expect(vecinas(idx(2, 2)).sort((a, b) => a - b)).toEqual(
      [idx(1, 2), idx(2, 1), idx(2, 3), idx(3, 2)],
    );
    expect(vecinas(0)).toHaveLength(2);
    expect(vecinas(idx(0, 3))).toHaveLength(3);
    expect(vecinas(idx(0, 5))).not.toContain(idx(1, 0));
    expect(vecinas(idx(1, 0))).not.toContain(idx(0, 5));
  });
});

describe('casillaLegal', () => {
  it('prohíbe junto a una ficha del rival, no junto a una propia', () => {
    const s = con(vacio(), { [idx(2, 2)]: 1 });
    expect(casillaLegal(s.board, idx(2, 3), 2)).toBe(false);
    expect(casillaLegal(s.board, idx(2, 3), 1)).toBe(true);
  });
  it('la diagonal no cuenta como contigua', () => {
    const s = con(vacio(), { [idx(2, 2)]: 1 });
    expect(casillaLegal(s.board, idx(3, 3), 2)).toBe(true);
  });
  it('rechaza casillas ocupadas y fuera de rango', () => {
    const s = con(vacio(), { 0: 1 });
    expect(casillaLegal(s.board, 0, 1)).toBe(false);
    expect(casillaLegal(s.board, 0, 2)).toBe(false);
    expect(casillaLegal(s.board, -1, 1)).toBe(false);
    expect(casillaLegal(s.board, 36, 1)).toBe(false);
  });
});

describe('playMove', () => {
  it('coloca, alterna turno y registra lastMove', () => {
    const s = playMove(createInitialState(), idx(2, 2));
    expect(s.board[idx(2, 2)]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    expect(s.lastMove).toBe(idx(2, 2));
  });
  it('ignora jugadas ilegales devolviendo el mismo estado', () => {
    const s = playMove(createInitialState(), idx(2, 2));
    expect(playMove(s, idx(2, 3))).toBe(s); // junto a rival
    expect(playMove(s, idx(2, 2))).toBe(s); // ocupada
    expect(playMove(s, 99 as never)).toBe(s);
  });
  it('no muta el estado anterior', () => {
    const s = createInitialState();
    playMove(s, 0);
    expect(s.board[0]).toBeNull();
  });
  it('gana quien deja al rival sin jugada', () => {
    // Todo es de J1 salvo la 35 (J2) y las casillas 0 y 1: J2 no puede jugar
    // en ninguna (todas tocan fichas de J1), J1 sí en la 0.
    const board = Array<CellValue>(36).fill(1);
    board[idx(5, 5)] = 2;
    board[idx(0, 0)] = null;
    board[idx(0, 1)] = null;
    const fin = playMove({ ...createInitialState(), board }, idx(0, 0));
    expect(fin.status).toBe('won');
    expect(fin.winner).toBe(1);
    expect(fin.currentPlayer).toBe(1);
  });
  it('tras el fin ignora más jugadas', () => {
    const board = Array<CellValue>(36).fill(1);
    board[idx(5, 5)] = 2;
    board[idx(0, 0)] = null;
    const fin = playMove({ ...createInitialState(), board }, idx(0, 0));
    expect(fin.status).toBe('won');
    expect(playMove(fin, idx(0, 0))).toBe(fin);
  });
});

describe('tieneJugadaLegal', () => {
  it('vacío sí; lleno no; encerrado por fichas rivales no', () => {
    expect(tieneJugadaLegal(vacio(), 1)).toBe(true);
    expect(tieneJugadaLegal(Array<CellValue>(36).fill(1), 2)).toBe(false);
    const b = Array<CellValue>(36).fill(1);
    b[idx(0, 0)] = null;
    expect(tieneJugadaLegal(b, 2)).toBe(false); // vecina de fichas de J1
    expect(tieneJugadaLegal(b, 1)).toBe(true);
  });
});

describe('partidas aleatorias', () => {
  it('siempre terminan y el ganador es quien jugó último', () => {
    for (let p = 0; p < 300; p++) {
      let s = createInitialState();
      let n = 0;
      while (s.status === 'playing') {
        const legales = [];
        for (let i = 0; i < 36; i++) {
          if (casillaLegal(s.board, i, s.currentPlayer)) legales.push(i);
        }
        expect(legales.length).toBeGreaterThan(0);
        s = playMove(s, legales[Math.floor(Math.random() * legales.length)]);
        expect(++n).toBeLessThanOrEqual(36);
      }
      expect(s.winner).toBe(s.currentPlayer);
      const rival = s.winner === 1 ? 2 : 1;
      expect(tieneJugadaLegal(s.board, rival)).toBe(false);
    }
  });
});
