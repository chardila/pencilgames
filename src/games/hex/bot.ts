import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import type { BoardSize, HexState, Player } from './engine';

const MAX_SIZE = 9;
const MAX_N = MAX_SIZE * MAX_SIZE; // 81
const INF = 1000;
const WIN_SCORE = 1_000_000;

// 6 direcciones hexagonales en orden horario para detectar puentes virtuales alrededor de una casilla.
const CW_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], // Noroeste
  [-1, 1], // Noreste
  [0, 1],  // Este
  [1, 0],  // Sureste
  [1, -1], // Suroeste
  [0, -1], // Oeste
];

interface HexGeo {
  size: BoardSize;
  n: number;
  validNeighbors: Uint8Array[];
  neighbors6: Uint8Array; // tamaño n * 6; 255 = fuera de tablero
  distCenter: Uint8Array;
  startCellsP1: Uint8Array;
  endCellsP1: Uint8Array;
  startCellsP2: Uint8Array;
  endCellsP2: Uint8Array;
  isStartP1: Uint8Array;
  isEndP1: Uint8Array;
  isStartP2: Uint8Array;
  isEndP2: Uint8Array;
}

function buildGeo(size: BoardSize): HexGeo {
  const n = size * size;
  const mid = Math.floor(size / 2);
  const validNeighbors: Uint8Array[] = new Array(n);
  const neighbors6 = new Uint8Array(n * 6).fill(255);
  const distCenter = new Uint8Array(n);

  const isStartP1 = new Uint8Array(n);
  const isEndP1 = new Uint8Array(n);
  const isStartP2 = new Uint8Array(n);
  const isEndP2 = new Uint8Array(n);

  const startP1: number[] = [];
  const endP1: number[] = [];
  const startP2: number[] = [];
  const endP2: number[] = [];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const dr = r - mid;
      const dc = c - mid;
      distCenter[idx] = Math.max(Math.abs(dr), Math.abs(dc), Math.abs(dr + dc));

      if (r === 0) {
        isStartP1[idx] = 1;
        startP1.push(idx);
      }
      if (r === size - 1) {
        isEndP1[idx] = 1;
        endP1.push(idx);
      }
      if (c === 0) {
        isStartP2[idx] = 1;
        startP2.push(idx);
      }
      if (c === size - 1) {
        isEndP2[idx] = 1;
        endP2.push(idx);
      }

      const nbs: number[] = [];
      for (let d = 0; d < 6; d++) {
        const nr = r + CW_DIRS[d][0];
        const nc = c + CW_DIRS[d][1];
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          const nIdx = nr * size + nc;
          neighbors6[idx * 6 + d] = nIdx;
          nbs.push(nIdx);
        }
      }
      validNeighbors[idx] = Uint8Array.from(nbs);
    }
  }

  return {
    size,
    n,
    validNeighbors,
    neighbors6,
    distCenter,
    startCellsP1: Uint8Array.from(startP1),
    endCellsP1: Uint8Array.from(endP1),
    startCellsP2: Uint8Array.from(startP2),
    endCellsP2: Uint8Array.from(endP2),
    isStartP1,
    isEndP1,
    isStartP2,
    isEndP2,
  };
}

const GEOS: Record<BoardSize, HexGeo> = {
  5: buildGeo(5),
  7: buildGeo(7),
  9: buildGeo(9),
};

// Buffers reutilizables para evitar asignaciones en la búsqueda.
const BOARD_BUF = new Uint8Array(MAX_N);
const DEQUE_BUF = new Int16Array(MAX_N * 2 + 8);

const BFS_YO_1 = new Int16Array(MAX_N);
const BFS_YO_2 = new Int16Array(MAX_N);
const BFS_RIV_1 = new Int16Array(MAX_N);
const BFS_RIV_2 = new Int16Array(MAX_N);

