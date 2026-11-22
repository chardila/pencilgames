import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { playMove, type CellValue, type Player, type TresEnRayaState } from './engine';

const LINEAS_GANADORAS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const CENTRO_Y_ESQUINAS = [4, 0, 2, 6, 8] as const;

function casillasLibres(board: readonly CellValue[]): number[] {
  const libres: number[] = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) libres.push(i);
  }
  return libres;
}

function buscarGanadorasEnUno(state: TresEnRayaState): number[] {
  return casillasLibres(state.board).filter(i => playMove(state, i).status === 'won');
}

function buscarBloqueosEnUno(state: TresEnRayaState): number[] {
  const rival: Player = state.currentPlayer === 'X' ? 'O' : 'X';
  const comoRival: TresEnRayaState = { ...state, currentPlayer: rival };
  return buscarGanadorasEnUno(comoRival);
}

function evaluarTerminal(board: readonly CellValue[], ia: Player): number | null {
  for (const [a, b, c] of LINEAS_GANADORAS) {
    const v = board[a];
    if (v !== null && v === board[b] && v === board[c]) {
      return v === ia ? 1 : -1;
    }
  }
  return board.every(c => c !== null) ? 0 : null;
}

function minimax(
  board: CellValue[],
  turno: Player,
  ia: Player,
  profundidad: number,
  memo: Map<string, number>
): number {
  const terminal = evaluarTerminal(board, ia);
  if (terminal !== null) {
    if (terminal === 0) return 0;
    return terminal > 0 ? 10 - profundidad : profundidad - 10;
  }

  const clave = `${turno}:${board.map(c => c ?? '.').join('')}`;
  const cacheado = memo.get(clave);
  if (cacheado !== undefined) return cacheado;

  const esMax = turno === ia;
  let mejor = esMax ? -Infinity : Infinity;
  const siguiente: Player = turno === 'X' ? 'O' : 'X';

  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;
    board[i] = turno;
    const valor = minimax(board, siguiente, ia, profundidad + 1, memo);
    board[i] = null;
    mejor = esMax ? Math.max(mejor, valor) : Math.min(mejor, valor);
  }

  memo.set(clave, mejor);
  return mejor;
}

function elegirDificil(state: TresEnRayaState, rng: Rng): number {
  const libres = casillasLibres(state.board);
  // Con tablero vacío todas las simetrías óptimas tienen el mismo valor minimax;
  // elegir centro o esquina evita explorar el árbol completo en la jugada inicial.
  if (libres.length === 9) {
    return elegirAlAzar([0, 2, 4, 6, 8], rng);
  }
  const board = [...state.board];
  const ia = state.currentPlayer;
  const rival: Player = ia === 'X' ? 'O' : 'X';
  const memo = new Map<string, number>();

  let mejorPuntaje = -Infinity;
  let mejores: number[] = [];

  for (const i of libres) {
    board[i] = ia;
    const puntaje = minimax(board, rival, ia, 0, memo);
    board[i] = null;
    if (puntaje > mejorPuntaje) {
      mejorPuntaje = puntaje;
      mejores = [i];
    } else if (puntaje === mejorPuntaje) {
      mejores.push(i);
    }
  }

  return elegirAlAzar(mejores, rng);
}

/**
 * Elige la casilla (0–8) para el turno actual en Tres en raya según la dificultad.
 * Devuelve `-1` si no quedan casillas disponibles.
 */
export function elegirMovimiento(
  state: TresEnRayaState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const libres = casillasLibres(state.board);
  if (libres.length === 0) return -1;

  if (dificultad === 'facil') {
    const ganadoras = buscarGanadorasEnUno(state);
    if (ganadoras.length > 0 && (libres.length === ganadoras.length || rng() < 0.3)) {
      return elegirAlAzar(ganadoras, rng);
    }
    return elegirAlAzar(libres, rng);
  }

  if (dificultad === 'medio') {
    const ganadoras = buscarGanadorasEnUno(state);
    if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);

    const bloqueos = buscarBloqueosEnUno(state);
    if (bloqueos.length > 0) return elegirAlAzar(bloqueos, rng);

    const tacticas = CENTRO_Y_ESQUINAS.filter(i => state.board[i] === null);
    if (tacticas.length > 0 && rng() < 0.5) {
      return elegirAlAzar(tacticas, rng);
    }
    return elegirAlAzar(libres, rng);
  }

  return elegirDificil(state, rng);
}
