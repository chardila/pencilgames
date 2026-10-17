export type Player = 1 | 2;
export type GameStatus = 'playing' | 'finished';

export interface KropkiState {
  /** Dueño del punto colocado en cada intersección (null = vacía). */
  board: (Player | null)[];
  /** Punto capturado: ya no sirve de muro para su dueño. Permanente. */
  capturado: boolean[];
  /** Dueño del territorio que cubre la intersección; ahí no se juega. */
  territorio: (Player | null)[];
  /** Puntos rivales capturados por cada jugador. */
  scores: Record<Player, number>;
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | 'draw' | null;
  lastMove: number | null;
}

export const TAMANO = 8;
export const TOTAL = TAMANO * TAMANO;

export function createInitialState(): KropkiState {
  return {
    board: Array<Player | null>(TOTAL).fill(null),
    capturado: Array<boolean>(TOTAL).fill(false),
    territorio: Array<Player | null>(TOTAL).fill(null),
    scores: { 1: 0, 2: 0 },
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    lastMove: null,
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

/** Se puede colocar si está vacía y no es territorio de nadie. */
export function esLegal(state: KropkiState, index: number): boolean {
  return (
    esJugadaValida(index) &&
    state.board[index] === null &&
    state.territorio[index] === null
  );
}

export function hayJugada(state: KropkiState): boolean {
  for (let i = 0; i < TOTAL; i++) if (esLegal(state, i)) return true;
  return false;
}

/** Vecinas ortogonales. */
function vecinas4(i: number): number[] {
  const f = Math.floor(i / TAMANO);
  const c = i % TAMANO;
  const res: number[] = [];
  if (f > 0) res.push(i - TAMANO);
  if (c > 0) res.push(i - 1);
  if (c < TAMANO - 1) res.push(i + 1);
  if (f < TAMANO - 1) res.push(i + TAMANO);
  return res;
}

/** Vecinas en las 8 direcciones: así se encadenan los muros de un jugador. */
export function vecinas8(i: number): number[] {
  const f = Math.floor(i / TAMANO);
  const c = i % TAMANO;
  const res: number[] = [];
  for (let df = -1; df <= 1; df++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (df === 0 && dc === 0) continue;
      const ff = f + df;
      const cc = c + dc;
      if (ff < 0 || ff >= TAMANO || cc < 0 || cc >= TAMANO) continue;
      res.push(ff * TAMANO + cc);
    }
  }
  return res;
}

const esBorde = (i: number): boolean => {
  const f = Math.floor(i / TAMANO);
  const c = i % TAMANO;
  return f === 0 || c === 0 || f === TAMANO - 1 || c === TAMANO - 1;
};

/**
 * Componentes (conexión ortogonal) de las intersecciones que NO son muro de
 * `jugador` (muro = punto suyo sin capturar) y no tocan el borde del tablero:
 * lo que su cadena de puntos deja cerrado. Una cadena en 8 direcciones es
 * equivalente a una barrera para la conexión en 4 direcciones.
 */
function zonasCerradas(state: KropkiState, board: (Player | null)[], jugador: Player): number[][] {
  const esMuro = (i: number) => board[i] === jugador && !state.capturado[i];
  const visto = Array<boolean>(TOTAL).fill(false);
  const zonas: number[][] = [];
  for (let inicio = 0; inicio < TOTAL; inicio++) {
    if (visto[inicio] || esMuro(inicio)) continue;
    const zona: number[] = [];
    let abierta = false;
    const pila = [inicio];
    visto[inicio] = true;
    while (pila.length > 0) {
      const i = pila.pop()!;
      zona.push(i);
      if (esBorde(i)) abierta = true;
      for (const v of vecinas4(i)) {
        if (!visto[v] && !esMuro(v)) {
          visto[v] = true;
          pila.push(v);
        }
      }
    }
    if (!abierta) zonas.push(zona);
  }
  return zonas;
}

export function playMove(state: KropkiState, index: number): KropkiState {
  if (state.status !== 'playing') return state;
  if (!esLegal(state, index)) return state;

  const jugador = state.currentPlayer;
  const rival: Player = jugador === 1 ? 2 : 1;

  const board = [...state.board];
  board[index] = jugador;
  const capturado = [...state.capturado];
  const territorio = [...state.territorio];
  const scores = { ...state.scores };

  for (const zona of zonasCerradas(state, board, jugador)) {
    for (const i of zona) {
      if (territorio[i] === null) territorio[i] = jugador;
      if (board[i] === rival && !capturado[i]) {
        capturado[i] = true;
        scores[jugador]++;
      }
    }
  }

  const siguiente: KropkiState = {
    board,
    capturado,
    territorio,
    scores,
    currentPlayer: rival,
    status: 'playing',
    winner: null,
    lastMove: index,
  };

  // Las intersecciones libres son comunes: sin ninguna, termina la partida.
  if (!hayJugada(siguiente)) {
    return {
      ...siguiente,
      currentPlayer: jugador,
      status: 'finished',
      winner:
        scores[1] > scores[2] ? 1 : scores[2] > scores[1] ? 2 : 'draw',
    };
  }
  return siguiente;
}