const TD_YO_1 = new Int16Array(MAX_N);
const TD_YO_2 = new Int16Array(MAX_N);
const TD_RIV_1 = new Int16Array(MAX_N);
const TD_RIV_2 = new Int16Array(MAX_N);

// Buffers para componentes conexas y cálculo two-distance.
const COMP_NODE = new Int16Array(MAX_N);
const COMP_QUEUE = new Uint8Array(MAX_N);
const COMP_MEMBERS = new Uint8Array(MAX_N);
const COMP_START = new Int16Array(MAX_N);
const COMP_LEN = new Int16Array(MAX_N);

const TD_POT = new Int16Array(MAX_N + 1);
const TD_MIN1 = new Int16Array(MAX_N + 1);
const TD_MIN2 = new Int16Array(MAX_N + 1);
const TD_FINAL = new Uint8Array(MAX_N + 1);
const TD_SEEN = new Int32Array(MAX_N + 1);
let tdStamp = 1;

const MAX_BUCKET = 60;
const TD_BUCKETS: number[][] = Array.from({ length: MAX_BUCKET }, () => []);
let prevMaxBucket = MAX_BUCKET - 1;

const CAND_IDX = new Uint8Array(MAX_N);
const CAND_SCORE = new Int32Array(MAX_N);

// Buffers para componentes rápidas en defensa de puentes.
const BRIDGE_COMP = new Int16Array(MAX_N);
const BRIDGE_TOUCH_START = new Uint8Array(MAX_N);
const BRIDGE_TOUCH_END = new Uint8Array(MAX_N);

function getEdgeArrays(geo: HexGeo, player: Player) {
  return player === 1
    ? {
        startCells: geo.startCellsP1,
        endCells: geo.endCellsP1,
        isStart: geo.isStartP1,
        isEnd: geo.isEndP1,
      }
    : {
        startCells: geo.startCellsP2,
        endCells: geo.endCellsP2,
        isStart: geo.isStartP2,
        isEnd: geo.isEndP2,
      };
}

/**
 * 0-1 BFS desde un borde (costo 0 en fichas propias, 1 en casillas vacías).
 */
function computeBfs01(
  board: Uint8Array,
  geo: HexGeo,
  player: Player,
  edgeCells: Uint8Array,
  outDist: Int16Array
): void {
  const rival = player === 1 ? 2 : 1;
  outDist.fill(INF, 0, geo.n);

  let head = MAX_N + 4;
  let tail = MAX_N + 4;

  for (let i = 0; i < edgeCells.length; i++) {
    const c = edgeCells[i];
    const v = board[c];
    if (v === player) {
      outDist[c] = 0;
      DEQUE_BUF[--head] = c;
    } else if (v === 0) {
      outDist[c] = 1;
      DEQUE_BUF[tail++] = c;
    }
  }

  while (head < tail) {
    const u = DEQUE_BUF[head++];
    const du = outDist[u];
    const nbs = geo.validNeighbors[u];
    for (let k = 0; k < nbs.length; k++) {
      const nb = nbs[k];
      const cell = board[nb];
      if (cell === rival) continue;
      const nd = du + (cell === player ? 0 : 1);
      if (nd < outDist[nb]) {
        outDist[nb] = nd;
        if (cell === player) {
          DEQUE_BUF[--head] = nb;
        } else {
          DEQUE_BUF[tail++] = nb;
        }
      }
    }
  }
}

/**
 * Métrica Two-Distance desde un borde sobre el grafo con componentes propias contraídas.
 */
