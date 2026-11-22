import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, type CellValue, type CramState, type Move } from './engine';

const TOTAL = TAMANO * TAMANO;
const MASK_18 = 0x3ffff;
const HORIZ_18 = 0x1f7df;
const SHIFT_18 = 0x40000;
const SHIFT_36 = 0x1000000000;
const EXACT_WIN = 100_000;
const MAX_GRUNDY_EXACT = 14;
const MAX_GRUNDY_CACHE = 80_000;
const MAX_TT_CACHE = 40_000;
const MAX_SEARCH_NODES = 1_200;

interface DominoDef {
  id: number;
  a: number;
  b: number;
  maskLo: number;
  maskHi: number;
  centerBias: number;
}

const DOMINOS: DominoDef[] = [];
const H_LO_TO_ID = new Int8Array(18).fill(-1);
const H_HI_TO_ID = new Int8Array(18).fill(-1);
const V_LO_TO_ID = new Int8Array(18).fill(-1);
const V_HI_TO_ID = new Int8Array(18).fill(-1);
const V_MID_TO_ID = new Int8Array(6).fill(-1);

for (let i = 0; i < TOTAL; i++) {
  const fila = Math.floor(i / TAMANO);
  const col = i % TAMANO;
  if (col < TAMANO - 1) {
    const a = i;
    const b = i + 1;
    const id = DOMINOS.length;
    const maskLo = (a < 18 ? 1 << a : 0) | (b < 18 ? 1 << b : 0);
    const maskHi = (a >= 18 ? 1 << (a - 18) : 0) | (b >= 18 ? 1 << (b - 18) : 0);
    const dist =
      Math.abs(fila - 2.5) + Math.abs(col + 0.5 - 2.5);
    DOMINOS.push({ id, a, b, maskLo, maskHi, centerBias: Math.round((5 - dist) * 2) });
    if (a < 18) H_LO_TO_ID[a] = id;
    else H_HI_TO_ID[a - 18] = id;
  }
  if (fila < TAMANO - 1) {
    const a = i;
    const b = i + TAMANO;
    const id = DOMINOS.length;
    const maskLo = (a < 18 ? 1 << a : 0) | (b < 18 ? 1 << b : 0);
    const maskHi = (a >= 18 ? 1 << (a - 18) : 0) | (b >= 18 ? 1 << (b - 18) : 0);
    const dist =
      Math.abs(fila + 0.5 - 2.5) + Math.abs(col - 2.5);
    DOMINOS.push({ id, a, b, maskLo, maskHi, centerBias: Math.round((5 - dist) * 2) });
    if (b < 18) V_LO_TO_ID[a] = id;
    else if (a < 18) V_MID_TO_ID[a - 12] = id;
    else V_HI_TO_ID[a - 18] = id;
  }
}

const POPCOUNT_9 = new Uint8Array(512);
for (let i = 1; i < 512; i++) {
  POPCOUNT_9[i] = POPCOUNT_9[i >> 1] + (i & 1);
}

const REV_6 = new Uint8Array(64);
const MIN_COL_6 = new Uint8Array(64);
const MAX_COL_6 = new Uint8Array(64);
for (let m = 0; m < 64; m++) {
  let rev = 0;
  let minC = 6;
  let maxC = -1;
  for (let c = 0; c < 6; c++) {
    if ((m & (1 << c)) !== 0) {
      rev |= 1 << (5 - c);
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
    }
  }
  REV_6[m] = rev;
  MIN_COL_6[m] = minC;
  MAX_COL_6[m] = maxC < 0 ? 0 : maxC;
}

function popcount18(x: number): number {
  return POPCOUNT_9[x & 0x1ff] + POPCOUNT_9[(x >>> 9) & 0x1ff];
}

function reverse18(x: number): number {
  return (
    (REV_6[x & 0x3f] << 12) |
    (REV_6[(x >>> 6) & 0x3f] << 6) |
    REV_6[(x >>> 12) & 0x3f]
  );
}

function boardToMasks(board: readonly CellValue[]): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < 18; i++) {
    if (board[i] === null) lo |= 1 << i;
  }
  for (let i = 18; i < TOTAL; i++) {
    if (board[i] === null) hi |= 1 << (i - 18);
  }
  return { lo, hi };
}

