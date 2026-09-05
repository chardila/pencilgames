export type Player = 1 | 2;
export type EdgeDir = 'h' | 'v';

export interface Edge {
  type: EdgeDir;
  row: number;
  col: number;
}

export interface BridgItState {
  redH: boolean[][];  // [6][5]  R(r,c)-R(r,c+1)
  redV: boolean[][];  // [5][6]  R(r,c)-R(r+1,c)
  blueH: boolean[][]; // [5][4]  B(r,c)-B(r,c+1)
  blueV: boolean[][]; // [4][5]  B(r,c)-B(r+1,c)
  currentPlayer: Player;
  status: 'playing' | 'won';
  winner: Player | null;
  winningPath: Array<{ r: number; c: number }> | null;
  lastMove: { player: Player; edge: Edge } | null;
}

function crearMatriz(filas: number, columnas: number): boolean[][] {
  return Array.from({ length: filas }, () => Array<boolean>(columnas).fill(false));
}

export function createInitialState(): BridgItState {
  return {
    redH: crearMatriz(6, 5),
    redV: crearMatriz(5, 6),
    blueH: crearMatriz(5, 4),
    blueV: crearMatriz(4, 5),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    winningPath: null,
    lastMove: null,
  };
}

export function slotAToEdge(player: Player, r: number, c: number): Edge | null {
  if (player === 1) {
    if (r < 0 || r > 5 || c < 0 || c > 4) return null;
    return { type: 'h', row: r, col: c };
  }
  const br = r - 1;
  if (br < 0 || br > 3 || c < 0 || c > 4) return null;
  return { type: 'v', row: br, col: c };
}

export function slotBToEdge(player: Player, r: number, c: number): Edge | null {
  if (player === 1) {
    if (r < 0 || r > 4 || c < 0 || c > 5) return null;
    return { type: 'v', row: r, col: c };
  }
  const bc = c - 1;
  if (r < 0 || r > 4 || bc < 0 || bc > 3) return null;
  return { type: 'h', row: r, col: bc };
}

export function getSlotAStatus(
  state: BridgItState,
  r: number,
  c: number
): { drawn: boolean; owner: Player | null } {
  if (state.redH[r]?.[c]) return { drawn: true, owner: 1 };
  const br = r - 1;
  if (br >= 0 && br <= 3 && state.blueV[br]?.[c]) return { drawn: true, owner: 2 };
  return { drawn: false, owner: null };
}

export function getSlotBStatus(
  state: BridgItState,
  r: number,
  c: number
): { drawn: boolean; owner: Player | null } {
  if (state.redV[r]?.[c]) return { drawn: true, owner: 1 };
  const bc = c - 1;
  if (bc >= 0 && bc <= 3 && state.blueH[r]?.[bc]) return { drawn: true, owner: 2 };
  return { drawn: false, owner: null };
}

function enRangoPropio(player: Player, edge: Edge): boolean {
  if (player === 1) {
    return edge.type === 'h'
      ? edge.row >= 0 && edge.row <= 5 && edge.col >= 0 && edge.col <= 4
      : edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 5;
  }
  return edge.type === 'h'
    ? edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 3
    : edge.row >= 0 && edge.row <= 3 && edge.col >= 0 && edge.col <= 4;
}

function tieneArista(state: BridgItState, player: Player, edge: Edge): boolean {
  const matriz =
    player === 1
      ? edge.type === 'h'
        ? state.redH
        : state.redV
      : edge.type === 'h'
        ? state.blueH
        : state.blueV;
  return matriz[edge.row]?.[edge.col] ?? false;
}

// Dada la arista de `player`, retorna la arista del rival que cruza (o null
// si esa posición cae en un borde donde el rival no tiene ninguna arista
// posible ahí).
function aristaCruzada(player: Player, edge: Edge): Edge | null {
  if (player === 1) {
    if (edge.type === 'h') {
      const br = edge.row - 1;
      return br < 0 || br > 3 ? null : { type: 'v', row: br, col: edge.col };
    }
    const bc = edge.col - 1;
    return bc < 0 || bc > 3 ? null : { type: 'h', row: edge.row, col: bc };
  }
  return edge.type === 'h'
    ? { type: 'v', row: edge.row, col: edge.col + 1 }
    : { type: 'h', row: edge.row + 1, col: edge.col };
}

export function puedeJugar(state: BridgItState, edge: Edge): boolean {
  if (state.status !== 'playing') return false;
  if (!enRangoPropio(state.currentPlayer, edge)) return false;
  if (tieneArista(state, state.currentPlayer, edge)) return false;
  const cruzada = aristaCruzada(state.currentPlayer, edge);
  const rival = state.currentPlayer === 1 ? 2 : 1;
  if (cruzada && tieneArista(state, rival, cruzada)) return false;
  return true;
}