function computeTwoDistance(
  board: Uint8Array,
  geo: HexGeo,
  player: Player,
  isTargetEdge: Uint8Array,
  outCellPot: Int16Array
): void {
  const n = geo.n;
  const edgeNode = n;
  const rival = player === 1 ? 2 : 1;

  COMP_NODE.fill(-1, 0, n);
  let totalMembers = 0;

  for (let i = 0; i < n; i++) {
    if (board[i] !== player || COMP_NODE[i] !== -1) continue;

    let qHead = 0;
    let qTail = 0;
    COMP_QUEUE[qTail++] = i;
    COMP_NODE[i] = i;
    let touchesEdge = isTargetEdge[i] === 1;

    while (qHead < qTail) {
      const curr = COMP_QUEUE[qHead++];
      const nbs = geo.validNeighbors[curr];
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k];
        if (board[nb] === player && COMP_NODE[nb] === -1) {
          COMP_NODE[nb] = i;
          COMP_QUEUE[qTail++] = nb;
          if (isTargetEdge[nb] === 1) touchesEdge = true;
        }
      }
    }

    if (touchesEdge) {
      for (let k = 0; k < qTail; k++) {
        COMP_NODE[COMP_QUEUE[k]] = edgeNode;
      }
    } else {
      COMP_START[i] = totalMembers;
      COMP_LEN[i] = qTail;
      for (let k = 0; k < qTail; k++) {
        COMP_MEMBERS[totalMembers++] = COMP_QUEUE[k];
      }
    }
  }

  TD_POT.fill(INF, 0, n + 1);
  TD_MIN1.fill(INF, 0, n + 1);
  TD_MIN2.fill(INF, 0, n + 1);
  TD_FINAL.fill(0, 0, n + 1);
  for (let b = 1; b <= prevMaxBucket; b++) {
    TD_BUCKETS[b].length = 0;
  }

  TD_FINAL[edgeNode] = 1;
  TD_POT[edgeNode] = 0;

  for (let i = 0; i < n; i++) {
    if (board[i] !== 0) continue;
    let adjEdge = isTargetEdge[i] === 1;
    if (!adjEdge) {
      const nbs = geo.validNeighbors[i];
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k];
        if (board[nb] === player && COMP_NODE[nb] === edgeNode) {
          adjEdge = true;
          break;
        }
      }
    }
    if (adjEdge) {
      TD_POT[i] = 1;
      TD_BUCKETS[1].push(i);
    }
  }

  const maxD = Math.min(MAX_BUCKET - 1, n + 1);
  let maxBucketUsed = 1;
  for (let d = 1; d <= maxBucketUsed; d++) {
    const bucket = TD_BUCKETS[d];
    for (let bi = 0; bi < bucket.length; bi++) {
      const u = bucket[bi];
      if (TD_FINAL[u] || TD_POT[u] !== d) continue;
      TD_FINAL[u] = 1;

      tdStamp++;
      if (tdStamp >= 1_000_000_000) {
        TD_SEEN.fill(0);
        tdStamp = 1;
      }
      const stamp = tdStamp;

      if (board[u] === 0) {
        const nbs = geo.validNeighbors[u];
        for (let k = 0; k < nbs.length; k++) {
          const nb = nbs[k];
          const cell = board[nb];
          if (cell === rival) continue;
          const v = cell === 0 ? nb : COMP_NODE[nb];
          if (v === edgeNode || TD_FINAL[v] || TD_SEEN[v] === stamp) continue;
          TD_SEEN[v] = stamp;

          if (d < TD_MIN1[v]) {
            TD_MIN2[v] = TD_MIN1[v];
            TD_MIN1[v] = d;
          } else if (d < TD_MIN2[v]) {
            TD_MIN2[v] = d;
          }
          if (TD_MIN2[v] < INF) {
            const cand = TD_MIN2[v] + (board[v] === player ? 0 : 1);
            if (cand < TD_POT[v] && cand < maxD) {
              TD_POT[v] = cand;
              TD_BUCKETS[cand].push(v);
              if (cand > maxBucketUsed) maxBucketUsed = cand;
            }
          }
        }
      } else {
        // Componente propia
        const start = COMP_START[u];
        const len = COMP_LEN[u];
        for (let m = 0; m < len; m++) {
          const cell = COMP_MEMBERS[start + m];
          const nbs = geo.validNeighbors[cell];
          for (let k = 0; k < nbs.length; k++) {
            const v = nbs[k];
            if (board[v] !== 0 || TD_FINAL[v] || TD_SEEN[v] === stamp) continue;
            TD_SEEN[v] = stamp;

            if (d < TD_MIN1[v]) {
              TD_MIN2[v] = TD_MIN1[v];
              TD_MIN1[v] = d;
            } else if (d < TD_MIN2[v]) {
              TD_MIN2[v] = d;
            }
            if (TD_MIN2[v] < INF) {
              const cand = TD_MIN2[v] + 1;
              if (cand < TD_POT[v] && cand < maxD) {
                TD_POT[v] = cand;
                TD_BUCKETS[cand].push(v);
                if (cand > maxBucketUsed) maxBucketUsed = cand;
              }
            }
          }
        }
      }
    }
  }
  prevMaxBucket = maxBucketUsed;

  for (let i = 0; i < n; i++) {
    const v = board[i];
    if (v === 0) {
      outCellPot[i] = TD_POT[i];
    } else if (v === player) {
      outCellPot[i] = TD_POT[COMP_NODE[i]];
    } else {
      outCellPot[i] = INF;
    }
  }
}