function contarMovimientos(lo: number, hi: number): number {
  const hLo = lo & (lo >>> 1) & HORIZ_18;
  const hHi = hi & (hi >>> 1) & HORIZ_18;
  const vLo = lo & (lo >>> 6);
  const vHi = hi & (hi >>> 6);
  const vMid = (lo >>> 12) & hi & 0x3f;
  return (
    popcount18(hLo) +
    popcount18(hHi) +
    popcount18(vLo) +
    popcount18(vHi) +
    popcount18(vMid)
  );
}

function tieneMovimientos(lo: number, hi: number): boolean {
  return (
    ((lo & (lo >>> 1) & HORIZ_18) |
      (hi & (hi >>> 1) & HORIZ_18) |
      (lo & (lo >>> 6)) |
      (hi & (hi >>> 6)) |
      ((lo >>> 12) & hi & 0x3f)) !==
    0
  );
}

function listarDominoIds(lo: number, hi: number): number[] {
  const ids: number[] = [];
  let m = lo & (lo >>> 1) & HORIZ_18;
  while (m !== 0) {
    const lsb = m & -m;
    ids.push(H_LO_TO_ID[31 - Math.clz32(lsb)]);
    m ^= lsb;
  }
  m = hi & (hi >>> 1) & HORIZ_18;
  while (m !== 0) {
    const lsb = m & -m;
    ids.push(H_HI_TO_ID[31 - Math.clz32(lsb)]);
    m ^= lsb;
  }
  m = lo & (lo >>> 6);
  while (m !== 0) {
    const lsb = m & -m;
    ids.push(V_LO_TO_ID[31 - Math.clz32(lsb)]);
    m ^= lsb;
  }
  m = (lo >>> 12) & hi & 0x3f;
  while (m !== 0) {
    const lsb = m & -m;
    ids.push(V_MID_TO_ID[31 - Math.clz32(lsb)]);
    m ^= lsb;
  }
  m = hi & (hi >>> 6);
  while (m !== 0) {
    const lsb = m & -m;
    ids.push(V_HI_TO_ID[31 - Math.clz32(lsb)]);
    m ^= lsb;
  }
  return ids;
}

function aMove(id: number): Move {
  const d = DOMINOS[id];
  return { a: d.a, b: d.b };
}

function buscarJugadaSimetrica(
  lo: number,
  hi: number,
  lastMove: Move | null
): Move | null {
  if (lastMove !== null) {
    const a = Math.min(lastMove.a, lastMove.b);
    const b = Math.max(lastMove.a, lastMove.b);
    const ma = TOTAL - 1 - b;
    const mb = TOTAL - 1 - a;
    const mLo = (ma < 18 ? 1 << ma : 0) | (mb < 18 ? 1 << mb : 0);
    const mHi = (ma >= 18 ? 1 << (ma - 18) : 0) | (mb >= 18 ? 1 << (mb - 18) : 0);
    if ((lo & mLo) === mLo && (hi & mHi) === mHi) {
      const nLo = lo ^ mLo;
      const nHi = hi ^ mHi;
      if (reverse18(nLo) === nHi) {
        return { a: ma, b: mb };
      }
    }
  }

  // Fallback si lastMove es null (p. ej. estado sintético) pero falta exactamente 1 dominó para simetría 180°.
  const diffLo = lo & (~reverse18(hi) & MASK_18);
  const diffHi = hi & (~reverse18(lo) & MASK_18);
  if (popcount18(diffLo) + popcount18(diffHi) !== 2) return null;

  const celdas: number[] = [];
  let m = diffLo;
  while (m !== 0) {
    const lsb = m & -m;
    celdas.push(31 - Math.clz32(lsb));
    m ^= lsb;
  }
  m = diffHi;
  while (m !== 0) {
    const lsb = m & -m;
    celdas.push(18 + 31 - Math.clz32(lsb));
    m ^= lsb;
  }
  const [x, y] = celdas;
  const esAdyacente =
    y - x === TAMANO ||
    (y - x === 1 && Math.floor(x / TAMANO) === Math.floor(y / TAMANO));
  return esAdyacente ? { a: x, b: y } : null;
}

interface Componente {
  lo: number;
  hi: number;
  size: number;
}

