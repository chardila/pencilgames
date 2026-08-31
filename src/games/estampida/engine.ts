export type Player = 1 | 2;
export type Cell = Player | null;
export type Direccion = 'arriba' | 'abajo' | 'izquierda' | 'derecha';
export type Fase = 'setup' | 'playing' | 'finished';

export type Move =
  | { tipo: 'colocar'; celda: number }
  | { tipo: 'estampida'; dir: Direccion };

export interface EstampidaState {
  board: Cell[];
  fase: Fase;
  currentPlayer: Player;
  colocadas: Record<Player, number>;
  winner: Player | null;
  ultimasCopias: number[];
  ultimaDireccion: Direccion | null;
}

export const TAMANO = 8;
export const FICHAS_POR_JUGADOR = 5;
const TOTAL = TAMANO * TAMANO;

const DIRECCIONES: Direccion[] = ['arriba', 'abajo', 'izquierda', 'derecha'];

export function createInitialState(): EstampidaState {
  return {
    board: Array<Cell>(TOTAL).fill(null),
    fase: 'setup',
    currentPlayer: 1,
    colocadas: { 1: 0, 2: 0 },
    winner: null,
    ultimasCopias: [],
    ultimaDireccion: null,
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (p.tipo === 'colocar') {
    return (
      typeof p.celda === 'number' &&
      Number.isInteger(p.celda) &&
      p.celda >= 0 &&
      p.celda < TOTAL
    );
  }
  if (p.tipo === 'estampida') {
    return (
      typeof p.dir === 'string' &&
      (DIRECCIONES as string[]).includes(p.dir)
    );
  }
  return false;
}

/**
 * Índice de la casilla contigua a `celda` en la dirección `dir`, o `null` si
 * `celda` está en el borde correspondiente (sin envolvimiento).
 */
function destinoEnDireccion(celda: number, dir: Direccion): number | null {
  const fila = Math.floor(celda / TAMANO);
  const col = celda % TAMANO;
  if (dir === 'arriba') return fila > 0 ? celda - TAMANO : null;
  if (dir === 'abajo') return fila < TAMANO - 1 ? celda + TAMANO : null;
  if (dir === 'izquierda') return col > 0 ? celda - 1 : null;
  return col < TAMANO - 1 ? celda + 1 : null; // 'derecha'
}

/**
 * Casillas destino que recibirían una copia de `player` si estampidara en
 * `dir`, calculadas desde un snapshot único de `board`: cada ficha de
 * `player` cuya casilla contigua en `dir` esté dentro del tablero y vacía.
 * En orden ascendente de índice de fuente.
 */
export function celdasQueCopian(
  board: Cell[],
  player: Player,
  dir: Direccion,
): number[] {
  const objetivos: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] !== player) continue;
    const destino = destinoEnDireccion(i, dir);
    if (destino !== null && board[destino] === null) objetivos.push(destino);
  }
  return objetivos;
}

export function hayMovimientoPosible(board: Cell[], player: Player): boolean {
  return DIRECCIONES.some(
    dir => celdasQueCopian(board, player, dir).length > 0,
  );
}

export function contar(board: Cell[]): Record<Player, number> {
  let unos = 0;
  let doses = 0;
  for (const c of board) {
    if (c === 1) unos++;
    else if (c === 2) doses++;
  }
  return { 1: unos, 2: doses };
}

/**
 * Decide el estado tras aplicar una jugada (o al arrancar la fase 'playing').
 * `candidatoTurno` es a quién le tocaría normalmente. Reglas:
 * - tablero lleno (o, defensivamente, ninguno puede mover) → 'finished' con
 *   `winner` por conteo de casillas (`null` si empatan);
 * - si `candidatoTurno` no puede mover pero el otro sí → se le salta;
 * - en otro caso → 'playing' con `currentPlayer = candidatoTurno`.
 */
function cerrarTurno(
  board: Cell[],
  colocadas: Record<Player, number>,
  ultimasCopias: number[],
  ultimaDireccion: Direccion | null,
  candidatoTurno: Player,
): EstampidaState {
  const otro: Player = candidatoTurno === 1 ? 2 : 1;
  const lleno = board.every(c => c !== null);
  const candidatoPuede = hayMovimientoPosible(board, candidatoTurno);
  const otroPuede = hayMovimientoPosible(board, otro);

  if (lleno || (!candidatoPuede && !otroPuede)) {
    const c = contar(board);
    const winner: Player | null = c[1] === c[2] ? null : c[1] > c[2] ? 1 : 2;
    return {
      board,
      fase: 'finished',
      currentPlayer: candidatoTurno,
      colocadas,
      winner,
      ultimasCopias,
      ultimaDireccion,
    };
  }

  return {
    board,
    fase: 'playing',
    currentPlayer: candidatoPuede ? candidatoTurno : otro,
    colocadas,
    winner: null,
    ultimasCopias,
    ultimaDireccion,
  };
}

export function playMove(state: EstampidaState, move: Move): EstampidaState {
  if (state.fase === 'finished') return state;
  if (!esJugadaValida(move)) return state;

  if (state.fase === 'setup') {
    if (move.tipo !== 'colocar') return state;
    if (state.board[move.celda] !== null) return state;

    const board = [...state.board];
    board[move.celda] = state.currentPlayer;
    const colocadas: Record<Player, number> = {
      1: state.colocadas[1] + (state.currentPlayer === 1 ? 1 : 0),
      2: state.colocadas[2] + (state.currentPlayer === 2 ? 1 : 0),
    };

    const completo =
      colocadas[1] >= FICHAS_POR_JUGADOR && colocadas[2] >= FICHAS_POR_JUGADOR;

    if (completo) {
      // Arranca 'playing'; el Jugador 1 mueve primero (regla de salto en
      // cerrarTurno cubre el caso degenerado de que ya no pudiera).
      return cerrarTurno(board, colocadas, [move.celda], null, 1);
    }

    return {
      board,
      fase: 'setup',
      currentPlayer: state.currentPlayer === 1 ? 2 : 1,
      colocadas,
      winner: null,
      ultimasCopias: [move.celda],
      ultimaDireccion: null,
    };
  }

  // state.fase === 'playing'
  if (move.tipo !== 'estampida') return state;

  const objetivos = celdasQueCopian(state.board, state.currentPlayer, move.dir);
  const board = [...state.board];
  for (const t of objetivos) board[t] = state.currentPlayer;

  const rival: Player = state.currentPlayer === 1 ? 2 : 1;
  return cerrarTurno(board, state.colocadas, objetivos, move.dir, rival);
}