/**
 * Busca si la última jugada del rival atacó un puente virtual vivo de `yo`
 * (entre dos fichas no conectadas o entre una ficha y un borde aún no alcanzado).
 */
function detectarDefensasPuente(
  board: Uint8Array,
  geo: HexGeo,
  yo: Player,
  lastMove: number,
  bfs1: Int16Array,
  bfs2: Int16Array
): number[] {
  const n = geo.n;
  const size = geo.size;
  const edges = getEdgeArrays(geo, yo);

  BRIDGE_COMP.fill(-1, 0, n);
  for (let i = 0; i < n; i++) {
    if (board[i] !== yo || BRIDGE_COMP[i] !== -1) continue;
    let qH = 0;
    let qT = 0;
    COMP_QUEUE[qT++] = i;
    BRIDGE_COMP[i] = i;
    let tStart = edges.isStart[i];
    let tEnd = edges.isEnd[i];

    while (qH < qT) {
      const u = COMP_QUEUE[qH++];
      const nbs = geo.validNeighbors[u];
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k];
        if (board[nb] === yo && BRIDGE_COMP[nb] === -1) {
          BRIDGE_COMP[nb] = i;
          COMP_QUEUE[qT++] = nb;
          if (edges.isStart[nb]) tStart = 1;
          if (edges.isEnd[nb]) tEnd = 1;
        }
      }
    }
    BRIDGE_TOUCH_START[i] = tStart;
    BRIDGE_TOUCH_END[i] = tEnd;
  }

  const defensas: number[] = [];
  const agregar = (cell: number) => {
    if (!defensas.includes(cell)) defensas.push(cell);
  };

  // 1. Puentes entre dos fichas propias alrededor de `lastMove`
  const base = lastMove * 6;
  for (let k = 0; k < 6; k++) {
    const other = geo.neighbors6[base + k];
    const a = geo.neighbors6[base + ((k + 5) % 6)];
    const b = geo.neighbors6[base + ((k + 1) % 6)];
    if (other >= n || a >= n || b >= n) continue;
    if (board[other] !== 0 || board[a] !== yo || board[b] !== yo) continue;
    if (BRIDGE_COMP[a] === BRIDGE_COMP[b]) continue;
    if (bfs1[a] >= INF || bfs2[a] >= INF || bfs1[b] >= INF || bfs2[b] >= INF) continue;
    agregar(other);
  }

  // 2. Puentes entre ficha propia y el borde propio en `lastMove`
  const r = Math.floor(lastMove / size);
  const c = lastMove % size;
  if (yo === 1) {
    if (r === 0) {
      const f1 = 1 * size + c;
      if (board[f1] === yo && c + 1 < size && board[c + 1] === 0) {
        if (!BRIDGE_TOUCH_START[BRIDGE_COMP[f1]] && bfs2[f1] < INF) agregar(c + 1);
      }
      if (c > 0) {
        const f2 = 1 * size + (c - 1);
        if (board[f2] === yo && board[c - 1] === 0) {
          if (!BRIDGE_TOUCH_START[BRIDGE_COMP[f2]] && bfs2[f2] < INF) agregar(c - 1);
        }
      }
    } else if (r === size - 1) {
      const baseRow = (size - 2) * size;
      const lastRow = (size - 1) * size;
      const f1 = baseRow + c;
      if (board[f1] === yo && c > 0 && board[lastRow + (c - 1)] === 0) {
        if (!BRIDGE_TOUCH_END[BRIDGE_COMP[f1]] && bfs1[f1] < INF) agregar(lastRow + (c - 1));
      }
      if (c + 1 < size) {
        const f2 = baseRow + (c + 1);
        if (board[f2] === yo && board[lastRow + (c + 1)] === 0) {
          if (!BRIDGE_TOUCH_END[BRIDGE_COMP[f2]] && bfs1[f2] < INF) agregar(lastRow + (c + 1));
        }
      }
    }
  } else {
    if (c === 0) {
      const f1 = r * size + 1;
      if (board[f1] === yo && r + 1 < size && board[(r + 1) * size] === 0) {
        if (!BRIDGE_TOUCH_START[BRIDGE_COMP[f1]] && bfs2[f1] < INF) agregar((r + 1) * size);
      }
      if (r > 0) {
        const f2 = (r - 1) * size + 1;
        if (board[f2] === yo && board[(r - 1) * size] === 0) {
          if (!BRIDGE_TOUCH_START[BRIDGE_COMP[f2]] && bfs2[f2] < INF) agregar((r - 1) * size);
        }
      }
    } else if (c === size - 1) {
      const colPen = size - 2;
      const colUlt = size - 1;
      const f1 = r * size + colPen;
      if (board[f1] === yo && r > 0 && board[(r - 1) * size + colUlt] === 0) {
        if (!BRIDGE_TOUCH_END[BRIDGE_COMP[f1]] && bfs1[f1] < INF) agregar((r - 1) * size + colUlt);
      }
      if (r + 1 < size) {
        const f2 = (r + 1) * size + colPen;
        if (board[f2] === yo && board[(r + 1) * size + colUlt] === 0) {
          if (!BRIDGE_TOUCH_END[BRIDGE_COMP[f2]] && bfs1[f2] < INF) agregar((r + 1) * size + colUlt);
        }
      }
    }
  }

  return defensas;
}