function extraerComponentes(lo: number, hi: number): Componente[] {
  const hLo = lo & (lo >>> 1) & HORIZ_18;
  const hHi = hi & (hi >>> 1) & HORIZ_18;
  const vLo = lo & (lo >>> 6);
  const vHi = hi & (hi >>> 6);
  const vMid = (lo >>> 12) & hi & 0x3f;
  let remLo = hLo | (hLo << 1) | vLo | (vLo << 6) | (vMid << 12);
  let remHi = hHi | (hHi << 1) | vHi | (vHi << 6) | vMid;

  const comps: Componente[] = [];
  while (remLo !== 0 || remHi !== 0) {
    let cLo = remLo !== 0 ? remLo & -remLo : 0;
    let cHi = cLo === 0 ? remHi & -remHi : 0;

    while (true) {
      const nLo =
        ((cLo & HORIZ_18) << 1) |
        ((cLo >>> 1) & HORIZ_18) |
        ((cLo & 0x0fff) << 6) |
        (cLo >>> 6) |
        ((cHi & 0x3f) << 12);
      const nHi =
        ((cHi & HORIZ_18) << 1) |
        ((cHi >>> 1) & HORIZ_18) |
        ((cHi & 0x0fff) << 6) |
        (cHi >>> 6) |
        (cLo >>> 12);
      const nextLo = (cLo | nLo) & remLo;
      const nextHi = (cHi | nHi) & remHi;
      if (nextLo === cLo && nextHi === cHi) break;
      cLo = nextLo;
      cHi = nextHi;
    }

    remLo ^= cLo;
    remHi ^= cHi;
    comps.push({
      lo: cLo,
      hi: cHi,
      size: popcount18(cLo) + popcount18(cHi),
    });
  }
  return comps;
}

const ROWS_SCRATCH = new Uint8Array(6);
const NORM_SCRATCH = new Uint8Array(6);
const TRANS_SCRATCH = new Uint8Array(6);

function pack6Rows(rows: Uint8Array, len: number, flipH: boolean, flipV: boolean, width: number): number {
  const shiftRev = 6 - width;
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < len; i++) {
    const src = rows[flipV ? len - 1 - i : i];
    const val = flipH ? REV_6[src] >>> shiftRev : src;
    if (i < 3) lo |= val << (i * 6);
    else hi |= val << ((i - 3) * 6);
  }
  return hi * SHIFT_18 + lo;
}

function analizarComponente(
  cLo: number,
  cHi: number,
  necesitaCanonKey = true
): {
  canonKey: number;
  simetricaSinCentro: boolean;
} {
  ROWS_SCRATCH[0] = cLo & 0x3f;
  ROWS_SCRATCH[1] = (cLo >>> 6) & 0x3f;
  ROWS_SCRATCH[2] = (cLo >>> 12) & 0x3f;
  ROWS_SCRATCH[3] = cHi & 0x3f;
  ROWS_SCRATCH[4] = (cHi >>> 6) & 0x3f;
  ROWS_SCRATCH[5] = (cHi >>> 12) & 0x3f;

  let minR = 6;
  let maxR = -1;
  let orMask = 0;
  for (let r = 0; r < 6; r++) {
    const v = ROWS_SCRATCH[r];
    if (v !== 0) {
      if (r < minR) minR = r;
      maxR = r;
      orMask |= v;
    }
  }
  const minC = MIN_COL_6[orMask];
  const maxC = MAX_COL_6[orMask];
  const h = maxR - minR + 1;
  const w = maxC - minC + 1;

  for (let i = 0; i < h; i++) {
    NORM_SCRATCH[i] = ROWS_SCRATCH[minR + i] >>> minC;
  }

  const kId = pack6Rows(NORM_SCRATCH, h, false, false, w);
  const k180 = pack6Rows(NORM_SCRATCH, h, true, true, w);

  let simetricaSinCentro = false;
  if (kId === k180) {
    if ((h & 1) === 0 && (w & 1) === 0) {
      simetricaSinCentro = true;
    } else if ((h & 1) === 1 && (w & 1) === 1) {
      simetricaSinCentro = (NORM_SCRATCH[h >> 1] & (1 << (w >> 1))) === 0;
    } else if ((h & 1) === 1) {
      const mr = h >> 1;
      const midBits = 3 << ((w >> 1) - 1);
      simetricaSinCentro = (NORM_SCRATCH[mr] & midBits) !== midBits;
    } else {
      const mr = (h >> 1) - 1;
      const bit = 1 << (w >> 1);
      simetricaSinCentro = (NORM_SCRATCH[mr] & bit) === 0 || (NORM_SCRATCH[mr + 1] & bit) === 0;
    }
  }

  if (!necesitaCanonKey) {
    return { canonKey: 0, simetricaSinCentro };
  }

  const kH = pack6Rows(NORM_SCRATCH, h, true, false, w);
  const kV = pack6Rows(NORM_SCRATCH, h, false, true, w);

  for (let c = 0; c < w; c++) {
    let t = 0;
    const bit = 1 << c;
    for (let r = 0; r < h; r++) {
      if ((NORM_SCRATCH[r] & bit) !== 0) t |= 1 << r;
    }
    TRANS_SCRATCH[c] = t;
  }

  const kT = pack6Rows(TRANS_SCRATCH, w, false, false, h);
  const kTH = pack6Rows(TRANS_SCRATCH, w, true, false, h);
  const kTV = pack6Rows(TRANS_SCRATCH, w, false, true, h);
  const kT180 = pack6Rows(TRANS_SCRATCH, w, true, true, h);

  const canonKey = Math.min(kId, kH, kV, k180, kT, kTH, kTV, kT180);
  return { canonKey, simetricaSinCentro };
}

