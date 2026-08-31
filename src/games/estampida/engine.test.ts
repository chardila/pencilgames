import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  celdasQueCopian,
  hayMovimientoPosible,
  contar,
  playMove,
  TAMANO,
  FICHAS_POR_JUGADOR,
  type Cell,
  type Direccion,
  type EstampidaState,
  type Player,
} from './engine';

// Helpers compartidos por todas las tasks.
const idx = (fila: number, col: number) => fila * TAMANO + col;
const tableroVacio = (): Cell[] => Array<Cell>(TAMANO * TAMANO).fill(null);

describe('createInitialState', () => {
  it('crea un tablero vacío de 64 casillas en fase setup, turno del jugador 1', () => {
    const s = createInitialState();
    expect(s.board).toHaveLength(64);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.fase).toBe('setup');
    expect(s.currentPlayer).toBe(1);
    expect(s.colocadas).toEqual({ 1: 0, 2: 0 });
    expect(s.winner).toBeNull();
    expect(s.ultimasCopias).toEqual([]);
    expect(s.ultimaDireccion).toBeNull();
  });

  it('FICHAS_POR_JUGADOR es 5 y TAMANO es 8', () => {
    expect(FICHAS_POR_JUGADOR).toBe(5);
    expect(TAMANO).toBe(8);
  });
});

describe('esJugadaValida', () => {
  it('acepta colocar con celda entera en [0, 64)', () => {
    expect(esJugadaValida({ tipo: 'colocar', celda: 0 })).toBe(true);
    expect(esJugadaValida({ tipo: 'colocar', celda: 63 })).toBe(true);
  });

  it('acepta estampida con cualquiera de las 4 direcciones', () => {
    for (const dir of ['arriba', 'abajo', 'izquierda', 'derecha']) {
      expect(esJugadaValida({ tipo: 'estampida', dir })).toBe(true);
    }
  });

  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar' })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: -1 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: 64 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: 1.5 })).toBe(false);
    expect(esJugadaValida({ tipo: 'colocar', celda: '3' })).toBe(false);
    expect(esJugadaValida({ tipo: 'estampida' })).toBe(false);
    expect(esJugadaValida({ tipo: 'estampida', dir: 'diagonal' })).toBe(false);
    expect(esJugadaValida({ tipo: 'otro', celda: 3 })).toBe(false);
  });
});

describe('celdasQueCopian', () => {
  it('una ficha con la casilla derecha libre → esa casilla', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 1)]);
  });

  it('no hay envolvimiento de borde: ficha en la columna 7, dirección derecha → []', () => {
    const board = tableroVacio();
    board[idx(0, 7)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([]);
  });

  it('no hay envolvimiento de borde: ficha en la columna 0, dirección izquierda → []', () => {
    const board = tableroVacio();
    board[idx(3, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'izquierda')).toEqual([]);
  });

  it('una casilla ocupada por el rival bloquea la copia', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(0, 1)] = 2;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([]);
  });

  it('una casilla ocupada propia bloquea, pero la ficha de más allá sí copia (snapshot)', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(0, 1)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 2)]);
  });

  it('varias fichas copian simultáneamente en una dirección', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(2, 0)] = 1;
    expect(celdasQueCopian(board, 1, 'derecha')).toEqual([idx(0, 1), idx(2, 1)]);
  });

  it('solo considera las fichas del jugador indicado', () => {
    const board = tableroVacio();
    board[idx(4, 4)] = 2;
    expect(celdasQueCopian(board, 1, 'abajo')).toEqual([]);
    expect(celdasQueCopian(board, 2, 'abajo')).toEqual([idx(5, 4)]);
  });
});

describe('hayMovimientoPosible', () => {
  it('una ficha suelta en el centro → true', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    expect(hayMovimientoPosible(board, 1)).toBe(true);
  });

  it('sin fichas del jugador → false', () => {
    expect(hayMovimientoPosible(tableroVacio(), 1)).toBe(false);
  });

  it('una ficha con las 4 casillas contiguas ocupadas → false', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    board[idx(2, 3)] = 2;
    board[idx(4, 3)] = 2;
    board[idx(3, 2)] = 2;
    board[idx(3, 4)] = 2;
    expect(hayMovimientoPosible(board, 1)).toBe(false);
  });
});

describe('contar', () => {
  it('cuenta las casillas de cada jugador', () => {
    const board = tableroVacio();
    board[0] = 1;
    board[1] = 1;
    board[2] = 2;
    expect(contar(board)).toEqual({ 1: 2, 2: 1 });
  });

  it('tablero vacío → { 1: 0, 2: 0 }', () => {
    expect(contar(tableroVacio())).toEqual({ 1: 0, 2: 0 });
  });
});