function evaluarTablero(board: Uint8Array, geo: HexGeo, turno: Player): number {
  const n = geo.n;
  const maxDistCap = geo.size * 2 + 4;
  const rival: Player = turno === 1 ? 2 : 1;
  const edgesYo = getEdgeArrays(geo, turno);
  const edgesRiv = getEdgeArrays(geo, rival);

  computeBfs01(board, geo, turno, edgesYo.startCells, BFS_YO_1);
  computeBfs01(board, geo, turno, edgesYo.endCells, BFS_YO_2);
  computeBfs01(board, geo, rival, edgesRiv.startCells, BFS_RIV_1);
  computeBfs01(board, geo, rival, edgesRiv.endCells, BFS_RIV_2);

  let bfsYo = INF;
  let bfsRiv = INF;
  let hayWinYo = false;

  for (let i = 0; i < n; i++) {
    const v = board[i];
    if (v === turno) {
      if (BFS_YO_1[i] === 0 && BFS_YO_2[i] === 0) return WIN_SCORE;
      const d = BFS_YO_1[i] + BFS_YO_2[i];
      if (d < bfsYo) bfsYo = d;
    } else if (v === rival) {
      if (BFS_RIV_1[i] === 0 && BFS_RIV_2[i] === 0) return -WIN_SCORE;
      const d = BFS_RIV_1[i] + BFS_RIV_2[i];
      if (d < bfsRiv) bfsRiv = d;
    } else {
      const dy = BFS_YO_1[i] + BFS_YO_2[i] - 1;
      if (dy === 1) hayWinYo = true;
      if (dy < bfsYo) bfsYo = dy;
      const dr = BFS_RIV_1[i] + BFS_RIV_2[i] - 1;
      if (dr < bfsRiv) bfsRiv = dr;
    }
  }

  if (hayWinYo) return WIN_SCORE - 100;

  computeTwoDistance(board, geo, turno, edgesYo.isStart, TD_YO_1);
  computeTwoDistance(board, geo, turno, edgesYo.isEnd, TD_YO_2);
  computeTwoDistance(board, geo, rival, edgesRiv.isStart, TD_RIV_1);
  computeTwoDistance(board, geo, rival, edgesRiv.isEnd, TD_RIV_2);

  let tdYo = INF;
  let tdRiv = INF;
  let countYo = 0;
  let countRiv = 0;

  for (let i = 0; i < n; i++) {
    const v = board[i];
    if (v === turno) {
      const d = TD_YO_1[i] + TD_YO_2[i];
      if (d < tdYo) {
        tdYo = d;
        countYo = 1;
      } else if (d === tdYo) {
        countYo++;
      }
    } else if (v === rival) {
      const d = TD_RIV_1[i] + TD_RIV_2[i];
      if (d < tdRiv) {
        tdRiv = d;
        countRiv = 1;
      } else if (d === tdRiv) {
        countRiv++;
      }
    } else {
      const dy = TD_YO_1[i] + TD_YO_2[i] - 1;
      if (dy < tdYo) {
        tdYo = dy;
        countYo = 1;
      } else if (dy === tdYo) {
        countYo++;
      }
      const dr = TD_RIV_1[i] + TD_RIV_2[i] - 1;
      if (dr < tdRiv) {
        tdRiv = dr;
        countRiv = 1;
      } else if (dr === tdRiv) {
        countRiv++;
      }
    }
  }

  const cTdYo = Math.min(tdYo, maxDistCap);
  const cTdRiv = Math.min(tdRiv, maxDistCap);
  const cBfsYo = Math.min(bfsYo, maxDistCap);
  const cBfsRiv = Math.min(bfsRiv, maxDistCap);

  return (
    (cTdRiv - cTdYo) * 1000 +
    (cBfsRiv - cBfsYo) * 180 +
    (countYo - countRiv) * 30 +
    150 // ventaja de turno activo
  );
}