const GRUNDY_MEMO = new Map<number, number>();

function grundyComponente(cLo: number, cHi: number, size: number): number {
  if (size <= 1) return 0;
  if (size <= 3) return 1;

  const { canonKey, simetricaSinCentro } = analizarComponente(cLo, cHi);
  if (simetricaSinCentro) return 0;

  const cached = GRUNDY_MEMO.get(canonKey);
  if (cached !== undefined) return cached;

  const moves = listarDominoIds(cLo, cHi);
  let seenMask = 0;
  let seenLarge: Set<number> | null = null;

  for (let i = 0; i < moves.length; i++) {
    const d = DOMINOS[moves[i]];
    const subComps = extraerComponentes(cLo ^ d.maskLo, cHi ^ d.maskHi);
    let gSub = 0;
    for (let j = 0; j < subComps.length; j++) {
      const sc = subComps[j];
      gSub ^= grundyComponente(sc.lo, sc.hi, sc.size);
    }
    if (gSub < 31) {
      seenMask |= 1 << gSub;
    } else {
      if (!seenLarge) seenLarge = new Set();
      seenLarge.add(gSub);
    }
  }

  let mex = 0;
  if (seenMask !== 0x7fffffff) {
    mex = 31 - Math.clz32(~seenMask & (seenMask + 1));
  } else {
    mex = 31;
    while (seenLarge && seenLarge.has(mex)) mex++;
  }

  if (GRUNDY_MEMO.size >= MAX_GRUNDY_CACHE) GRUNDY_MEMO.clear();
  GRUNDY_MEMO.set(canonKey, mex);
  return mex;
}

function grundyTablero(lo: number, hi: number): {
  exact: boolean;
  nimHeap: number;
  largeLo: number;
  largeHi: number;
  maxLargeSize: number;
} {
  const comps = extraerComponentes(lo, hi);
  let nimHeap = 0;
  const grandes: Componente[] = [];

  for (let i = 0; i < comps.length; i++) {
    const c = comps[i];
    if (c.size <= MAX_GRUNDY_EXACT) {
      nimHeap ^= grundyComponente(c.lo, c.hi, c.size);
    } else if (
      (c.size & 1) === 1 ||
      !analizarComponente(c.lo, c.hi, false).simetricaSinCentro
    ) {
      grandes.push(c);
    }
  }

  // Dos componentes isomórficas de tamaño > 14 se anulan mutuamente por Sprague-Grundy.
  if (
    grandes.length === 2 &&
    grandes[0].size === grandes[1].size &&
    analizarComponente(grandes[0].lo, grandes[0].hi, true).canonKey ===
      analizarComponente(grandes[1].lo, grandes[1].hi, true).canonKey
  ) {
    return { exact: true, nimHeap, largeLo: 0, largeHi: 0, maxLargeSize: 0 };
  }

  if (grandes.length === 0) {
    return { exact: true, nimHeap, largeLo: 0, largeHi: 0, maxLargeSize: 0 };
  }

  let largeLo = 0;
  let largeHi = 0;
  let maxLargeSize = 0;
  for (let i = 0; i < grandes.length; i++) {
    largeLo |= grandes[i].lo;
    largeHi |= grandes[i].hi;
    if (grandes[i].size > maxLargeSize) maxLargeSize = grandes[i].size;
  }

  return { exact: false, nimHeap, largeLo, largeHi, maxLargeSize };
}

