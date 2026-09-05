export type Player = 1 | 2;
export type EdgeDir = 'h' | 'v';

export interface Edge {
  type: EdgeDir;
  row: number;
  col: number;
}

// Tablero real de Bridg-It (Gale): dos retículas de 30 puntos cada una,
// transpuestas entre sí (5 columnas × 6 filas para rojo, 6 columnas × 5
// filas para azul), entrelazadas en diagonal — igual que el tablero físico
// comercial ("dos retículas rectangulares interladas de 5×6").
export interface BridgItState {
  redH: boolean[][];  // [6][4]  R(r,c)-R(r,c+1), r:0-5, c:0-3
  redV: boolean[][];  // [5][5]  R(r,c)-R(r+1,c), r:0-4, c:0-4
  blueH: boolean[][]; // [5][5]  B(r,c)-B(r,c+1), r:0-4, c:0-4
  blueV: boolean[][]; // [4][6]  B(r,c)-B(r+1,c), r:0-3, c:0-5
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
    redH: crearMatriz(6, 4),
    redV: crearMatriz(5, 5),
    blueH: crearMatriz(5, 5),
    blueV: crearMatriz(4, 6),
    currentPlayer: 1,
    status: 'playing',
    winner: null,
    winningPath: null,
    lastMove: null,
  };
}

// Los puntos rojos (5 cols × 6 filas) y azules (6 cols × 5 filas) se
// entrelazan en un mismo cuadrado: R(r,c) en la posición de grilla
// (fila=2r+1, col=2c+2), B(r,c) en (fila=2r+2, col=2c+1). Las celdas
// restantes ("slots") alojan las aristas potenciales:
//
// Slot A(i,j), i,j en 0..5 (grilla fila=2i+1, col=2j+1 — celdas "impar-impar"):
//   aloja redH(i, j-1) si j-1 en [0,3], y blueV(i-1, j) si i-1 en [0,3].
//   Las 4 esquinas (i,j en {0,5}×{0,5}) no alojan ninguna arista (celda muerta).
// Slot B(i,j), i,j en 0..4 (grilla fila=2i+2, col=2j+2 — celdas "par-par"):
//   aloja redV(i,j) y blueH(i,j) siempre (sin casos de borde).

export function slotAToEdge(player: Player, i: number, j: number): Edge | null {
  if (player === 1) {
    const c = j - 1;
    if (i < 0 || i > 5 || c < 0 || c > 3) return null;
    return { type: 'h', row: i, col: c };
  }
  const r = i - 1;
  if (r < 0 || r > 3 || j < 0 || j > 5) return null;
  return { type: 'v', row: r, col: j };
}

export function slotBToEdge(player: Player, i: number, j: number): Edge | null {
  if (i < 0 || i > 4 || j < 0 || j > 4) return null;
  return player === 1 ? { type: 'v', row: i, col: j } : { type: 'h', row: i, col: j };
}

export function getSlotAStatus(
  state: BridgItState,
  i: number,
  j: number
): { drawn: boolean; owner: Player | null } {
  const c = j - 1;
  if (c >= 0 && c <= 3 && state.redH[i]?.[c]) return { drawn: true, owner: 1 };
  const r = i - 1;
  if (r >= 0 && r <= 3 && state.blueV[r]?.[j]) return { drawn: true, owner: 2 };
  return { drawn: false, owner: null };
}

export function getSlotBStatus(
  state: BridgItState,
  i: number,
  j: number
): { drawn: boolean; owner: Player | null } {
  if (state.redV[i]?.[j]) return { drawn: true, owner: 1 };
  if (state.blueH[i]?.[j]) return { drawn: true, owner: 2 };
  return { drawn: false, owner: null };
}

function enRangoPropio(player: Player, edge: Edge): boolean {
  if (player === 1) {
    return edge.type === 'h'
      ? edge.row >= 0 && edge.row <= 5 && edge.col >= 0 && edge.col <= 3
      : edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 4;
  }
  return edge.type === 'h'
    ? edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 4
    : edge.row >= 0 && edge.row <= 3 && edge.col >= 0 && edge.col <= 5;
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
// posible ahí). redV/blueH siempre se cruzan directamente (mismos r,c);
// redH/blueV se cruzan desplazados en diagonal, con casos de borde.
function aristaCruzada(player: Player, edge: Edge): Edge | null {
  if (player === 1) {
    if (edge.type === 'h') {
      // redH(r,c) cruza blueV(r-1, c+1)
      const br = edge.row - 1;
      return br < 0 || br > 3 ? null : { type: 'v', row: br, col: edge.col + 1 };
    }
    // redV(r,c) cruza blueH(r,c) directamente
    return { type: 'h', row: edge.row, col: edge.col };
  }
  if (edge.type === 'h') {
    // blueH(r,c) cruza redV(r,c) directamente
    return { type: 'v', row: edge.row, col: edge.col };
  }
  // blueV(r,c) cruza redH(r+1, c-1)
  const bc = edge.col - 1;
  return bc < 0 || bc > 3 ? null : { type: 'h', row: edge.row + 1, col: bc };
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

// Rojo: 5 columnas (0-4) × 6 filas (0-5), conecta fila 0 con fila 5.
function vecinosRojo(state: BridgItState, r: number, c: number): Array<{ r: number; c: number }> {
  const vecinos: Array<{ r: number; c: number }> = [];
  if (c > 0 && state.redH[r][c - 1]) vecinos.push({ r, c: c - 1 });
  if (c < 4 && state.redH[r][c]) vecinos.push({ r, c: c + 1 });
  if (r > 0 && state.redV[r - 1][c]) vecinos.push({ r: r - 1, c });
  if (r < 5 && state.redV[r][c]) vecinos.push({ r: r + 1, c });
  return vecinos;
}

// Azul: 6 columnas (0-5) × 5 filas (0-4), conecta columna 0 con columna 5.
function vecinosAzul(state: BridgItState, r: number, c: number): Array<{ r: number; c: number }> {
  const vecinos: Array<{ r: number; c: number }> = [];
  if (c > 0 && state.blueH[r][c - 1]) vecinos.push({ r, c: c - 1 });
  if (c < 5 && state.blueH[r][c]) vecinos.push({ r, c: c + 1 });
  if (r > 0 && state.blueV[r - 1][c]) vecinos.push({ r: r - 1, c });
  if (r < 4 && state.blueV[r][c]) vecinos.push({ r: r + 1, c });
  return vecinos;
}

export function findWinningPath(
  state: BridgItState,
  player: Player
): Array<{ r: number; c: number }> | null {
  const vecinosDe = player === 1 ? vecinosRojo : vecinosAzul;
  const clave = (r: number, c: number) => `${r},${c}`;

  // Rojo arranca en fila 0 (5 puntos, c:0-4) y busca llegar a fila 5.
  // Azul arranca en columna 0 (5 puntos, r:0-4) y busca llegar a columna 5.
  const inicio: Array<{ r: number; c: number }> =
    player === 1
      ? Array.from({ length: 5 }, (_, c) => ({ r: 0, c }))
      : Array.from({ length: 5 }, (_, r) => ({ r, c: 0 }));

  const visitado = new Set<string>(inicio.map(p => clave(p.r, p.c)));
  const padre = new Map<string, { r: number; c: number } | null>();
  for (const p of inicio) padre.set(clave(p.r, p.c), null);
  const cola = [...inicio];

  let meta: { r: number; c: number } | null = null;
  while (cola.length > 0) {
    const actual = cola.shift()!;
    const llegoALaMeta = player === 1 ? actual.r === 5 : actual.c === 5;
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