function obtenerCandidatasOrdenadas(
  board: Uint8Array,
  geo: HexGeo,
  turno: Player,
  limite: number,
  usarTwoDist: boolean
): { candidatas: number[]; ganaEnUno: boolean } {
  const n = geo.n;
  const maxDistCap = geo.size * 2 + 4;
  const rival: Player = turno === 1 ? 2 : 1;
  const edgesYo = getEdgeArrays(geo, turno);
  const edgesRiv = getEdgeArrays(geo, rival);

  computeBfs01(board, geo, turno, edgesYo.startCells, BFS_YO_1);
  computeBfs01(board, geo, turno, edgesYo.endCells, BFS_YO_2);
  computeBfs01(board, geo, rival, edgesRiv.startCells, BFS_RIV_1);
  computeBfs01(board, geo, rival, edgesRiv.endCells, BFS_RIV_2);

  const bloqueos: number[] = [];
  for (let i = 0; i < n; i++) {
    if (board[i] !== 0) continue;
    if (BFS_YO_1[i] === 1 && BFS_YO_2[i] === 1) {
      return { candidatas: [i], ganaEnUno: true };
    }
    if (BFS_RIV_1[i] === 1 && BFS_RIV_2[i] === 1) bloqueos.push(i);
  }
  if (bloqueos.length > 0) {
    return { candidatas: bloqueos.slice(0, limite), ganaEnUno: false };
  }

  if (usarTwoDist) {
    computeTwoDistance(board, geo, turno, edgesYo.isStart, TD_YO_1);
    computeTwoDistance(board, geo, turno, edgesYo.isEnd, TD_YO_2);
    computeTwoDistance(board, geo, rival, edgesRiv.isStart, TD_RIV_1);
    computeTwoDistance(board, geo, rival, edgesRiv.isEnd, TD_RIV_2);
  }

  let candCount = 0;
  for (let i = 0; i < n; i++) {
    if (board[i] !== 0) continue;
    const myBfs = Math.min(BFS_YO_1[i] + BFS_YO_2[i] - 1, maxDistCap);
    const oppBfs = Math.min(BFS_RIV_1[i] + BFS_RIV_2[i] - 1, maxDistCap);

    let score: number;
    if (usarTwoDist) {
      const myTd = Math.min(TD_YO_1[i] + TD_YO_2[i] - 1, maxDistCap);
      const oppTd = Math.min(TD_RIV_1[i] + TD_RIV_2[i] - 1, maxDistCap);
      score = -(myTd * 12 + oppTd * 10) - (myBfs * 4 + oppBfs * 3) - geo.distCenter[i];
    } else {
      score = -(myBfs * 12 + oppBfs * 10) - geo.distCenter[i];
    }
    CAND_IDX[candCount] = i;
    CAND_SCORE[candCount] = score;
    candCount++;
  }

  const lim = Math.min(limite, candCount);
  const top: number[] = new Array(lim);
  for (let k = 0; k < lim; k++) {
    let bestPos = k;
    let bestScore = CAND_SCORE[k];
    for (let j = k + 1; j < candCount; j++) {
      const sc = CAND_SCORE[j];
      if (sc > bestScore) {
        bestScore = sc;
        bestPos = j;
      }
    }
    top[k] = CAND_IDX[bestPos];
    CAND_IDX[bestPos] = CAND_IDX[k];
    CAND_SCORE[bestPos] = CAND_SCORE[k];
  }
  return { candidatas: top, ganaEnUno: false };
}