// Coloca 5 fichas de cada jugador (alternando J1, J2) en las casillas dadas
// y devuelve el estado resultante (fase 'playing').
function correrSetup(celdas1: number[], celdas2: number[]): EstampidaState {
  let s = createInitialState();
  for (let k = 0; k < FICHAS_POR_JUGADOR; k++) {
    s = playMove(s, { tipo: 'colocar', celda: celdas1[k] });
    s = playMove(s, { tipo: 'colocar', celda: celdas2[k] });
  }
  return s;
}

describe('playMove — fase setup', () => {
  it('coloca la ficha del jugador en turno, incrementa su contador y alterna', () => {
    const s = playMove(createInitialState(), { tipo: 'colocar', celda: idx(2, 3) });
    expect(s.board[idx(2, 3)]).toBe(1);
    expect(s.colocadas).toEqual({ 1: 1, 2: 0 });
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('setup');
    expect(s.ultimasCopias).toEqual([idx(2, 3)]);
    expect(s.ultimaDireccion).toBeNull();
  });

  it('rechaza colocar sobre una casilla ocupada (misma referencia)', () => {
    const s1 = playMove(createInitialState(), { tipo: 'colocar', celda: 10 });
    expect(playMove(s1, { tipo: 'colocar', celda: 10 })).toBe(s1);
  });

  it('rechaza una estampida durante el setup (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'estampida', dir: 'arriba' })).toBe(s);
  });

  it('rechaza payload inválido (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'colocar', celda: 99 } as never)).toBe(s);
    expect(playMove(s, 5 as never)).toBe(s);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState();
    const boardRef = s.board;
    playMove(s, { tipo: 'colocar', celda: 0 });
    expect(boardRef.every(c => c === null)).toBe(true);
    expect(s.colocadas).toEqual({ 1: 0, 2: 0 });
  });

  it('al completar 5+5 pasa a fase playing con el turno del jugador 1', () => {
    const s = correrSetup(
      [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4)],
      [idx(7, 0), idx(7, 1), idx(7, 2), idx(7, 3), idx(7, 4)],
    );
    expect(s.fase).toBe('playing');
    expect(s.currentPlayer).toBe(1);
    expect(s.colocadas).toEqual({ 1: 5, 2: 5 });
    expect(contar(s.board)).toEqual({ 1: 5, 2: 5 });
    // la última colocación (5.ª de J2) queda resaltada
    expect(s.ultimasCopias).toEqual([idx(7, 4)]);
  });

  it('la 9.ª colocación (J1) todavía es fase setup', () => {
    let s = createInitialState();
    const c1 = [idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3), idx(0, 4)];
    const c2 = [idx(7, 0), idx(7, 1), idx(7, 2), idx(7, 3)];
    for (let k = 0; k < 4; k++) {
      s = playMove(s, { tipo: 'colocar', celda: c1[k] });
      s = playMove(s, { tipo: 'colocar', celda: c2[k] });
    }
    s = playMove(s, { tipo: 'colocar', celda: c1[4] }); // 9.ª ficha, J1
    expect(s.fase).toBe('setup');
    expect(s.currentPlayer).toBe(2);
    expect(s.colocadas).toEqual({ 1: 5, 2: 4 });
  });
});

// Construye un estado en fase 'playing' con el tablero dado.
function estadoJuego(board: Cell[], currentPlayer: Player): EstampidaState {
  return {
    board,
    fase: 'playing',
    currentPlayer,
    colocadas: { 1: FICHAS_POR_JUGADOR, 2: FICHAS_POR_JUGADOR },
    winner: null,
    ultimasCopias: [],
    ultimaDireccion: null,
  };
}