function elegirEnPerdedoraExacta(lo: number, hi: number, rng: Rng): Move {
  const ids = listarDominoIds(lo, hi);
  const seguras: { id: number; ratioWinRival: number; movilidad: number }[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const d = DOMINOS[id];
    const nLo = lo ^ d.maskLo;
    const nHi = hi ^ d.maskHi;
    const replies = listarDominoIds(nLo, nHi);
    let rivalGanaEn1 = false;
    let rivalGanaOptimo = 0;
    for (let j = 0; j < replies.length; j++) {
      const r = DOMINOS[replies[j]];
      const rLo = nLo ^ r.maskLo;
      const rHi = nHi ^ r.maskHi;
      if (!tieneMovimientos(rLo, rHi)) {
        rivalGanaEn1 = true;
        break;
      }
      if (grundyTablero(rLo, rHi).nimHeap === 0) {
        rivalGanaOptimo++;
      }
    }
    if (!rivalGanaEn1 && replies.length > 0) {
      seguras.push({
        id,
        ratioWinRival: rivalGanaOptimo / replies.length,
        movilidad: replies.length,
      });
    }
  }

  if (seguras.length === 0) return aMove(elegirAlAzar(ids, rng));

  let minRatio = Infinity;
  for (let i = 0; i < seguras.length; i++) {
    if (seguras[i].ratioWinRival < minRatio) minRatio = seguras[i].ratioWinRival;
  }
  const mejores = seguras
    .filter(s => s.ratioWinRival <= minRatio + 1e-9)
    .map(s => aMove(s.id));
  return elegirAlAzar(mejores, rng);
}

const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = 2;

interface TTEntry {
  depth: number;
  flag: number;
  score: number;
  bestMoveCode: number;
}

const TT = new Map<number, TTEntry>();

interface SearchContext {
  nodes: number;
  aborted: boolean;
}

function ordenarCandidatosRapido(ids: number[], ttBestMove: number, limite: number): void {
  const n = ids.length;
  const k = limite < n ? limite : n;
  for (let i = 0; i < k; i++) {
    let bestIdx = i;
    let bestPrio = ids[i] === ttBestMove ? 1_000_000 : DOMINOS[ids[i]].centerBias;
    for (let j = i + 1; j < n; j++) {
      const id = ids[j];
      const prio = id === ttBestMove ? 1_000_000 : DOMINOS[id].centerBias;
      if (prio > bestPrio) {
        bestPrio = prio;
        bestIdx = j;
      }
    }
    if (bestIdx !== i) {
      const tmp = ids[i];
      ids[i] = ids[bestIdx];
      ids[bestIdx] = tmp;
    }
  }
}

function ordenarCandidatosRaiz(
  largeLo: number,
  largeHi: number,
  ids: number[]
): number[] {
  const scored: { id: number; prio: number }[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const d = DOMINOS[id];
    const g = grundyTablero(largeLo ^ d.maskLo, largeHi ^ d.maskHi);
    let prio = d.centerBias;
    if (g.exact) {
      prio += g.nimHeap === 0 ? 500_000 : -500_000;
    } else {
      prio += (36 - g.maxLargeSize) * 10;
    }
    scored[i] = { id, prio };
  }
  scored.sort((a, b) => b.prio - a.prio);
  return scored.map(s => s.id);
}

