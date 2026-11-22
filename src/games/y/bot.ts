import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  cellCount,
  coordsOf,
  indexOf,
  type BoardSize,
  type YState,
} from './engine';

type Player = 1 | 2;

const INF = 31;
const MAX_CELLS = 66; // cellCount(11)
const MAX_NODES = 132; // <= 66 componentes + 66 celdas
const WIN_SCORE = 100_000;

const Y_DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 0],
  [1, 0],
  [1, 1],
];

// 3 desplazamientos únicos de puente virtual (dist = 2 con 2 vecinos comunes)
const BRIDGE_DEFS: ReadonlyArray<{
  dr: number;
  dc: number;
  c1r: number;
  c1c: number;
  c2r: number;
  c2c: number;
}> = [
  { dr: 1, dc: 2, c1r: 0, c1c: 1, c2r: 1, c2c: 1 },
  { dr: 2, dc: 1, c1r: 1, c1c: 0, c2r: 1, c2c: 1 },
  { dr: 1, dc: -1, c1r: 0, c1c: -1, c2r: 1, c2c: 0 },
];

interface Bridge {
  u: number;
  v: number;
  c1: number;
  c2: number;
}

interface EdgeBridge {
  u: number;
  sideBit: number;
  c1: number;
  c2: number;
}

interface BoardTopology {
  size: BoardSize;
  total: number;
  neighbors: Int8Array; // total * 6
  neighborCount: Uint8Array; // total
  sideMask: Uint8Array; // bitmask: 1=izq, 2=der, 4=inf
  sideCells: [Uint8Array, Uint8Array, Uint8Array];
  centralDist: Uint8Array; // distancia baricéntrica al centro del triángulo
  bridges: Bridge[];
  edgeBridges: EdgeBridge[];
}

function buildTopology(size: BoardSize): BoardTopology {
  const total = cellCount(size);
  const neighbors = new Int8Array(total * 6).fill(-1);
  const neighborCount = new Uint8Array(total);
  const sideMask = new Uint8Array(total);
  const centralDist = new Uint8Array(total);

  const izqList: number[] = [];
  const derList: number[] = [];
  const infList: number[] = [];
  const bridges: Bridge[] = [];
  const edgeBridges: EdgeBridge[] = [];

  const inBounds = (r: number, c: number) =>
    r >= 0 && r < size && c >= 0 && c <= r;

  for (let i = 0; i < total; i++) {
    const { r, c } = coordsOf(i);
    let mask = 0;
    if (c === 0) {
      mask |= 1;
      izqList.push(i);
    }
    if (c === r) {
      mask |= 2;
      derList.push(i);
    }
    if (r === size - 1) {
      mask |= 4;
      infList.push(i);
    }
    sideMask[i] = mask;

    const target = size - 1;
    centralDist[i] =
      Math.abs(3 * c - target) +
      Math.abs(3 * (r - c) - target) +
      Math.abs(3 * (target - r) - target);

    let deg = 0;
    for (let d = 0; d < 6; d++) {
      const nr = r + Y_DIRS[d][0];
      const nc = c + Y_DIRS[d][1];
      if (inBounds(nr, nc)) {
        neighbors[i * 6 + deg++] = indexOf(nr, nc);
      }
    }
    neighborCount[i] = deg;

    // Puentes celda-a-celda
    for (let b = 0; b < BRIDGE_DEFS.length; b++) {
      const def = BRIDGE_DEFS[b];
      const vr = r + def.dr;
      const vc = c + def.dc;
      if (!inBounds(vr, vc)) continue;
      const c1r = r + def.c1r;
      const c1c = c + def.c1c;
      const c2r = r + def.c2r;
      const c2c = c + def.c2c;
      if (inBounds(c1r, c1c) && inBounds(c2r, c2c)) {
        bridges.push({
          u: i,
          v: indexOf(vr, vc),
          c1: indexOf(c1r, c1c),
          c2: indexOf(c2r, c2c),
        });
      }
    }

    // Puentes celda-a-lado (distancia 1 al borde con 2 vecinos en ese borde)
    if (c === 1 && r >= 1 && r < size) {
      edgeBridges.push({
        u: i,
        sideBit: 1,
        c1: indexOf(r - 1, 0),
        c2: indexOf(r, 0),
      });
    }
    if (c === r - 1 && r >= 2) {
      edgeBridges.push({
        u: i,
        sideBit: 2,
        c1: indexOf(r - 1, r - 1),
        c2: indexOf(r, r),
      });
    }
    if (r === size - 2 && c >= 0 && c <= r) {
      edgeBridges.push({
        u: i,
        sideBit: 4,
        c1: indexOf(size - 1, c),
        c2: indexOf(size - 1, c + 1),
      });
    }
  }

  return {
    size,
    total,
    neighbors,
    neighborCount,
    sideMask,
    sideCells: [
      Uint8Array.from(izqList),
      Uint8Array.from(derList),
      Uint8Array.from(infList),
    ],
    centralDist,
    bridges,
    edgeBridges,
  };
}