describe('playMove — fase playing (estampida)', () => {
  it('duplica cada ficha con vecina vacía en la dirección elegida y pasa el turno', () => {
    const board = tableroVacio();
    board[idx(3, 3)] = 1;
    board[idx(5, 1)] = 1;
    board[idx(0, 0)] = 2; // el rival tiene movimiento (abajo/derecha)
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(s.board[idx(3, 4)]).toBe(1);
    expect(s.board[idx(5, 2)]).toBe(1);
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('playing');
    expect(s.ultimasCopias.sort((a, b) => a - b)).toEqual([idx(3, 4), idx(5, 2)]);
    expect(s.ultimaDireccion).toBe('derecha');
  });

  it('sin encadenar: una casilla llenada este turno no genera más copias', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    board[idx(4, 4)] = 2;
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(s.board[idx(0, 1)]).toBe(1);
    expect(s.board[idx(0, 2)]).toBeNull();
    expect(s.ultimasCopias).toEqual([idx(0, 1)]);
  });

  it('rechaza una colocación durante la fase playing (misma referencia)', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1;
    const s = estadoJuego(board, 1);
    expect(playMove(s, { tipo: 'colocar', celda: 5 })).toBe(s);
  });

  it('una dirección sin copias no cambia el tablero pero cede el turno', () => {
    const board = tableroVacio();
    board[idx(0, 0)] = 1; // columna 0: 'izquierda' no copia nada
    board[idx(7, 7)] = 2; // el rival puede mover (arriba/izquierda)
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'izquierda' });
    expect(s.ultimasCopias).toEqual([]);
    expect(s.board[idx(0, 0)]).toBe(1);
    expect(contar(s.board)).toEqual({ 1: 1, 2: 1 });
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('playing');
  });

  it('salta al rival que no tiene ningún movimiento posible', () => {
    const board = tableroVacio();
    // Jugador 2 amurallado: su única ficha tiene las 4 vecinas ocupadas por J1.
    board[idx(3, 3)] = 2;
    board[idx(2, 3)] = 1;
    board[idx(4, 3)] = 1;
    board[idx(3, 2)] = 1;
    board[idx(3, 4)] = 1;
    // Jugador 1 además tiene una ficha libre para mover.
    board[idx(7, 0)] = 1;
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'arriba' });
    expect(s.board[idx(6, 0)]).toBe(1); // copió
    expect(s.currentPlayer).toBe(1);    // el rival (2) está atascado → se le salta
    expect(s.fase).toBe('playing');
  });

  it('termina con tablero lleno y gana quien tiene más casillas', () => {
    // Tablero lleno de 1 salvo dos casillas que J1 va a rellenar de golpe.
    const board = tableroVacio().map(() => 1 as Cell);
    board[idx(0, 1)] = null;
    board[idx(0, 3)] = null;
    board[idx(0, 0)] = 1; // ficha fuente para (0,1)
    board[idx(0, 2)] = 1; // ficha fuente para (0,3)
    board[idx(7, 7)] = 2; // una sola casilla de J2
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(s.board.every(c => c !== null)).toBe(true);
    expect(s.fase).toBe('finished');
    expect(s.winner).toBe(1);
  });

  it('termina en empate cuando ambos tienen la misma cantidad de casillas', () => {
    // Tablero ajedrezado (32–32); vaciamos una casilla de J1 y su vecina de
    // arriba —también de J1— la rellena estampidando 'arriba' → vuelve a 32–32.
    const board = tableroVacio();
    for (let i = 0; i < 64; i++) board[i] = i % 2 === 0 ? 1 : 2; // par → J1
    board[idx(0, 2)] = null;            // idx 2 (par) era de J1 → J1 baja a 31
    // idx(1,2) = 10 (par) es de J1: su copia 'arriba' cae en idx(0,2).
    const s = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'arriba' });
    expect(s.board.every(c => c !== null)).toBe(true);
    expect(s.fase).toBe('finished');
    expect(contar(s.board)).toEqual({ 1: 32, 2: 32 });
    expect(s.winner).toBeNull();
  });

  it('no permite más jugadas tras terminar (misma referencia)', () => {
    const board = tableroVacio().map(() => 1 as Cell);
    board[idx(0, 1)] = null;
    board[idx(0, 0)] = 1;
    const ganado = playMove(estadoJuego(board, 1), { tipo: 'estampida', dir: 'derecha' });
    expect(ganado.fase).toBe('finished');
    expect(playMove(ganado, { tipo: 'estampida', dir: 'abajo' })).toBe(ganado);
  });
});

describe('fuzzing — partidas aleatorias completas', () => {
  it('500 partidas: siempre termina con tablero lleno y ganador coherente', () => {
    for (let partida = 0; partida < 500; partida++) {
      let s = createInitialState();

      while (s.fase === 'setup') {
        const vacias: number[] = [];
        s.board.forEach((c, i) => {
          if (c === null) vacias.push(i);
        });
        const celda = vacias[Math.floor(Math.random() * vacias.length)];
        s = playMove(s, { tipo: 'colocar', celda });
      }

      let iteraciones = 0;
      while (s.fase === 'playing') {
        expect(iteraciones++).toBeLessThan(200);
        const vivas = (
          ['arriba', 'abajo', 'izquierda', 'derecha'] as Direccion[]
        ).filter(d => celdasQueCopian(s.board, s.currentPlayer, d).length > 0);
        // Mientras queden casillas vacías, el jugador en turno nunca está atascado.
        expect(vivas.length).toBeGreaterThan(0);
        const dir = vivas[Math.floor(Math.random() * vivas.length)];
        const antes = contar(s.board);
        s = playMove(s, { tipo: 'estampida', dir });
        const despues = contar(s.board);
        expect(despues[1]).toBeGreaterThanOrEqual(antes[1]);
        expect(despues[2]).toBeGreaterThanOrEqual(antes[2]);
      }

      expect(s.fase).toBe('finished');
      expect(s.board.every(c => c !== null)).toBe(true);
      const fin = contar(s.board);
      expect(fin[1] + fin[2]).toBe(64);
      if (fin[1] === fin[2]) expect(s.winner).toBeNull();
      else expect(s.winner).toBe(fin[1] > fin[2] ? 1 : 2);
    }
  });
});