function negamaxGrande(
  largeLo: number,
  largeHi: number,
  nimHeap: number,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchContext
): number {
  ctx.nodes++;
  if (ctx.nodes >= MAX_SEARCH_NODES) {
    ctx.aborted = true;
    return 0;
  }

  if (largeLo === 0 && largeHi === 0) {
    return nimHeap !== 0 ? EXACT_WIN + depth : -(EXACT_WIN + depth);
  }

  if (depth <= 0) return 0;

  const key = nimHeap * SHIFT_36 + largeHi * SHIFT_18 + largeLo;
  const ttEntry = TT.get(key);
  let ttBest = -999;
  if (ttEntry !== undefined) {
    ttBest = ttEntry.bestMoveCode;
    if (ttEntry.depth >= depth) {
      if (ttEntry.flag === TT_EXACT) return ttEntry.score;
      if (ttEntry.flag === TT_LOWER && ttEntry.score >= beta) return ttEntry.score;
      if (ttEntry.flag === TT_UPPER && ttEntry.score <= alpha) return ttEntry.score;
    }
  }

  const ordenados = listarDominoIds(largeLo, largeHi);
  const largeCells = popcount18(largeLo) + popcount18(largeHi);
  // Con <= 16 casillas grandes, cualquier jugada deja <= 14 y se resuelve exacto sin truncar ancho.
  const limite =
    ordenados.length > 12 && largeCells > MAX_GRUNDY_EXACT + 2
      ? 9
      : ordenados.length;
  const truncado = limite < ordenados.length;
  ordenarCandidatosRapido(ordenados, ttBest, limite);

  const alphaOrig = alpha;
  let bestScore = -Infinity;
  let bestMoveCode = -999;

  // Primero probar reducción en el montón Nim equivalente (si nimHeap > 0)
  for (let k = 0; k < nimHeap; k++) {
    const moveCode = -1 - k;
    const score = -negamaxGrande(largeLo, largeHi, k, depth - 1, -beta, -alpha, ctx);
    if (ctx.aborted) return 0;
    if (score > bestScore) {
      bestScore = score;
      bestMoveCode = moveCode;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta || (depth === 1 && score >= EXACT_WIN)) break;
  }

  if (alpha < beta && !(depth === 1 && bestScore >= EXACT_WIN)) {
    for (let i = 0; i < limite; i++) {
      const id = ordenados[i];
      const d = DOMINOS[id];
      const nextInfo = grundyTablero(largeLo ^ d.maskLo, largeHi ^ d.maskHi);
      let score: number;
      if (nextInfo.exact) {
        const nextTotalG = nextInfo.nimHeap ^ nimHeap;
        score = nextTotalG === 0 ? EXACT_WIN + depth - 1 : -(EXACT_WIN + depth - 1);
      } else if (depth === 1) {
        ctx.nodes++;
        if (ctx.nodes >= MAX_SEARCH_NODES) {
          ctx.aborted = true;
          return 0;
        }
        score = 0;
      } else {
        score = -negamaxGrande(
          nextInfo.largeLo,
          nextInfo.largeHi,
          nextInfo.nimHeap ^ nimHeap,
          depth - 1,
          -beta,
          -alpha,
          ctx
        );
      }
      if (ctx.aborted) return 0;
      if (score > bestScore) {
        bestScore = score;
        bestMoveCode = id;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta || (depth === 1 && score >= EXACT_WIN)) break;
    }
  }

  if (truncado) {
    // Si se truncaron jugadas legales no podemos certificar derrota forzada ni guardar cotas en TT.
    if (bestScore < 0) bestScore = 0;
  } else {
    const flag =
      bestScore <= alphaOrig ? TT_UPPER : bestScore >= beta ? TT_LOWER : TT_EXACT;
    if (TT.size >= MAX_TT_CACHE) TT.clear();
    TT.set(key, { depth, flag, score: bestScore, bestMoveCode });
  }

  return bestScore;
}