const TOPOLOGIES: Record<BoardSize, BoardTopology> = {
  7: buildTopology(7),
  9: buildTopology(9),
  11: buildTopology(11),
};

// Scratches reutilizables (síncrono, cero asignaciones en el bucle de búsqueda)
const BOARD_SCRATCH = new Uint8Array(MAX_CELLS);
const DQ_SCRATCH = new Int16Array(256);

const COMP_ID_1 = new Int8Array(MAX_CELLS);
const COMP_ID_2 = new Int8Array(MAX_CELLS);
const COMP_MASK_1 = new Uint8Array(MAX_CELLS);
const COMP_MASK_2 = new Uint8Array(MAX_CELLS);
const COMP_QUEUE = new Uint8Array(MAX_CELLS);

// Listas de vecinos vacíos por componente (para two-distance)
const COMP_EMPTY_LIST = new Uint8Array(MAX_CELLS * 6);
const COMP_EMPTY_START = new Uint16Array(MAX_CELLS);
const COMP_EMPTY_END = new Uint16Array(MAX_CELLS);
const EMPTY_STAMP = new Int32Array(MAX_CELLS);
let stampCounter = 1;

// Salidas 0-1 BFS (3 lados x MAX_CELLS)
const BFS_1 = [
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
] as const;
const BFS_2 = [
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
] as const;

// Salidas two-distance (3 lados x MAX_CELLS)
const TD_CELL_1 = [
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
] as const;
const TD_COMP_1 = [
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
] as const;
const TD_CELL_2 = [
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
] as const;
const TD_COMP_2 = [
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
  new Uint8Array(MAX_CELLS),
] as const;

const BUCKET_DATA = new Int16Array((INF + 1) * MAX_NODES);
const BUCKET_LEN = new Uint8Array(INF + 1);
const COMP_SEEN = new Uint8Array(MAX_CELLS);
const CELL_SEEN = new Uint8Array(MAX_CELLS);
const COMP_STAMP = new Int32Array(MAX_CELLS);
let compStampCounter = 1;

const CELL_SCORE = new Int32Array(MAX_CELLS);
const BRIDGE_FLAG = new Uint8Array(MAX_CELLS);

interface CompInfo {
  numComps: number;
  compId: Int8Array;
  compMask: Uint8Array;
}

function buildComponents(
  board: Uint8Array,
  topo: BoardTopology,
  player: Player,
  compId: Int8Array,
  compMask: Uint8Array,
  collectEmptyNeighbors: boolean
): number {
  const total = topo.total;
  compId.fill(-1, 0, total);
  let numComps = 0;
  let listCursor = 0;

  for (let i = 0; i < total; i++) {
    if (board[i] !== player || compId[i] !== -1) continue;
    const cid = numComps++;
    let mask = 0;
    let qHead = 0;
    let qTail = 0;
    compId[i] = cid;
    COMP_QUEUE[qTail++] = i;
    if (collectEmptyNeighbors) {
      COMP_EMPTY_START[cid] = listCursor;
      stampCounter++;
    }

    while (qHead < qTail) {
      const u = COMP_QUEUE[qHead++];
      mask |= topo.sideMask[u];
      const deg = topo.neighborCount[u];
      const base = u * 6;
      for (let k = 0; k < deg; k++) {
        const v = topo.neighbors[base + k];
        const bv = board[v];
        if (bv === player) {
          if (compId[v] === -1) {
            compId[v] = cid;
            COMP_QUEUE[qTail++] = v;
          }
        } else if (collectEmptyNeighbors && bv === 0) {
          if (EMPTY_STAMP[v] !== stampCounter) {
            EMPTY_STAMP[v] = stampCounter;
            COMP_EMPTY_LIST[listCursor++] = v;
          }
        }
      }
    }

    compMask[cid] = mask;
    if (collectEmptyNeighbors) {
      COMP_EMPTY_END[cid] = listCursor;
    }
  }

  return numComps;
}

