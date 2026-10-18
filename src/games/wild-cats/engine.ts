export type Player = 1 | 2;
export type Celda = Player | null;

export const LADO = 5;
export const CELDAS = LADO * LADO;
export const LARGO_LINEA = 4;
export const MAX_RONDAS = 40;

export interface Revelacion {
  /** Celda elegida por cada jugador en la ronda. */
  elecciones: Record<Player, number>;
  /** Ambos eligieron la misma celda. */
  choque: boolean;
}

export interface WildCatsState {
  tablero: Celda[];
  /** Quién debe elegir ahora (J1 primero, luego J2). */
  currentPlayer: Player;
  /** Elección secreta pendiente de J1 durante el turno de J2. */
  eleccionJ1: number | null;
  /** Celda vetada esta ronda (la que chocó en la anterior). */
  vetada: number | null;
  ronda: number;
  ultimaRevelacion: Revelacion | null;
  fase: 'jugando' | 'finished';
  winner: Player | null;
}

export interface Move {
  celda: number;
}

/** Las 28 líneas de 4 índices: filas, columnas y diagonales dentro del tablero. */
export const LINEAS: number[][] = (() => {
  const dirs: [number, number][] = [
    [0, 1], // →
    [1, 0], // ↓
    [1, 1], // ↘
    [1, -1], // ↙
  ];
  const lineas: number[][] = [];
  for (let f = 0; f < LADO; f++) {
    for (let c = 0; c < LADO; c++) {
      for (const [df, dc] of dirs) {
        const ff = f + df * (LARGO_LINEA - 1);
        const cc = c + dc * (LARGO_LINEA - 1);
        if (ff < 0 || ff >= LADO || cc < 0 || cc >= LADO) continue;
        lineas.push(
          Array.from({ length: LARGO_LINEA }, (_, k) => (f + df * k) * LADO + (c + dc * k)),
        );
      }
    }
  }
  return lineas;
})();

export function createInitialState(): WildCatsState {
  return {
    tablero: Array<Celda>(CELDAS).fill(null),
    currentPlayer: 1,
    eleccionJ1: null,
    vetada: null,
    ronda: 1,
    ultimaRevelacion: null,
    fase: 'jugando',
    winner: null,
  };
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (typeof payload !== 'object' || payload === null) return false;
  const celda = (payload as { celda?: unknown }).celda;
  return (
    typeof celda === 'number' && Number.isInteger(celda) && celda >= 0 && celda < CELDAS
  );
}

/** Vacías menos la vetada; si no queda ninguna, todas las vacías. */
export function celdasElegibles(state: WildCatsState): number[] {
  const vacias: number[] = [];
  for (let i = 0; i < CELDAS; i++) if (state.tablero[i] === null) vacias.push(i);
  const libres = vacias.filter((i) => i !== state.vetada);
  return libres.length > 0 ? libres : vacias;
}

/** Primera línea de 4 del jugador, o null. */
export function lineaGanadora(tablero: Celda[], jugador: Player): number[] | null {
  return LINEAS.find((l) => l.every((i) => tablero[i] === jugador)) ?? null;
}

/** Resuelve una elección. Jugada ilegal -> misma referencia. Nunca muta `state`. */
export function playMove(state: WildCatsState, move: Move): WildCatsState {
  if (state.fase !== 'jugando') return state;
  if (!celdasElegibles(state).includes(move.celda)) return state;

  if (state.currentPlayer === 1) {
    return { ...state, eleccionJ1: move.celda, currentPlayer: 2 };
  }

  const a = state.eleccionJ1;
  if (a === null) return state;
  const b = move.celda;
  const choque = a === b;
  const tablero = state.tablero.slice();
  if (!choque) {
    tablero[a] = 1;
    tablero[b] = 2;
  }
  const ultimaRevelacion: Revelacion = { elecciones: { 1: a, 2: b }, choque };
  const vetada = choque ? a : null;

  const g1 = lineaGanadora(tablero, 1) !== null;
  const g2 = lineaGanadora(tablero, 2) !== null;
  const lleno = tablero.every((c) => c !== null);
  if (g1 || g2 || lleno || state.ronda === MAX_RONDAS) {
    const winner: Player | null = g1 && !g2 ? 1 : g2 && !g1 ? 2 : null;
    return {
      ...state,
      tablero,
      vetada,
      ultimaRevelacion,
      eleccionJ1: null,
      fase: 'finished',
      winner,
    };
  }
  return {
    ...state,
    tablero,
    vetada,
    ultimaRevelacion,
    eleccionJ1: null,
    currentPlayer: 1,
    ronda: state.ronda + 1,
  };
}
