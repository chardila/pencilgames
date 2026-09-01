export type Player = 1 | 2;
export type GameStatus = 'playing' | 'won';

export const FILAS_INICIALES = [1, 3, 5, 7] as const;
export const TOTAL_FICHAS = 16;

export interface NimMove {
  fila: number;
  dejar: number;
}

export interface NimState {
  montones: number[];
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: { fila: number; quitadas: number } | null;
}

export function createInitialState(): NimState {
  return {
    montones: [...FILAS_INICIALES],
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

export function esJugadaValida(payload: unknown): payload is NimMove {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return false;
  }
  const { fila, dejar } = payload as Record<string, unknown>;
  return (
    typeof fila === 'number' &&
    Number.isInteger(fila) &&
    fila >= 0 &&
    fila <= 3 &&
    typeof dejar === 'number' &&
    Number.isInteger(dejar) &&
    dejar >= 0
  );
}

export function playMove(state: NimState, move: NimMove): NimState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(move)) return state;

  const actual = state.montones[move.fila];
  if (move.dejar >= actual) return state; // hay que retirar al menos una

  const montones = [...state.montones];
  montones[move.fila] = move.dejar;
  const quitadas = actual - move.dejar;
  const lastMove = { fila: move.fila, quitadas };

  if (montones.every((n) => n === 0)) {
    return {
      montones,
      currentPlayer: state.currentPlayer,
      status: 'won',
      winner: state.currentPlayer,
      lastMove,
    };
  }

  return {
    montones,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    status: 'playing',
    winner: null,
    lastMove,
  };
}