function countWinningCells(
  board: Uint8Array,
  topo: BoardTopology,
  player: Player,
  compId: Int8Array,
  compMask: Uint8Array
): number {
  let count = 0;
  const total = topo.total;
  for (let u = 0; u < total; u++) {
    if (board[u] !== 0) continue;
    let mask = topo.sideMask[u];
    const deg = topo.neighborCount[u];
    const base = u * 6;
    for (let k = 0; k < deg; k++) {
      const v = topo.neighbors[base + k];
      if (board[v] === player) {
        mask |= compMask[compId[v]];
      }
    }
    if (mask === 7) {
      count++;
      if (count >= 2) return count;
    }
  }
  return count;
}

function findWinningCells(
  board: Uint8Array,
  topo: BoardTopology,
  player: Player,
  compId: Int8Array,
  compMask: Uint8Array
): number[] {
  const winners: number[] = [];
  const total = topo.total;
  for (let u = 0; u < total; u++) {
    if (board[u] !== 0) continue;
    let mask = topo.sideMask[u];
    const deg = topo.neighborCount[u];
    const base = u * 6;
    for (let k = 0; k < deg; k++) {
      const v = topo.neighbors[base + k];
      if (board[v] === player) {
        mask |= compMask[compId[v]];
      }
    }
    if (mask === 7) winners.push(u);
  }
  return winners;
}

function bfs01Side(
  board: Uint8Array,
  topo: BoardTopology,
  player: Player,
  sideIdx: 0 | 1 | 2,
  outDist: Uint8Array
): void {
  const total = topo.total;
  outDist.fill(INF, 0, total);
  const opp = player === 1 ? 2 : 1;
  let head = 128;
  let tail = 128;

  const sideCells = topo.sideCells[sideIdx];
  for (let i = 0; i < sideCells.length; i++) {
    const s = sideCells[i];
    const bv = board[s];
    if (bv === player) {
      outDist[s] = 0;
      DQ_SCRATCH[--head] = s;
    } else if (bv === 0) {
      outDist[s] = 1;
      DQ_SCRATCH[tail++] = s;
    }
  }

  while (head < tail) {
    const u = DQ_SCRATCH[head++];
    const d = outDist[u];
    const deg = topo.neighborCount[u];
    const base = u * 6;
    for (let k = 0; k < deg; k++) {
      const v = topo.neighbors[base + k];
      const bv = board[v];
      if (bv === opp) continue;
      const nd = bv === player ? d : d + 1;
      if (nd < outDist[v]) {
        outDist[v] = nd;
        if (bv === player) {
          DQ_SCRATCH[--head] = v;
        } else {
          DQ_SCRATCH[tail++] = v;
        }
      }
    }
  }
}

function twoDistSide(
  board: Uint8Array,
  topo: BoardTopology,
  player: Player,
  sideIdx: 0 | 1 | 2,
  compInfo: CompInfo,
  outCellDist: Uint8Array,
  outCompDist: Uint8Array
): void {
  const total = topo.total;
  const opp = player === 1 ? 2 : 1;
  const sideBit = 1 << sideIdx;
  const { numComps, compId, compMask } = compInfo;

  BUCKET_LEN.fill(0);
  outCellDist.fill(INF, 0, total);
  outCompDist.fill(INF, 0, numComps);
  COMP_SEEN.fill(0, 0, numComps);
  CELL_SEEN.fill(0, 0, total);

  let queued = 0;
  const pushBucket = (d: number, node: number) => {
    const idx = BUCKET_LEN[d]++;
    BUCKET_DATA[d * MAX_NODES + idx] = node;
    queued++;
  };

  for (let c = 0; c < numComps; c++) {
    if ((compMask[c] & sideBit) !== 0) {
      outCompDist[c] = 0;
      pushBucket(0, c);
    }
  }

  for (let u = 0; u < total; u++) {
    if (board[u] !== 0) continue;
    if ((topo.sideMask[u] & sideBit) !== 0) {
      outCellDist[u] = 1;
      pushBucket(1, numComps + u);
    }
  }

  for (let d = 0; d < INF && queued > 0; d++) {
    if (BUCKET_LEN[d] === 0) continue;
    const rowBase = d * MAX_NODES;
    for (let idx = 0; idx < BUCKET_LEN[d]; idx++) {
      queued--;
      const node = BUCKET_DATA[rowBase + idx];
      if (node < numComps) {
        const c = node;
        if (d > outCompDist[c]) continue;
        const start = COMP_EMPTY_START[c];
        const end = COMP_EMPTY_END[c];
        const nd = d + 1;
        if (nd >= INF) continue;
        for (let p = start; p < end; p++) {
          const u = COMP_EMPTY_LIST[p];
          if (nd < outCellDist[u]) {
            outCellDist[u] = nd;
            pushBucket(nd, numComps + u);
          }
        }
      } else {
        const u = node - numComps;
        if (d > outCellDist[u]) continue;
        compStampCounter++;
        const deg = topo.neighborCount[u];
        const base = u * 6;
        for (let k = 0; k < deg; k++) {
          const v = topo.neighbors[base + k];
          const bv = board[v];
          if (bv === opp) continue;
          if (bv === player) {
            const c = compId[v];
            if (COMP_STAMP[c] === compStampCounter) continue;
            COMP_STAMP[c] = compStampCounter;
            if ((compMask[c] & sideBit) !== 0) continue;
            COMP_SEEN[c]++;
            if (COMP_SEEN[c] === 2 && d < outCompDist[c]) {
              outCompDist[c] = d;
              pushBucket(d, c);
            }
          } else {
            if ((topo.sideMask[v] & sideBit) !== 0) continue;
            CELL_SEEN[v]++;
            const nd = d + 1;
            if (CELL_SEEN[v] === 2 && nd < INF && nd < outCellDist[v]) {
              outCellDist[v] = nd;
              pushBucket(nd, numComps + v);
            }
          }
        }
      }
    }
  }
}

