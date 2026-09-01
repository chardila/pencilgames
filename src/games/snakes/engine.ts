export type Player = 1 | 2;
export type GameStatus = 'playing' | 'won';

export interface SnakesState {
  caminos: Record<Player, number[]>; // índices en orden; la cabeza es el último
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
}

export const TAMANO = 7;
export const TOTAL = TAMANO * TAMANO;

export const SALIDA_J1 = 8; // (fila 1, col 1)
export const SALIDA_J2 = 40; // (fila 5, col 5)

// Desplazamientos ortogonales en (df, dc): arriba, abajo, izquierda, derecha.
const VECINDAD: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

export function createInitialState(): SnakesState {
  return {
    caminos: { 1: [SALIDA_J1], 2: [SALIDA_J2] },
    currentPlayer: 1,
    status: 'playing',
    winner: null,
  };
}

export function esJugadaValida(payload: unknown): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < TOTAL
  );
}

export function usados(state: SnakesState): Set<number> {
  return new Set([...state.caminos[1], ...state.caminos[2]]);
}

export function vecinosLibres(state: SnakesState, jugador: Player): number[] {
  const camino = state.caminos[jugador];
  const cabeza = camino[camino.length - 1];
  const fila = Math.floor(cabeza / TAMANO);
  const col = cabeza % TAMANO;
  const ocupados = usados(state);
  const libres: number[] = [];
  for (const [df, dc] of VECINDAD) {
    const f = fila + df;
    const c = col + dc;
    if (f < 0 || f >= TAMANO || c < 0 || c >= TAMANO) continue;
    const n = f * TAMANO + c;
    if (!ocupados.has(n)) libres.push(n);
  }
  return libres;
}

export function playMove(state: SnakesState, index: number): SnakesState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(index)) return state;
  if (!vecinosLibres(state, state.currentPlayer).includes(index)) return state;

  const jugador = state.currentPlayer;
  const rival: Player = jugador === 1 ? 2 : 1;

  const caminos: Record<Player, number[]> = {
    1: jugador === 1 ? [...state.caminos[1], index] : state.caminos[1],
    2: jugador === 2 ? [...state.caminos[2], index] : state.caminos[2],
  };

  const siguiente: SnakesState = {
    caminos,
    currentPlayer: jugador,
    status: 'playing',
    winner: null,
  };

  if (vecinosLibres(siguiente, rival).length === 0) {
    return { ...siguiente, status: 'won', winner: jugador };
  }

  return { ...siguiente, currentPlayer: rival };
}