function clonarEstado(state: BridgItState): BridgItState {
  return {
    redH: state.redH.map(fila => [...fila]),
    redV: state.redV.map(fila => [...fila]),
    blueH: state.blueH.map(fila => [...fila]),
    blueV: state.blueV.map(fila => [...fila]),
    currentPlayer: state.currentPlayer,
    status: state.status,
    winner: state.winner,
    winningPath: state.winningPath,
    lastMove: state.lastMove,
  };
}

function vecinosRojo(state: BridgItState, r: number, c: number): Array<{ r: number; c: number }> {
  const vecinos: Array<{ r: number; c: number }> = [];
  if (c > 0 && state.redH[r][c - 1]) vecinos.push({ r, c: c - 1 });
  if (c < 5 && state.redH[r][c]) vecinos.push({ r, c: c + 1 });
  if (r > 0 && state.redV[r - 1][c]) vecinos.push({ r: r - 1, c });
  if (r < 5 && state.redV[r][c]) vecinos.push({ r: r + 1, c });
  return vecinos;
}

function vecinosAzul(state: BridgItState, r: number, c: number): Array<{ r: number; c: number }> {
  const vecinos: Array<{ r: number; c: number }> = [];
  if (c > 0 && state.blueH[r][c - 1]) vecinos.push({ r, c: c - 1 });
  if (c < 4 && state.blueH[r][c]) vecinos.push({ r, c: c + 1 });
  if (r > 0 && state.blueV[r - 1][c]) vecinos.push({ r: r - 1, c });
  if (r < 4 && state.blueV[r][c]) vecinos.push({ r: r + 1, c });
  return vecinos;
}

export function findWinningPath(
  state: BridgItState,
  player: Player
): Array<{ r: number; c: number }> | null {
  const size = player === 1 ? 6 : 5;
  const vecinosDe = player === 1 ? vecinosRojo : vecinosAzul;
  const clave = (r: number, c: number) => `${r},${c}`;

  const inicio: Array<{ r: number; c: number }> =
    player === 1
      ? Array.from({ length: size }, (_, c) => ({ r: 0, c }))
      : Array.from({ length: size }, (_, r) => ({ r, c: 0 }));

  const visitado = new Set<string>(inicio.map(p => clave(p.r, p.c)));
  const padre = new Map<string, { r: number; c: number } | null>();
  for (const p of inicio) padre.set(clave(p.r, p.c), null);
  const cola = [...inicio];

  let meta: { r: number; c: number } | null = null;
  while (cola.length > 0) {
    const actual = cola.shift()!;
    const llegoALaMeta = player === 1 ? actual.r === size - 1 : actual.c === size - 1;
    if (llegoALaMeta) {
      meta = actual;
      break;
    }
    for (const vecino of vecinosDe(state, actual.r, actual.c)) {
      const k = clave(vecino.r, vecino.c);
      if (!visitado.has(k)) {
        visitado.add(k);
        padre.set(k, actual);
        cola.push(vecino);
      }
    }
  }

  if (!meta) return null;

  const camino: Array<{ r: number; c: number }> = [];
  let actual: { r: number; c: number } | null = meta;
  while (actual) {
    camino.push(actual);
    actual = padre.get(clave(actual.r, actual.c)) ?? null;
  }
  return camino.reverse();
}

export function playMove(state: BridgItState, edge: Edge): BridgItState {
  if (!esJugadaValida(edge)) return state;
  if (!puedeJugar(state, edge)) return state;

  const player = state.currentPlayer;
  const next = clonarEstado(state);
  if (player === 1) {
    if (edge.type === 'h') next.redH[edge.row][edge.col] = true;
    else next.redV[edge.row][edge.col] = true;
  } else {
    if (edge.type === 'h') next.blueH[edge.row][edge.col] = true;
    else next.blueV[edge.row][edge.col] = true;
  }
  next.lastMove = { player, edge };

  const winningPath = findWinningPath(next, player);
  if (winningPath) {
    next.status = 'won';
    next.winner = player;
    next.winningPath = winningPath;
    return next;
  }

  next.currentPlayer = player === 1 ? 2 : 1;
  return next;
}

export function esJugadaValida(payload: unknown): payload is Edge {
  if (typeof payload !== 'object' || payload === null) return false;
  const candidato = payload as Record<string, unknown>;
  return (
    (candidato.type === 'h' || candidato.type === 'v') &&
    typeof candidato.row === 'number' &&
    Number.isInteger(candidato.row) &&
    candidato.row >= 0 &&
    typeof candidato.col === 'number' &&
    Number.isInteger(candidato.col) &&
    candidato.col >= 0
  );
}