function steinerBfs(
  board: Uint8Array,
  topo: BoardTopology,
  player: Player,
  bfs: readonly [Uint8Array, Uint8Array, Uint8Array]
): number {
  let best = INF * 3;
  const total = topo.total;
  for (let i = 0; i < total; i++) {
    const bv = board[i];
    if (bv !== player && bv !== 0) continue;
    const s =
      bfs[0][i] + bfs[1][i] + bfs[2][i] - (bv === 0 ? 2 : 0);
    if (s < best) best = s;
  }
  return best;
}

function steinerTwoDist(
  board: Uint8Array,
  topo: BoardTopology,
  numComps: number,
  tdCell: readonly [Uint8Array, Uint8Array, Uint8Array],
  tdComp: readonly [Uint8Array, Uint8Array, Uint8Array]
): number {
  let minCost = INF * 3;
  const total = topo.total;

  for (let c = 0; c < numComps; c++) {
    const s = tdComp[0][c] + tdComp[1][c] + tdComp[2][c];
    if (s < minCost) minCost = s;
  }
  for (let u = 0; u < total; u++) {
    if (board[u] !== 0) continue;
    const s = tdCell[0][u] + tdCell[1][u] + tdCell[2][u] - 2;
    if (s < minCost) minCost = s;
  }

  const threshold = minCost + 1;
  let hubsNear = 0;
  for (let u = 0; u < total; u++) {
    if (board[u] !== 0) continue;
    const s = tdCell[0][u] + tdCell[1][u] + tdCell[2][u] - 2;
    if (s <= threshold) hubsNear++;
  }

  return (minCost << 8) | Math.min(255, hubsNear);
}

function countVirtualBridges(
  board: Uint8Array,
  topo: BoardTopology,
  player: Player,
  compId: Int8Array,
  compMask: Uint8Array
): number {
  let count = 0;
  const bridges = topo.bridges;
  for (let i = 0; i < bridges.length; i++) {
    const br = bridges[i];
    if (board[br.u] !== player || board[br.v] !== player) continue;
    if (compId[br.u] === compId[br.v]) continue;
    if (board[br.c1] === 0 && board[br.c2] === 0) {
      count++;
    }
  }
  const edgeBridges = topo.edgeBridges;
  for (let i = 0; i < edgeBridges.length; i++) {
    const eb = edgeBridges[i];
    if (board[eb.u] !== player) continue;
    if ((compMask[compId[eb.u]] & eb.sideBit) !== 0) continue;
    if (board[eb.c1] === 0 && board[eb.c2] === 0) {
      count++;
    }
  }
  return count;
}

const EMPTIES_SCRATCH = new Uint8Array(MAX_CELLS);