function elegirConAlfaBeta(lo: number, hi: number, rng: Rng): Move {
  const ids = listarDominoIds(lo, hi);
  const candidatos = ordenarCandidatosRaiz(lo, hi, ids);
  const raizLimite = candidatos.length > 20 ? 12 : candidatos.length;
  const raiz = candidatos.slice(0, raizLimite);

  const ctx: SearchContext = { nodes: 0, aborted: false };
  let mejoresFinales: number[] = [raiz[0]];
  // En apertura (> 28 casillas) no existen mates a corto horizonte: 1 ply + desempate táctico basta.
  const totalVacias = popcount18(lo) + popcount18(hi);
  const maxDepth = totalVacias > 28 ? 1 : totalVacias > 24 ? 2 : 6;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let bestScore = -Infinity;
    let bestIds: number[] = [];

    for (let i = 0; i < raiz.length; i++) {
      const id = raiz[i];
      const d = DOMINOS[id];
      const nLo = lo ^ d.maskLo;
      const nHi = hi ^ d.maskHi;
      const info = grundyTablero(nLo, nHi);

      let score: number;
      if (info.exact) {
        score = info.nimHeap === 0 ? EXACT_WIN + depth : -(EXACT_WIN + depth);
      } else if (depth === 1) {
        score = 0;
      } else {
        const beta = bestScore === -Infinity ? Infinity : -(bestScore - 1);
        score = -negamaxGrande(
          info.largeLo,
          info.largeHi,
          info.nimHeap,
          depth - 1,
          -Infinity,
          beta,
          ctx
        );
      }

      if (ctx.aborted) break;

      if (score > bestScore) {
        bestScore = score;
        bestIds = [id];
      } else if (score === bestScore) {
        bestIds.push(id);
      }
    }

    if (ctx.aborted) break;
    mejoresFinales = bestIds;
    if (bestScore >= EXACT_WIN) break;
  }

  // Desempate táctico en apertura cuando ningún camino aún alcanza solución exacta:
  // preferir jugadas que fragmentan/reducen el tamaño máximo de componente y dejan menos movilidad.
  if (mejoresFinales.length > 1) {
    let mejorHeur = -Infinity;
    let filtrados: number[] = [];
    for (let i = 0; i < mejoresFinales.length; i++) {
      const id = mejoresFinales[i];
      const d = DOMINOS[id];
      const nLo = lo ^ d.maskLo;
      const nHi = hi ^ d.maskHi;
      const info = grundyTablero(nLo, nHi);
      const heur =
        (info.exact ? (info.nimHeap === 0 ? 10_000 : -10_000) : 0) +
        (36 - info.maxLargeSize) * 20 -
        contarMovimientos(nLo, nHi) +
        d.centerBias;
      if (heur > mejorHeur) {
        mejorHeur = heur;
        filtrados = [id];
      } else if (heur === mejorHeur) {
        filtrados.push(id);
      }
    }
    mejoresFinales = filtrados;
  }

  return aMove(elegirAlAzar(mejoresFinales, rng));
}

function elegirFacil(lo: number, hi: number, rng: Rng): Move {
  const ids = listarDominoIds(lo, hi);
  if (ids.length === 0) return { a: 0, b: 1 };

  const ganadoras: number[] = [];
  const noGanadoras: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const d = DOMINOS[ids[i]];
    if (!tieneMovimientos(lo ^ d.maskLo, hi ^ d.maskHi)) {
      ganadoras.push(ids[i]);
    } else {
      noGanadoras.push(ids[i]);
    }
  }

  if (ganadoras.length > 0) {
    if (noGanadoras.length === 0 || rng() < 0.4) {
      return aMove(elegirAlAzar(ganadoras, rng));
    }
    return aMove(elegirAlAzar(noGanadoras, rng));
  }

  return aMove(elegirAlAzar(ids, rng));
}

function tieneVictoriaEn1(lo: number, hi: number): boolean {
  if (contarMovimientos(lo, hi) > 7) return false;
  const replies = listarDominoIds(lo, hi);
  for (let i = 0; i < replies.length; i++) {
    const r = DOMINOS[replies[i]];
    if (!tieneMovimientos(lo ^ r.maskLo, hi ^ r.maskHi)) return true;
  }
  return false;
}

