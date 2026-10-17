/**
 * Puntos Caminantes (Walking Dots) — ruleset «v1», reconstruido a partir de la
 * ficha del backlog (no hay reglas publicadas fiables):
 *  - 7×7, un punto inicial por jugador.
 *  - Turno: poner un punto en una casilla vacía contigua (ortogonal) a un punto
 *    propio, o pasar.
 *  - Dos pases seguidos terminan la partida.
 *  - Puntaje por área (módulo de territorio, `puntajes`): tus puntos más las
 *    zonas vacías cuyo contorno es solo tuyo.
 */
export type Player = 1 | 2;
export type GameStatus = 'playing' | 'finished';
export type Move = number | 'pasar';

export interface WalkingDotsState {
  board: (Player | null)[];
  currentPlayer: Player;
  /** Pases seguidos; con 2 la partida termina. */
  pasesSeguidos: number;
  status: GameStatus;
  winner: Player | 'draw' | null;
  /** Casilla de la última jugada (null si fue un pase o no hay jugada). */
  lastMove: number | null;
}

export const TAMANO = 7;
export const TOTAL = TAMANO * TAMANO;
export const INICIO_J1 = 8; // (fila 1, col 1)
export const INICIO_J2 = 40; // (fila 5, col 5)

export function createInitialState(): WalkingDotsState {
  const board = Array<Player | null>(TOTAL).fill(null);
  board[INICIO_J1] = 1;
  board[INICIO_J2] = 2;
  return {
    board,
    currentPlayer: 1,
    pasesSeguidos: 0,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (payload === 'pasar') return true;
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < TOTAL
  );
}

/** Vecinas ortogonales. */
export function vecinas(i: number): number[] {
  const f = Math.floor(i / TAMANO);
  const c = i % TAMANO;
  const res: number[] = [];
  if (f > 0) res.push(i - TAMANO);
  if (c > 0) res.push(i - 1);
  if (c < TAMANO - 1) res.push(i + 1);
  if (f < TAMANO - 1) res.push(i + TAMANO);
  return res;
}

export function esLegal(board: (Player | null)[], index: number, jugador: Player): boolean {
  if (!esJugadaValida(index) || typeof index !== 'number') return false;
  if (board[index] !== null) return false;
  return vecinas(index).some(v => board[v] === jugador);
}

export function casillasLegales(board: (Player | null)[], jugador: Player): number[] {
  const res: number[] = [];
  for (let i = 0; i < TOTAL; i++) if (esLegal(board, i, jugador)) res.push(i);
  return res;
}

export interface Puntajes {
  puntos: Record<Player, number>;
  territorio: Record<Player, number>;
  total: Record<Player, number>;
  /** Dueño de cada casilla vacía según el área (null = de nadie). */
  duenoDeVacia: (Player | null)[];
}

/**
 * Módulo de territorio: cada zona vacía (conexión ortogonal) pertenece al
 * jugador que es el único en tocarla; si la tocan ambos, o ninguno, es de nadie.
 */
export function puntajes(board: (Player | null)[]): Puntajes {
  const puntos: Record<Player, number> = { 1: 0, 2: 0 };
  const territorio: Record<Player, number> = { 1: 0, 2: 0 };
  const duenoDeVacia = Array<Player | null>(TOTAL).fill(null);
  const visto = Array<boolean>(TOTAL).fill(false);

  for (let i = 0; i < TOTAL; i++) {
    const v = board[i];
    if (v !== null) puntos[v]++;
  }

  for (let inicio = 0; inicio < TOTAL; inicio++) {
    if (board[inicio] !== null || visto[inicio]) continue;
    const zona: number[] = [];
    const toca = new Set<Player>();
    const pila = [inicio];
    visto[inicio] = true;
    while (pila.length > 0) {
      const i = pila.pop()!;
      zona.push(i);
      for (const n of vecinas(i)) {
        const vn = board[n];
        if (vn !== null) toca.add(vn);
        else if (!visto[n]) {
          visto[n] = true;
          pila.push(n);
        }
      }
    }
    if (toca.size === 1) {
      const dueno = [...toca][0];
      territorio[dueno] += zona.length;
      for (const i of zona) duenoDeVacia[i] = dueno;
    }
  }

  return {
    puntos,
    territorio,
    total: { 1: puntos[1] + territorio[1], 2: puntos[2] + territorio[2] },
    duenoDeVacia,
  };
}

export function playMove(state: WalkingDotsState, move: Move): WalkingDotsState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(move)) return state;

  const rival: Player = state.currentPlayer === 1 ? 2 : 1;

  if (move === 'pasar') {
    const pasesSeguidos = state.pasesSeguidos + 1;
    if (pasesSeguidos >= 2) {
      const { total } = puntajes(state.board);
      return {
        ...state,
        pasesSeguidos,
        status: 'finished',
        winner: total[1] > total[2] ? 1 : total[2] > total[1] ? 2 : 'draw',
        lastMove: null,
      };
    }
    return { ...state, currentPlayer: rival, pasesSeguidos, lastMove: null };
  }

  if (!esLegal(state.board, move, state.currentPlayer)) return state;
  const board = [...state.board];
  board[move] = state.currentPlayer;
  return {
    board,
    currentPlayer: rival,
    pasesSeguidos: 0,
    status: 'playing',
    winner: null,
    lastMove: move,
  };
}