function evaluateLeaf(
  board: Uint8Array,
  topo: BoardTopology,
  turno: Player
): number {
  const rival: Player = turno === 1 ? 2 : 1;
  const compIdT = turno === 1 ? COMP_ID_1 : COMP_ID_2;
  const compMaskT = turno === 1 ? COMP_MASK_1 : COMP_MASK_2;
  const compIdR = rival === 1 ? COMP_ID_1 : COMP_ID_2;
  const compMaskR = rival === 1 ? COMP_MASK_1 : COMP_MASK_2;

  const bfsT = turno === 1 ? BFS_1 : BFS_2;
  const bfsR = rival === 1 ? BFS_1 : BFS_2;
  const tdCellT = turno === 1 ? TD_CELL_1 : TD_CELL_2;
  const tdCompT = turno === 1 ? TD_COMP_1 : TD_COMP_2;
  const tdCellR = rival === 1 ? TD_CELL_1 : TD_CELL_2;
  const tdCompR = rival === 1 ? TD_COMP_1 : TD_COMP_2;

  const numCompsT = buildComponents(board, topo, turno, compIdT, compMaskT, true);
  if (countWinningCells(board, topo, turno, compIdT, compMaskT) > 0) {
    return WIN_SCORE;
  }

  for (let s = 0 as 0 | 1 | 2; s < 3; s = (s + 1) as 0 | 1 | 2) {
    twoDistSide(
      board,
      topo,
      turno,
      s,
      { numComps: numCompsT, compId: compIdT, compMask: compMaskT },
      tdCellT[s],
      tdCompT[s]
    );
  }

  const numCompsR = buildComponents(board, topo, rival, compIdR, compMaskR, true);
  const winCountR = countWinningCells(board, topo, rival, compIdR, compMaskR);
  if (winCountR >= 2) {
    return -(WIN_SCORE - 20);
  }

  for (let s = 0 as 0 | 1 | 2; s < 3; s = (s + 1) as 0 | 1 | 2) {
    twoDistSide(
      board,
      topo,
      rival,
      s,
      { numComps: numCompsR, compId: compIdR, compMask: compMaskR },
      tdCellR[s],
      tdCompR[s]
    );
  }

  const packedT = steinerTwoDist(board, topo, numCompsT, tdCellT, tdCompT);
  const packedR = steinerTwoDist(board, topo, numCompsR, tdCellR, tdCompR);
  const minCostT = packedT >> 8;
  const hubsT = packedT & 0xff;
  const minCostR = packedR >> 8;
  const hubsR = packedR & 0xff;

  let bfsDiff = 0;
  if (minCostT >= INF || minCostR >= INF) {
    for (let s = 0 as 0 | 1 | 2; s < 3; s = (s + 1) as 0 | 1 | 2) {
      bfs01Side(board, topo, turno, s, bfsT[s]);
      bfs01Side(board, topo, rival, s, bfsR[s]);
    }
    bfsDiff =
      steinerBfs(board, topo, rival, bfsR) -
      steinerBfs(board, topo, turno, bfsT);
  }

  const bridgesT = countVirtualBridges(board, topo, turno, compIdT, compMaskT);
  const bridgesR = countVirtualBridges(board, topo, rival, compIdR, compMaskR);

  return (
    140 * (minCostR - minCostT) +
    45 * bfsDiff +
    16 * (bridgesT - bridgesR) +
    6 * (hubsT - hubsR) +
    (winCountR === 1 ? -320 : 0) +
    55
  );
}