function elegirMedio(lo: number, hi: number, rng: Rng): Move {
  const ids = listarDominoIds(lo, hi);
  if (ids.length === 0) return { a: 0, b: 1 };

  const ganadoras: number[] = [];
  const seguras: { id: number; movilidad: number; muySegura: boolean }[] = [];
  const todas: { id: number; movilidad: number }[] = [];

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const d = DOMINOS[id];
    const nLo = lo ^ d.maskLo;
    const nHi = hi ^ d.maskHi;
    const movilidad = contarMovimientos(nLo, nHi);
    if (movilidad === 0) {
      ganadoras.push(id);
      continue;
    }

    todas.push({ id, movilidad });
    if (!tieneVictoriaEn1(nLo, nHi)) {
      let rivalTieneTrampa = false;
      if (movilidad <= 14) {
        const replies = listarDominoIds(nLo, nHi);
        for (let j = 0; j < replies.length; j++) {
          const r = DOMINOS[replies[j]];
          const rLo = nLo ^ r.maskLo;
          const rHi = nHi ^ r.maskHi;
          if (contarMovimientos(rLo, rHi) > 14) continue;
          const misResp = listarDominoIds(rLo, rHi);
          let tengoSalida = false;
          for (let k = 0; k < misResp.length; k++) {
            const m = DOMINOS[misResp[k]];
            const mLo = rLo ^ m.maskLo;
            const mHi = rHi ^ m.maskHi;
            if (!tieneMovimientos(mLo, mHi) || !tieneVictoriaEn1(mLo, mHi)) {
              tengoSalida = true;
              break;
            }
          }
          if (!tengoSalida) {
            rivalTieneTrampa = true;
            break;
          }
        }
      }
      seguras.push({ id, movilidad, muySegura: !rivalTieneTrampa });
    }
  }

  if (ganadoras.length > 0) {
    return aMove(elegirAlAzar(ganadoras, rng));
  }

  if (seguras.length > 0) {
    const muySeguras = seguras.filter(s => s.muySegura);
    const candidatas = muySeguras.length > 0 ? muySeguras : seguras;
    let maxMov = -1;
    for (let i = 0; i < candidatas.length; i++) {
      if (candidatas[i].movilidad > maxMov) maxMov = candidatas[i].movilidad;
    }
    const mejores = candidatas.filter(p => p.movilidad === maxMov).map(p => aMove(p.id));
    return elegirAlAzar(mejores, rng);
  }

  let maxMov = -1;
  for (let i = 0; i < todas.length; i++) {
    if (todas[i].movilidad > maxMov) maxMov = todas[i].movilidad;
  }
  const mejores = todas.filter(p => p.movilidad === maxMov).map(p => aMove(p.id));
  return elegirAlAzar(mejores, rng);
}

function elegirDificil(state: CramState, lo: number, hi: number, rng: Rng): Move {
  const ids = listarDominoIds(lo, hi);
  if (ids.length === 0) return { a: 0, b: 1 };

  // Como J2 usa simetría rotacional de 180° mientras el tablero sea simétrico.
  if (state.currentPlayer === 2) {
    const simetrica = buscarJugadaSimetrica(lo, hi, state.lastMove);
    if (simetrica !== null) return simetrica;
  }

  const ganadoras1: number[] = [];
  for (let i = 0; i < ids.length; i++) {
    const d = DOMINOS[ids[i]];
    if (!tieneMovimientos(lo ^ d.maskLo, hi ^ d.maskHi)) {
      ganadoras1.push(ids[i]);
    }
  }
  if (ganadoras1.length > 0) return aMove(elegirAlAzar(ganadoras1, rng));

  // Descomposición por componentes conexas y Sprague-Grundy exacto (<= 14 casillas).
  const rootInfo = grundyTablero(lo, hi);
  if (rootInfo.exact) {
    if (rootInfo.nimHeap !== 0) {
      const ganadorasSG: Move[] = [];
      for (let i = 0; i < ids.length; i++) {
        const d = DOMINOS[ids[i]];
        const child = grundyTablero(lo ^ d.maskLo, hi ^ d.maskHi);
        if (child.exact && child.nimHeap === 0) {
          ganadorasSG.push({ a: d.a, b: d.b });
        }
      }
      if (ganadorasSG.length > 0) {
        return elegirAlAzar(ganadorasSG, rng);
      }
    }
    return elegirEnPerdedoraExacta(lo, hi, rng);
  }

  return elegirConAlfaBeta(lo, hi, rng);
}

/**
 * Elige el siguiente dominó del bot en Cram según la dificultad indicada.
 */
export function elegirMovimiento(
  state: CramState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Move {
  const { lo, hi } = boardToMasks(state.board);
  if (dificultad === 'facil') return elegirFacil(lo, hi, rng);
  if (dificultad === 'medio') return elegirMedio(lo, hi, rng);
  return elegirDificil(state, lo, hi, rng);
}
