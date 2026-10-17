import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  esLegal,
  hayJugada,
  vecinas8,
  playMove,
  TAMANO,
  TOTAL,
  type KropkiState,
  type Player,
} from './engine';

const idx = (f: number, c: number) => f * TAMANO + c;

/** Juega la secuencia alternando; a partir de la misma partida. */
function jugar(secuencia: number[], inicial = createInitialState()): KropkiState {
  return secuencia.reduce((s, i) => {
    const n = playMove(s, i);
    expect(n).not.toBe(s); // cada jugada de prueba debe ser legal
    return n;
  }, inicial);
}

// Rombo de J1 alrededor de (3,3): cuatro puntos en cruz.
const ROMBO = [idx(2, 3), idx(3, 2), idx(3, 4), idx(4, 3)];

describe('createInitialState', () => {
  it('tablero vacío 8×8, empieza J1, sin capturas', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(64);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.territorio.every(c => c === null)).toBe(true);
    expect(s.capturado.every(c => !c)).toBe(true);
    expect(s.scores).toEqual({ 1: 0, 2: 0 });
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.lastMove).toBeNull();
  });
});

describe('esJugadaValida / vecinas8', () => {
  it('enteros en [0, 64)', () => {
    expect(esJugadaValida(0)).toBe(true);
    expect(esJugadaValida(63)).toBe(true);
    for (const x of [-1, 64, 1.5, '3', null, {}]) expect(esJugadaValida(x)).toBe(false);
  });
  it('vecinas8: centro 8, esquina 3, sin envolver filas', () => {
    expect(vecinas8(idx(3, 3))).toHaveLength(8);
    expect(vecinas8(0)).toHaveLength(3);
    expect(vecinas8(idx(0, 7))).not.toContain(idx(1, 0));
  });
});

describe('colocar puntos', () => {
  it('coloca, alterna turno y registra lastMove', () => {
    const s = playMove(createInitialState(), 10);
    expect(s.board[10]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    expect(s.lastMove).toBe(10);
  });
  it('rechaza casilla ocupada y fuera de rango; no muta', () => {
    const s0 = createInitialState();
    const s = playMove(s0, 10);
    expect(s0.board[10]).toBeNull();
    expect(playMove(s, 10)).toBe(s);
    expect(playMove(s, 99)).toBe(s);
  });
});

describe('captura por encierro', () => {
  it('cuatro puntos en cruz encierran y capturan el punto del centro', () => {
    // J2 pone su punto en el centro; J1 cierra el rombo en 4 jugadas.
    const s = jugar([ROMBO[0], idx(3, 3), ROMBO[1], idx(0, 0), ROMBO[2], idx(0, 7), ROMBO[3]]);
    expect(s.scores).toEqual({ 1: 1, 2: 0 });
    expect(s.capturado[idx(3, 3)]).toBe(true);
    expect(s.territorio[idx(3, 3)]).toBe(1);
  });
  it('los muros se encadenan también en diagonal', () => {
    // Rombo diagonal alrededor de (3,3): (2,2)... usa las 4 esquinas rodeando
    // un cuadrado 3×3 en diagonal-conectadas no basta; probamos el anillo
    // de 8 puntos alrededor de (3,3) con las diagonales unidas.
    const anillo = [
      idx(2, 2), idx(2, 3), idx(2, 4),
      idx(3, 2), idx(3, 4),
      idx(4, 2), idx(4, 3), idx(4, 4),
    ];
    const relleno = [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4), idx(0, 5), idx(0, 6)];
    const secuencia: number[] = [];
    anillo.forEach((a, k) => {
      secuencia.push(a);
      secuencia.push(k === 0 ? idx(3, 3) : relleno[k - 1]);
    });
    const s = jugar(secuencia);
    expect(s.scores[1]).toBe(1);
  });
  it('un encierro sin puntos rivales dentro crea territorio sin sumar', () => {
    const s = jugar([ROMBO[0], idx(0, 0), ROMBO[1], idx(0, 7), ROMBO[2], idx(7, 0), ROMBO[3]]);
    expect(s.scores).toEqual({ 1: 0, 2: 0 });
    expect(s.territorio[idx(3, 3)]).toBe(1);
    // J2 no puede jugar dentro, J1 tampoco.
    expect(esLegal(s, idx(3, 3))).toBe(false);
    expect(playMove(s, idx(3, 3))).toBe(s);
  });
  it('un punto en el borde del tablero no se puede encerrar', () => {
    // J2 en (0,2); J1 pone (0,1), (0,3) y (1,2): no hay muro «fuera» del tablero.
    const s = jugar([idx(0, 1), idx(0, 2), idx(0, 3), idx(7, 0), idx(1, 2)]);
    expect(s.scores[1]).toBe(0);
    expect(s.capturado[idx(0, 2)]).toBe(false);
    expect(s.territorio[idx(0, 2)]).toBeNull();
  });
  it('encerrar junto al borde sí vale si el interior no lo toca', () => {
    const rombo = [idx(0, 2), idx(1, 1), idx(1, 3), idx(2, 2)];
    const s = jugar([rombo[0], idx(1, 2), rombo[1], idx(7, 0), rombo[2], idx(7, 7), rombo[3]]);
    expect(s.scores[1]).toBe(1);
  });
  it('la captura es permanente y el punto capturado deja de ser muro', () => {
    const s = jugar([ROMBO[0], idx(3, 3), ROMBO[1], idx(0, 0), ROMBO[2], idx(0, 7), ROMBO[3]]);
    const muros2 = s.board.map((c, i) => c === 2 && !s.capturado[i]).filter(Boolean).length;
    expect(muros2).toBe(2); // (0,0) y (0,7); el del centro ya no cuenta
    expect(s.capturado[idx(3, 3)]).toBe(true);
  });
  it('capturar varios puntos a la vez suma todos', () => {
    // Anillo de 10 puntos de J1 alrededor de dos puntos contiguos de J2.
    const muro = [
      idx(2, 2), idx(2, 3), idx(2, 4), idx(2, 5),
      idx(3, 2), idx(3, 5),
      idx(4, 2), idx(4, 3), idx(4, 4), idx(4, 5),
    ];
    const sec: number[] = [];
    muro.forEach((m, k) => {
      sec.push(m);
      // J2: primero sus dos puntos dentro, luego puntos sueltos en la fila 7.
      sec.push(k === 0 ? idx(3, 3) : k === 1 ? idx(3, 4) : idx(7, k - 2));
    });
    const s = jugar(sec);
    expect(s.scores[1]).toBe(2);
    expect(s.territorio[idx(3, 3)]).toBe(1);
    expect(s.territorio[idx(3, 4)]).toBe(1);
  });
});