function analyzePosition(
  board: Uint8Array,
  topo: BoardTopology,
  turno: Player,
  lastMove: number | null,
  maxCandidates: number
): {
  evalScore: number;
  winTurno: number[];
  winRival: number[];
  candidates: number[];
} {
  const rival: Player = turno === 1 ? 2 : 1;
  const compIdT = turno === 1 ? COMP_ID_1 : COMP_ID_2;
  const compMaskT = turno === 1 ? COMP_MASK_1 : COMP_MASK_2;
  const compIdR = rival === 1 ? COMP_ID_1 : COMP_ID_2;
  const compMaskR = rival === 1 ? COMP_MASK_1 : COMP_MASK_2;

  const bfsT = turno === 1 ? BFS_1 : BFS_2;
  const bfsR = rival === 1 ? BFS_1 : BFS_2;
  const tdCellT = turno === 1 ? TD_CELL_1 : TD_CELL_2;
  const tdCompT = turno === 1 ? TD_COMP_1 : TD_COMP_2;
  const tdCellR = rival === 1 ? TD_CELL_1 : TD_CELL_2;
  const tdCompR = rival === 1 ? TD_COMP_1 : TD_COMP_2;

  const numCompsT = buildComponents(board, topo, turno, compIdT, compMaskT, true);
  const winTurno = findWinningCells(board, topo, turno, compIdT, compMaskT);

  for (let s = 0 as 0 | 1 | 2; s < 3; s = (s + 1) as 0 | 1 | 2) {
    bfs01Side(board, topo, turno, s, bfsT[s]);
    twoDistSide(
      board,
      topo,
      turno,
      s,
      { numComps: numCompsT, compId: compIdT, compMask: compMaskT },
      tdCellT[s],
      tdCompT[s]
    );
  }

  const numCompsR = buildComponents(board, topo, rival, compIdR, compMaskR, true);
  const winRival = findWinningCells(board, topo, rival, compIdR, compMaskR);

  for (let s = 0 as 0 | 1 | 2; s < 3; s = (s + 1) as 0 | 1 | 2) {
    bfs01Side(board, topo, rival, s, bfsR[s]);
    twoDistSide(
      board,
      topo,
      rival,
      s,
      { numComps: numCompsR, compId: compIdR, compMask: compMaskR },
      tdCellR[s],
      tdCompR[s]
    );
  }

  let evalScore: number;
  if (winTurno.length > 0) {
    evalScore = WIN_SCORE;
  } else if (winRival.length >= 2) {
    evalScore = -(WIN_SCORE - 20);
  } else {
    const packedT = steinerTwoDist(board, topo, numCompsT, tdCellT, tdCompT);
    const packedR = steinerTwoDist(board, topo, numCompsR, tdCellR, tdCompR);
    const minCostT = packedT >> 8;
    const hubsT = packedT & 0xff;
    const minCostR = packedR >> 8;
    const hubsR = packedR & 0xff;
    const bfsDiff =
      steinerBfs(board, topo, rival, bfsR) -
      steinerBfs(board, topo, turno, bfsT);
    const bridgesT = countVirtualBridges(board, topo, turno, compIdT, compMaskT);
    const bridgesR = countVirtualBridges(board, topo, rival, compIdR, compMaskR);

    evalScore =
      140 * (minCostR - minCostT) +
      45 * bfsDiff +
      16 * (bridgesT - bridgesR) +
      6 * (hubsT - hubsR) +
      (winRival.length === 1 ? -320 : 0) +
      55;
  }

  const total = topo.total;
  BRIDGE_FLAG.fill(0, 0, total);
  CELL_SCORE.fill(-1_000_000, 0, total);

  for (let i = 0; i < topo.bridges.length; i++) {
    const br = topo.bridges[i];
    const bu = board[br.u];
    const bv = board[br.v];
    if (bu === 0 || bu !== bv) continue;
    if (bu === turno && compIdT[br.u] !== compIdT[br.v]) {
      if (board[br.c1] === rival && board[br.c2] === 0) {
        BRIDGE_FLAG[br.c2] = Math.max(
          BRIDGE_FLAG[br.c2],
          br.c1 === lastMove ? 4 : 3
        );
      } else if (board[br.c2] === rival && board[br.c1] === 0) {
        BRIDGE_FLAG[br.c1] = Math.max(
          BRIDGE_FLAG[br.c1],
          br.c2 === lastMove ? 4 : 3
        );
      }
    } else if (bu === rival && compIdR[br.u] !== compIdR[br.v]) {
      if (board[br.c1] === 0 && board[br.c2] === 0) {
        BRIDGE_FLAG[br.c1] = Math.max(BRIDGE_FLAG[br.c1], 2);
        BRIDGE_FLAG[br.c2] = Math.max(BRIDGE_FLAG[br.c2], 2);
      }
    }
  }
  for (let i = 0; i < topo.edgeBridges.length; i++) {
    const eb = topo.edgeBridges[i];
    const bu = board[eb.u];
    if (bu === 0) continue;
    if (bu === turno && (compMaskT[compIdT[eb.u]] & eb.sideBit) === 0) {
      if (board[eb.c1] === rival && board[eb.c2] === 0) {
        BRIDGE_FLAG[eb.c2] = Math.max(
          BRIDGE_FLAG[eb.c2],
          eb.c1 === lastMove ? 4 : 3
        );
      } else if (board[eb.c2] === rival && board[eb.c1] === 0) {
        BRIDGE_FLAG[eb.c1] = Math.max(
          BRIDGE_FLAG[eb.c1],
          eb.c2 === lastMove ? 4 : 3
        );
      }
    } else if (bu === rival && (compMaskR[compIdR[eb.u]] & eb.sideBit) === 0) {
      if (board[eb.c1] === 0 && board[eb.c2] === 0) {
        BRIDGE_FLAG[eb.c1] = Math.max(BRIDGE_FLAG[eb.c1], 2);
        BRIDGE_FLAG[eb.c2] = Math.max(BRIDGE_FLAG[eb.c2], 2);
      }
    }
  }

  for (let i = 0; i < topo.bridges.length; i++) {
    const br = topo.bridges[i];
    if (board[br.c1] !== 0 || board[br.c2] !== 0) continue;
    if (board[br.u] === turno && board[br.v] === 0) {
      if (BRIDGE_FLAG[br.v] === 0) BRIDGE_FLAG[br.v] = 1;
    } else if (board[br.v] === turno && board[br.u] === 0) {
      if (BRIDGE_FLAG[br.u] === 0) BRIDGE_FLAG[br.u] = 1;
    }
  }

  let emptyLen = 0;
  for (let u = 0; u < total; u++) {
    if (board[u] !== 0) continue;
    EMPTIES_SCRATCH[emptyLen++] = u;
    const myTwoSum = Math.min(tdCellT[0][u] + tdCellT[1][u] + tdCellT[2][u], INF * 2);
    const oppTwoSum = Math.min(tdCellR[0][u] + tdCellR[1][u] + tdCellR[2][u], INF * 2);
    const myBfsSum = bfsT[0][u] + bfsT[1][u] + bfsT[2][u];
    const oppBfsSum = bfsR[0][u] + bfsR[1][u] + bfsR[2][u];

    let bBonus = 0;
    const bf = BRIDGE_FLAG[u];
    if (bf === 4) bBonus = 8_000;
    else if (bf === 3) bBonus = 3_500;
    else if (bf === 2) bBonus = 900;
    else if (bf === 1) bBonus = 120;

    CELL_SCORE[u] =
      bBonus -
      36 * myTwoSum -
      30 * oppTwoSum -
      18 * myBfsSum -
      14 * oppBfsSum -
      topo.centralDist[u];
  }

  const limit = Math.min(maxCandidates, emptyLen);
  const candidates: number[] = [];
  for (let k = 0; k < limit; k++) {
    let bestIdx = k;
    let bestVal = CELL_SCORE[EMPTIES_SCRATCH[k]];
    for (let j = k + 1; j < emptyLen; j++) {
      const val = CELL_SCORE[EMPTIES_SCRATCH[j]];
      if (val > bestVal) {
        bestVal = val;
        bestIdx = j;
      }
    }
    const chosen = EMPTIES_SCRATCH[bestIdx];
    EMPTIES_SCRATCH[bestIdx] = EMPTIES_SCRATCH[k];
    candidates.push(chosen);
  }

  return { evalScore, winTurno, winRival, candidates };
}

