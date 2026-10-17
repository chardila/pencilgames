/** 1 = Orden (quiere cinco iguales en línea), 2 = Caos (quiere impedirlo). */
export type Player = 1 | 2;
export type Marca = 'X' | 'O';
export type CellValue = Marca | null;
export type GameStatus = 'playing' | 'won';

export interface Move {
  cell: number;
  marca: Marca;
}

export interface OrdenCaosState {
  board: CellValue[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: Move | null;
  /** Las cinco casillas de la línea que dio la victoria a Orden. */
  linea: number[] | null;
}

export const TAMANO = 6;
export const LARGO = 5;
const TOTAL = TAMANO * TAMANO;

export function createInitialState(): OrdenCaosState {
  return {
    board: Array<CellValue>(TOTAL).fill(null),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastMove: null,
    linea: null,
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const { cell, marca } = payload as Record<string, unknown>;
  return (
    typeof cell === 'number' &&
    Number.isInteger(cell) &&
    cell >= 0 &&
    cell < TOTAL &&
    (marca === 'X' || marca === 'O')
  );
}

const EJES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * Primera ventana de LARGO casillas seguidas con la misma marca, o null.
 * Recorre todas las ventanas (la ficha dice «escanear todas»), lo que además
 * hace que cuente una racha de seis.
 */
export function buscarLinea(board: CellValue[]): number[] | null {
  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      for (const [df, dc] of EJES) {
        const ff = f + df * (LARGO - 1);
        const cc = c + dc * (LARGO - 1);
        if (ff < 0 || ff >= TAMANO || cc < 0 || cc >= TAMANO) continue;
        const inicio = board[f * TAMANO + c];
        if (inicio === null) continue;
        const celdas: number[] = [];
        let igual = true;
        for (let k = 0; k < LARGO; k++) {
          const i = (f + df * k) * TAMANO + (c + dc * k);
          if (board[i] !== inicio) {
            igual = false;
            break;
          }
          celdas.push(i);
        }
        if (igual) return celdas;
      }
    }
  }
  return null;
}

export function playMove(state: OrdenCaosState, move: Move): OrdenCaosState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(move)) return state;
  if (state.board[move.cell] !== null) return state;

  const board = [...state.board];
  board[move.cell] = move.marca;
  const lastMove = { cell: move.cell, marca: move.marca };

  const linea = buscarLinea(board);
  if (linea) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: 1,
      lastMove,
      linea,
    };
  }

  if (board.every(c => c !== null)) {
    return {
      board,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: 2,
      lastMove,
      linea: null,
    };
  }

  return {
    board,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove,
    linea: null,
  };
}