describe('fin de partida', () => {
  const casiLleno = (scores: Record<Player, number>): KropkiState => {
    const board = Array.from({ length: TOTAL }, (_, i) => (i % 2 === 0 ? 1 : 2) as Player | null);
    board[63] = null;
    return { ...createInitialState(), board, scores, currentPlayer: 2 };
  };
  it('termina al llenarse el tablero y gana quien capturó más', () => {
    const fin = playMove(casiLleno({ 1: 3, 2: 1 }), 63);
    expect(fin.status).toBe('finished');
    expect(fin.winner).toBe(1);
    expect(fin.currentPlayer).toBe(2);
    expect(playMove(fin, 0)).toBe(fin);
  });
  it('empate con las mismas capturas', () => {
    const fin = playMove(casiLleno({ 1: 2, 2: 2 }), 63);
    expect(fin.status).toBe('finished');
    expect(fin.winner).toBe('draw');
  });
  it('hayJugada ignora ocupadas y territorio', () => {
    const s = createInitialState();
    expect(hayJugada(s)).toBe(true);
    expect(hayJugada({ ...s, board: Array<Player | null>(TOTAL).fill(1) })).toBe(false);
    expect(hayJugada({ ...s, territorio: Array<Player | null>(TOTAL).fill(2) })).toBe(false);
  });
});

describe('partidas aleatorias', () => {
  it('siempre terminan en ≤64 jugadas con invariantes coherentes', () => {
    for (let p = 0; p < 300; p++) {
      let s = createInitialState();
      let n = 0;
      while (s.status === 'playing') {
        const libres: number[] = [];
        for (let i = 0; i < TOTAL; i++) if (esLegal(s, i)) libres.push(i);
        expect(libres.length).toBeGreaterThan(0);
        s = playMove(s, libres[Math.floor(Math.random() * libres.length)]);
        expect(++n).toBeLessThanOrEqual(TOTAL);
      }
      const cap = (j: Player) =>
        s.board.filter((c, i) => c === (j === 1 ? 2 : 1) && s.capturado[i]).length;
      expect(s.scores[1]).toBe(cap(1));
      expect(s.scores[2]).toBe(cap(2));
      // un punto capturado está siempre en territorio del rival
      s.board.forEach((c, i) => {
        if (s.capturado[i]) expect(s.territorio[i]).toBe(c === 1 ? 2 : 1);
      });
      expect(hayJugada(s)).toBe(false);
    }
  });
});