function branchLimits(size: BoardSize): {
  rootK: number;
  ply2K: number;
  ply3K: number;
} {
  if (size === 7) return { rootK: 8, ply2K: 5, ply3K: 4 };
  if (size === 9) return { rootK: 8, ply2K: 5, ply3K: 4 };
  return { rootK: 8, ply2K: 5, ply3K: 3 };
}

function negamax(
  board: Uint8Array,
  topo: BoardTopology,
  depth: number,
  alpha: number,
  beta: number,
  turno: Player,
  lastMove: number | null,
  ply2K: number,
  ply3K: number
): number {
  if (depth === 0) {
    return evaluateLeaf(board, topo, turno);
  }
  const maxCands = depth >= 2 ? ply2K : ply3K;
  const info = analyzePosition(board, topo, turno, lastMove, maxCands);

  if (info.winTurno.length > 0) {
    return WIN_SCORE + depth;
  }
  if (info.winRival.length >= 2) {
    return -(WIN_SCORE + depth - 10);
  }

  const jugadas = info.winRival.length === 1 ? info.winRival : info.candidates;
  if (jugadas.length === 0) return info.evalScore;

  const rival: Player = turno === 1 ? 2 : 1;
  let best = -Infinity;
  for (let i = 0; i < jugadas.length; i++) {
    const mov = jugadas[i];
    board[mov] = turno;
    const val = -negamax(
      board,
      topo,
      depth - 1,
      -beta,
      -alpha,
      rival,
      mov,
      ply2K,
      ply3K
    );
    board[mov] = 0;
    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Elige la siguiente casilla del bot de Juego Y según la dificultad indicada.
 */
export function elegirMovimiento(
  state: YState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const topo = TOPOLOGIES[state.size];
  const total = topo.total;
  const board = BOARD_SCRATCH;

  const vacias: number[] = [];
  for (let i = 0; i < total; i++) {
    const c = state.board[i];
    board[i] = c === null ? 0 : c;
    if (c === null) vacias.push(i);
  }

  if (vacias.length === 0) return 0;
  if (vacias.length === 1) return vacias[0];

  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const compIdYo = yo === 1 ? COMP_ID_1 : COMP_ID_2;
  const compMaskYo = yo === 1 ? COMP_MASK_1 : COMP_MASK_2;
  buildComponents(board, topo, yo, compIdYo, compMaskYo, false);
  const ganadorasYo = findWinningCells(board, topo, yo, compIdYo, compMaskYo);

  if (dificultad === 'facil') {
    if (
      ganadorasYo.length > 0 &&
      (vacias.length === ganadorasYo.length || rng() < 0.35)
    ) {
      return elegirAlAzar(ganadorasYo, rng);
    }
    if (ganadorasYo.length > 0) {
      const set = new Set(ganadorasYo);
      const pool = vacias.filter(i => !set.has(i));
      if (pool.length > 0) return elegirAlAzar(pool, rng);
    }
    return elegirAlAzar(vacias, rng);
  }

  if (ganadorasYo.length > 0) {
    return elegirAlAzar(ganadorasYo, rng);
  }

  const compIdRiv = rival === 1 ? COMP_ID_1 : COMP_ID_2;
  const compMaskRiv = rival === 1 ? COMP_MASK_1 : COMP_MASK_2;
  buildComponents(board, topo, rival, compIdRiv, compMaskRiv, false);
  const ganadorasRiv = findWinningCells(board, topo, rival, compIdRiv, compMaskRiv);

  if (dificultad === 'medio') {
    if (ganadorasRiv.length > 0) {
      return elegirAlAzar(ganadorasRiv, rng);
    }
    const bfs = BFS_1;
    for (let s = 0 as 0 | 1 | 2; s < 3; s = (s + 1) as 0 | 1 | 2) {
      bfs01Side(board, topo, yo, s, bfs[s]);
    }
    const puntuadas = vacias.map(u => {
      const d0 = bfs[0][u];
      const d1 = bfs[1][u];
      const d2 = bfs[2][u];
      const sum = d0 + d1 + d2;
      const maxD = Math.max(d0, d1, d2);
      return {
        u,
        score: sum * 100 + maxD * 10 + topo.centralDist[u],
      };
    });
    puntuadas.sort((a, b) => a.score - b.score);
    const topK = Math.min(3, puntuadas.length);
    const top = puntuadas.slice(0, topK).map(x => x.u);
    return elegirAlAzar(top, rng);
  }

  // Difícil: en tablero vacío, jugar en las casillas centrales exactas
  if (vacias.length === total) {
    let minC = Infinity;
    let centros: number[] = [];
    for (let i = 0; i < total; i++) {
      const cd = topo.centralDist[i];
      if (cd < minC) {
        minC = cd;
        centros = [i];
      } else if (cd === minC) {
        centros.push(i);
      }
    }
    return elegirAlAzar(centros, rng);
  }

  // Bloqueo en 1 si existe una única amenaza
  if (ganadorasRiv.length === 1) {
    return ganadorasRiv[0];
  }

  const { rootK, ply2K, ply3K } = branchLimits(state.size);
  const rootInfo = analyzePosition(board, topo, yo, state.lastMove, rootK);
  const rootCandidates =
    ganadorasRiv.length > 1 ? ganadorasRiv : rootInfo.candidates;

  // Profundidad adaptada a fase de partida (apertura 2 plies, medio juego 3 plies, final <= 5 vacías 4 plies)
  const innerDepth =
    vacias.length >= total - 2 ? 1 : vacias.length <= 5 ? 3 : 2;

  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < rootCandidates.length; i++) {
    const mov = rootCandidates[i];
    board[mov] = yo;
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(
      board,
      topo,
      innerDepth,
      -Infinity,
      beta,
      rival,
      mov,
      ply2K,
      ply3K
    );
    board[mov] = 0;

    if (valor > mejor) {
      mejor = valor;
      mejores = [mov];
    } else if (valor === mejor) {
      mejores.push(mov);
    }
  }

  return elegirAlAzar(mejores, rng);
}
