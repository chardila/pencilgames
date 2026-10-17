import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  esLegal,
  casillasLegales,
  puntajes,
  playMove,
  vecinas,
  TAMANO,
  TOTAL,
  INICIO_J1,
  INICIO_J2,
  type Player,
  type WalkingDotsState,
} from './engine';

const idx = (f: number, c: number) => f * TAMANO + c;
const vacio = (): (Player | null)[] => Array<Player | null>(TOTAL).fill(null);

describe('createInitialState', () => {
  it('7×7 con un punto inicial por jugador, empieza J1', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(49);
    expect(s.board[INICIO_J1]).toBe(1);
    expect(s.board[INICIO_J2]).toBe(2);
    expect(s.board.filter(c => c !== null)).toHaveLength(2);
    expect(s.currentPlayer).toBe(1);
    expect(s.pasesSeguidos).toBe(0);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta casillas [0, 49) y «pasar»', () => {
    expect(esJugadaValida(0)).toBe(true);
    expect(esJugadaValida(48)).toBe(true);
    expect(esJugadaValida('pasar')).toBe(true);
  });
  it('rechaza lo demás', () => {
    for (const x of [-1, 49, 1.5, 'x', null, {}, undefined]) {
      expect(esJugadaValida(x)).toBe(false);
    }
  });
});

describe('legalidad', () => {
  it('solo junto a un punto propio, ortogonal, y en casilla vacía', () => {
    const s = createInitialState();
    expect(casillasLegales(s.board, 1).sort((a, b) => a - b)).toEqual(
      vecinas(INICIO_J1).sort((a, b) => a - b),
    );
    expect(esLegal(s.board, idx(2, 2), 1)).toBe(false); // diagonal
    expect(esLegal(s.board, INICIO_J1, 1)).toBe(false); // ocupada
    expect(esLegal(s.board, idx(1, 2), 2)).toBe(false); // junto a rival, no a propio
  });
  it('no envuelve filas', () => {
    const b = vacio();
    b[idx(0, 6)] = 1;
    expect(esLegal(b, idx(1, 0), 1)).toBe(false);
    expect(esLegal(b, idx(1, 6), 1)).toBe(true);
  });
});

describe('playMove', () => {
  it('coloca, alterna turno, reinicia pases y registra lastMove', () => {
    const s = playMove(createInitialState(), idx(1, 2));
    expect(s.board[idx(1, 2)]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    expect(s.lastMove).toBe(idx(1, 2));
  });
  it('ignora jugadas ilegales devolviendo el mismo estado', () => {
    const s = createInitialState();
    expect(playMove(s, idx(3, 3))).toBe(s);
    expect(playMove(s, INICIO_J1)).toBe(s);
    expect(playMove(s, 99 as never)).toBe(s);
  });
  it('no muta el estado anterior', () => {
    const s = createInitialState();
    playMove(s, idx(1, 2));
    expect(s.board[idx(1, 2)]).toBeNull();
  });
  it('un pase cede el turno; una jugada entre pases reinicia la cuenta', () => {
    let s = playMove(createInitialState(), 'pasar');
    expect(s.currentPlayer).toBe(2);
    expect(s.pasesSeguidos).toBe(1);
    expect(s.status).toBe('playing');
    s = playMove(s, idx(5, 4));
    expect(s.pasesSeguidos).toBe(0);
    s = playMove(s, 'pasar');
    expect(s.pasesSeguidos).toBe(1);
    expect(s.status).toBe('playing');
  });
  it('dos pases seguidos terminan la partida y puntúa por área', () => {
    let s = playMove(createInitialState(), 'pasar');
    s = playMove(s, 'pasar');
    expect(s.status).toBe('finished');
    // tablero casi vacío: ninguna zona es de uno solo → 1 a 1, empate
    expect(s.winner).toBe('draw');
    expect(playMove(s, idx(1, 2))).toBe(s);
    expect(playMove(s, 'pasar')).toBe(s);
  });
});

describe('puntajes (territorio)', () => {
  it('cuenta puntos y zonas vacías rodeadas solo por uno', () => {
    // J1 cierra la esquina: (0,1),(1,0),(1,1) rodean (0,0).
    const b = vacio();
    b[idx(0, 1)] = 1;
    b[idx(1, 0)] = 1;
    b[idx(1, 1)] = 1;
    b[idx(6, 6)] = 2;
    const p = puntajes(b);
    expect(p.puntos).toEqual({ 1: 3, 2: 1 });
    expect(p.territorio[1]).toBe(1);
    expect(p.duenoDeVacia[idx(0, 0)]).toBe(1);
    // el resto del tablero lo tocan ambos: de nadie
    expect(p.territorio[2]).toBe(0);
    expect(p.total).toEqual({ 1: 4, 2: 1 });
  });
  it('una zona que toca a ambos, o a nadie, no puntúa', () => {
    const b = vacio();
    expect(puntajes(b).total).toEqual({ 1: 0, 2: 0 });
    b[0] = 1;
    b[TOTAL - 1] = 2;
    expect(puntajes(b).territorio).toEqual({ 1: 0, 2: 0 });
  });
  it('si solo hay puntos de uno, toda la zona vacía es suya', () => {
    const b = vacio();
    b[idx(3, 3)] = 1;
    const p = puntajes(b);
    expect(p.total[1]).toBe(49);
    expect(p.total[2]).toBe(0);
  });
});

describe('fin de partida con ganador', () => {
  it('un jugador dominante gana', () => {
    const board = vacio();
    // J1 aísla la columna 0 completa (zona de 7 vacías contra un muro).
    for (let f = 0; f < TAMANO; f++) board[idx(f, 1)] = 1;
    board[idx(3, 6)] = 2;
    const s: WalkingDotsState = { ...createInitialState(), board, pasesSeguidos: 1 };
    const fin = playMove(s, 'pasar');
    expect(fin.status).toBe('finished');
    // J1: 7 puntos + 7 de la columna 0 = 14; J2: 1 punto, lo demás es de nadie
    expect(puntajes(board).total).toEqual({ 1: 14, 2: 1 });
    expect(fin.winner).toBe(1);
  });
});

describe('partidas aleatorias', () => {
  it('siempre terminan con un ganador coherente con el puntaje', () => {
    for (let p = 0; p < 300; p++) {
      let s = createInitialState();
      let n = 0;
      while (s.status === 'playing') {
        const legales = casillasLegales(s.board, s.currentPlayer);
        const pasar = legales.length === 0 || Math.random() < 0.05;
        s = playMove(s, pasar ? 'pasar' : legales[Math.floor(Math.random() * legales.length)]);
        expect(++n).toBeLessThan(200);
      }
      const { total } = puntajes(s.board);
      const esperado = total[1] > total[2] ? 1 : total[2] > total[1] ? 2 : 'draw';
      expect(s.winner).toBe(esperado);
      expect(s.pasesSeguidos).toBeGreaterThanOrEqual(2);
    }
  });
});