function negamax(
  board: Uint8Array,
  geo: HexGeo,
  profundidad: number,
  alpha: number,
  beta: number,
  turno: Player,
  limiteInner: number
): number {
  if (profundidad === 0) {
    return evaluarTablero(board, geo, turno);
  }

  const lim = profundidad === 1 ? Math.max(3, limiteInner - 1) : limiteInner;
  const { candidatas, ganaEnUno } = obtenerCandidatasOrdenadas(
    board,
    geo,
    turno,
    lim,
    false
  );
  if (ganaEnUno) return WIN_SCORE + profundidad;
  if (candidatas.length === 0) return 0;

  const rival: Player = turno === 1 ? 2 : 1;
  let mejor = -Infinity;

  for (let i = 0; i < candidatas.length; i++) {
    const mov = candidatas[i];
    board[mov] = turno;
    const valor = -negamax(board, geo, profundidad - 1, -beta, -alpha, rival, limiteInner);
    board[mov] = 0;

    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }

  return mejor;
}

/**
 * Elige la siguiente casilla del bot de Hex según la dificultad indicada.
 */
export function elegirMovimiento(
  state: HexState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const geo = GEOS[state.size];
  const n = geo.n;
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;

  const vacias: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = state.board[i];
    BOARD_BUF[i] = v === null ? 0 : v;
    if (v === null) vacias.push(i);
  }
  if (vacias.length === 0) return 0;

  const edgesYo = getEdgeArrays(geo, yo);
  computeBfs01(BOARD_BUF, geo, yo, edgesYo.startCells, BFS_YO_1);
  computeBfs01(BOARD_BUF, geo, yo, edgesYo.endCells, BFS_YO_2);

  const ganadoras: number[] = [];
  for (let i = 0; i < vacias.length; i++) {
    const c = vacias[i];
    if (BFS_YO_1[c] === 1 && BFS_YO_2[c] === 1) ganadoras.push(c);
  }

  if (dificultad === 'facil') {
    if (ganadoras.length > 0 && (vacias.length === ganadoras.length || rng() < 0.35)) {
      return elegirAlAzar(ganadoras, rng);
    }
    const ganadorasSet = new Set(ganadoras);
    const pool =
      ganadoras.length > 0 ? vacias.filter(c => !ganadorasSet.has(c)) : vacias;
    return elegirAlAzar(pool, rng);
  }

  if (ganadoras.length > 0) {
    return elegirAlAzar(ganadoras, rng);
  }

  const edgesRiv = getEdgeArrays(geo, rival);
  computeBfs01(BOARD_BUF, geo, rival, edgesRiv.startCells, BFS_RIV_1);
  computeBfs01(BOARD_BUF, geo, rival, edgesRiv.endCells, BFS_RIV_2);

  const bloqueos: number[] = [];
  for (let i = 0; i < vacias.length; i++) {
    const c = vacias[i];
    if (BFS_RIV_1[c] === 1 && BFS_RIV_2[c] === 1) bloqueos.push(c);
  }
  if (bloqueos.length > 0) {
    return elegirAlAzar(bloqueos, rng);
  }

  if (dificultad === 'medio') {
    const scored: { idx: number; score: number }[] = [];
    for (let i = 0; i < vacias.length; i++) {
      const c = vacias[i];
      const dYo = Math.min(BFS_YO_1[c] + BFS_YO_2[c] - 1, INF);
      const score = -dYo * 20 - geo.distCenter[c] * 3;
      scored.push({ idx: c, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const topK = Math.min(3, scored.length);
    const top = scored.slice(0, topK).map(s => s.idx);
    return elegirAlAzar(top, rng);
  }

  // Difícil: defensa inmediata de puentes virtuales atacados en la última jugada.
  if (state.lastMove !== null && state.lastMove >= 0 && state.lastMove < n) {
    const defensas = detectarDefensasPuente(
      BOARD_BUF,
      geo,
      yo,
      state.lastMove,
      BFS_YO_1,
      BFS_YO_2
    );
    if (defensas.length === 1) {
      return defensas[0];
    }
    if (defensas.length > 1) {
      let bestDef = defensas[0];
      let bestVal = -Infinity;
      for (let i = 0; i < defensas.length; i++) {
        const d = defensas[i];
        BOARD_BUF[d] = yo;
        const val = -evaluarTablero(BOARD_BUF, geo, rival);
        BOARD_BUF[d] = 0;
        if (val > bestVal) {
          bestVal = val;
          bestDef = d;
        }
      }
      return bestDef;
    }
  }

  // Tablero vacío: abrir en el centro.
  if (vacias.length === n) {
    const mid = Math.floor(state.size / 2);
    return mid * state.size + mid;
  }

  // Alfa-beta adaptado a state.size sobre top 8-10 candidatas (profundidad total 2-3).
  const limiteRaiz = state.size === 5 ? 9 : 8;
  const limiteInner = 5;
  const profundidad =
    vacias.length >= n - 2 || (state.size === 9 && vacias.length > 54) ? 1 : 2;

  const { candidatas } = obtenerCandidatasOrdenadas(BOARD_BUF, geo, yo, limiteRaiz, true);
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < candidatas.length; i++) {
    const mov = candidatas[i];
    BOARD_BUF[mov] = yo;
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(BOARD_BUF, geo, profundidad, -Infinity, beta, rival, limiteInner);
    BOARD_BUF[mov] = 0;

    if (valor > mejor) {
      mejor = valor;
      mejores = [mov];
    } else if (valor === mejor) {
      mejores.push(mov);
    }
  }

  return elegirAlAzar(mejores, rng);
}
