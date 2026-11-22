import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  ALL_CANDIDATES,
  GRID_SIZE,
  jugarFence,
  pointInPolygon,
  type ConquistaPlayer,
  type ConquistaRegion,
  type ConquistaState,
  type Fence,
  type Point,
} from './engine';

const NUM_VERTICES = GRID_SIZE * GRID_SIZE;
const NUM_CANDS = ALL_CANDIDATES.length;
const WORDS = Math.ceil(NUM_CANDS / 32);
const MAX_FACE_STEPS = 600;

const POINTS_BY_ID: Point[] = Array.from({ length: NUM_VERTICES }, (_, id) => ({
  row: Math.floor(id / GRID_SIZE),
  col: id % GRID_SIZE,
}));

function pointId(p: Point): number {
  return p.row * GRID_SIZE + p.col;
}

// Ángulos precalculados para ordenamiento planar O(grado) sin Math.atan2 en caliente.
const EDGE_ANGLE = new Float64Array(NUM_VERTICES * NUM_VERTICES);
for (let u = 0; u < NUM_VERTICES; u++) {
  const pu = POINTS_BY_ID[u];
  for (let v = 0; v < NUM_VERTICES; v++) {
    if (u === v) continue;
    const pv = POINTS_BY_ID[v];
    EDGE_ANGLE[u * NUM_VERTICES + v] = Math.atan2(pv.row - pu.row, pv.col - pu.col);
  }
}

const KEY_TO_IDX = new Map<string, number>();
const CAND_U = new Uint8Array(NUM_CANDS);
const CAND_V = new Uint8Array(NUM_CANDS);
const CAND_M = new Int8Array(NUM_CANDS);
const CAND_LEN_SQ = new Uint8Array(NUM_CANDS);
const CAND_DIST_CENTER = new Uint8Array(NUM_CANDS);
const CAND_SUBS: Array<Array<[number, number]>> = new Array(NUM_CANDS);
const CAND_MIDS: Point[][] = new Array(NUM_CANDS);

for (let i = 0; i < NUM_CANDS; i++) {
  const info = ALL_CANDIDATES[i];
  KEY_TO_IDX.set(info.key, i);
  const u = pointId(info.fence.a);
  const v = pointId(info.fence.b);
  CAND_U[i] = u;
  CAND_V[i] = v;
  const dr = info.fence.b.row - info.fence.a.row;
  const dc = info.fence.b.col - info.fence.a.col;
  CAND_LEN_SQ[i] = dr * dr + dc * dc;
  const midRow2 = info.fence.a.row + info.fence.b.row;
  const midCol2 = info.fence.a.col + info.fence.b.col;
  CAND_DIST_CENTER[i] = Math.abs(midRow2 - 5) + Math.abs(midCol2 - 5);

  if (info.subSegments.length === 2) {
    const mid: Point = { row: midRow2 / 2, col: midCol2 / 2 };
    const m = pointId(mid);
    CAND_M[i] = m;
    CAND_SUBS[i] = [
      [u, m],
      [m, v],
    ];
  } else {
    CAND_M[i] = -1;
    CAND_SUBS[i] = [[u, v]];
  }
  CAND_MIDS[i] = info.subSegments.map(sub => ({
    row: (sub.a.row + sub.b.row) / 2,
    col: (sub.a.col + sub.b.col) / 2,
  }));
}

const CAND_CONFLICT: Uint32Array[] = ALL_CANDIDATES.map((info, i) => {
  const mask = new Uint32Array(WORDS);
  mask[i >>> 5] |= 1 << (i & 31);
  for (const k of info.collinearGroup) {
    const j = KEY_TO_IDX.get(k);
    if (j !== undefined) mask[j >>> 5] |= 1 << (j & 31);
  }
  for (const k of info.crossesWith) {
    const j = KEY_TO_IDX.get(k);
    if (j !== undefined) mask[j >>> 5] |= 1 << (j & 31);
  }
  return mask;
});

// Scratches reutilizables para el trazador de caras (funciones síncronas no reentrantes)
const CYCLE_BUF = new Uint8Array(MAX_FACE_STEPS + 2);
const VISITED_STAMP = new Uint32Array(NUM_VERTICES * NUM_VERTICES);
let currentStamp = 0;

function nextStamp(): number {
  currentStamp++;
  if (currentStamp >= 0xffffffff) {
    VISITED_STAMP.fill(0);
    currentStamp = 1;
  }
  return currentStamp;
}

function ufFind(parent: Int8Array, x: number): number {
  let root = x;
  while (parent[root] >= 0) root = parent[root];
  let cur = x;
  while (cur !== root) {
    const nxt = parent[cur];
    parent[cur] = root;
    cur = nxt;
  }
  return root;
}

function ufUnion(parent: Int8Array, a: number, b: number): void {
  let ra = ufFind(parent, a);
  let rb = ufFind(parent, b);
  if (ra === rb) return;
  if (parent[ra] > parent[rb]) {
    const tmp = ra;
    ra = rb;
    rb = tmp;
  }
  parent[ra] += parent[rb];
  parent[rb] = ra;
}

interface BoardContext {
  blocked: Uint32Array;
  parent: Int8Array;
  comp: Uint8Array;
  compSize: Uint8Array;
  deg: Uint8Array;
  legales: number[];
  cierres: number[];
  noCierres: number[];
}

function extraerContexto(state: ConquistaState): BoardContext {
  const blocked = new Uint32Array(WORDS);
  const parent = new Int8Array(NUM_VERTICES).fill(-1);
  const deg = new Uint8Array(NUM_VERTICES);

  for (const key of state.fences.keys()) {
    const idx = KEY_TO_IDX.get(key);
    if (idx === undefined) continue;
    const mask = CAND_CONFLICT[idx];
    for (let w = 0; w < WORDS; w++) blocked[w] |= mask[w];
    const subs = CAND_SUBS[idx];
    for (let s = 0; s < subs.length; s++) {
      const [a, b] = subs[s];
      ufUnion(parent, a, b);
      deg[a]++;
      deg[b]++;
    }
  }

  const comp = new Uint8Array(NUM_VERTICES);
  const compSize = new Uint8Array(NUM_VERTICES);
  for (let v = 0; v < NUM_VERTICES; v++) {
    const r = ufFind(parent, v);
    comp[v] = r;
    compSize[v] = -parent[r];
  }

  const legales: number[] = [];
  const cierres: number[] = [];
  const noCierres: number[] = [];
  const hasRegions = state.regions.length > 0;

  for (let i = 0; i < NUM_CANDS; i++) {
    if ((blocked[i >>> 5] & (1 << (i & 31))) !== 0) continue;
    if (hasRegions && !pasaRegiones(i, state.regions)) continue;
    legales.push(i);
    if (cuentaCierres(comp, i) > 0) {
      cierres.push(i);
    } else {
      noCierres.push(i);
    }
  }

  return { blocked, parent, comp, compSize, deg, legales, cierres, noCierres };
}

function pasaRegiones(candIdx: number, regions: readonly ConquistaRegion[]): boolean {
  const mids = CAND_MIDS[candIdx];
  for (let s = 0; s < mids.length; s++) {
    const mid = mids[s];
    for (let r = 0; r < regions.length; r++) {
      if (pointInPolygon(mid, regions[r].vertices)) return false;
    }
  }
  return true;
}

function cuentaCierres(comp: Uint8Array, i: number): number {
  const ru = comp[CAND_U[i]];
  const rv = comp[CAND_V[i]];
  const m = CAND_M[i];
  if (m < 0) return ru === rv ? 1 : 0;
  const rm = comp[m];
  if (ru === rm && rm === rv) return 2;
  if (ru === rm || rm === rv || ru === rv) return 1;
  return 0;
}

function indexarPorComponente(comp: Uint8Array, noCierres: readonly number[]): number[][] {
  const byComp: number[][] = Array.from({ length: NUM_VERTICES }, () => []);
  for (let idx = 0; idx < noCierres.length; idx++) {
    const c = noCierres[idx];
    byComp[comp[CAND_U[c]]].push(c);
    byComp[comp[CAND_V[c]]].push(c);
    const m = CAND_M[c];
    if (m >= 0) byComp[comp[m]].push(c);
  }
  return byComp;
}

function detectarSeguras(
  comp: Uint8Array,
  noCierres: readonly number[],
  byComp: number[][] = indexarPorComponente(comp, noCierres)
): number[] {
  const seguras: number[] = [];
  for (let idx = 0; idx < noCierres.length; idx++) {
    const c = noCierres[idx];
    const ru = comp[CAND_U[c]];
    const rv = comp[CAND_V[c]];
    const m = CAND_M[c];
    const maskC = CAND_CONFLICT[c];
    let regala = false;

    if (m < 0) {
      const list = byComp[ru].length <= byComp[rv].length ? byComp[ru] : byComp[rv];
      for (let k = 0; k < list.length; k++) {
        const j = list[k];
        if ((maskC[j >>> 5] & (1 << (j & 31))) !== 0) continue;
        if (tocaDosDeDos(comp, j, ru, rv)) {
          regala = true;
          break;
        }
      }
    } else {
      const rm = comp[m];
      const lists = [byComp[ru], byComp[rm]];
      for (let l = 0; l < 2 && !regala; l++) {
        const list = lists[l];
        for (let k = 0; k < list.length; k++) {
          const j = list[k];
          if ((maskC[j >>> 5] & (1 << (j & 31))) !== 0) continue;
          if (tocaDosDeTres(comp, j, ru, rm, rv)) {
            regala = true;
            break;
          }
        }
      }
    }

    if (!regala) seguras.push(c);
  }
  return seguras;
}

function tocaDosDeDos(comp: Uint8Array, j: number, r1: number, r2: number): boolean {
  let hits = 0;
  const ju = comp[CAND_U[j]];
  if (ju === r1 || ju === r2) hits++;
  const jv = comp[CAND_V[j]];
  if (jv === r1 || jv === r2) hits++;
  if (hits >= 2) return true;
  const jm = CAND_M[j];
  if (jm >= 0) {
    const jrm = comp[jm];
    if (jrm === r1 || jrm === r2) hits++;
  }
  return hits >= 2;
}

function tocaDosDeTres(comp: Uint8Array, j: number, r1: number, r2: number, r3: number): boolean {
  let hits = 0;
  const ju = comp[CAND_U[j]];
  if (ju === r1 || ju === r2 || ju === r3) hits++;
  const jv = comp[CAND_V[j]];
  if (jv === r1 || jv === r2 || jv === r3) hits++;
  if (hits >= 2) return true;
  const jm = CAND_M[j];
  if (jm >= 0) {
    const jrm = comp[jm];
    if (jrm === r1 || jrm === r2 || jrm === r3) hits++;
  }
  return hits >= 2;
}

// --- Trazador planar rápido de áreas de caras nuevas ---

function insertarEnListaOrdenada(list: number[], u: number, v: number): void {
  const ang = EDGE_ANGLE[u * NUM_VERTICES + v];
  const base = u * NUM_VERTICES;
  let pos = list.length;
  for (let i = 0; i < list.length; i++) {
    if (EDGE_ANGLE[base + list[i]] > ang) {
      pos = i;
      break;
    }
  }
  list.splice(pos, 0, v);
}

function construirAdyacencia(fences: Map<string, ConquistaPlayer>): number[][] {
  const adj: number[][] = Array.from({ length: NUM_VERTICES }, () => []);
  for (const key of fences.keys()) {
    const idx = KEY_TO_IDX.get(key);
    if (idx === undefined) continue;
    const subs = CAND_SUBS[idx];
    for (let s = 0; s < subs.length; s++) {
      const [a, b] = subs[s];
      insertarEnListaOrdenada(adj[a], a, b);
      insertarEnListaOrdenada(adj[b], b, a);
    }
  }
  return adj;
}

function quitarArista(adj: number[][], a: number, b: number): void {
  const ia = adj[a].indexOf(b);
  if (ia >= 0) adj[a].splice(ia, 1);
  const ib = adj[b].indexOf(a);
  if (ib >= 0) adj[b].splice(ib, 1);
}

function trazarCara(
  adj: number[][],
  startU: number,
  startV: number,
  stamp: number
): number {
  let len = 0;
  CYCLE_BUF[len++] = startU;
  let prev = startU;
  let curr = startV;
  VISITED_STAMP[startU * NUM_VERTICES + startV] = stamp;

  for (let i = 0; i < MAX_FACE_STEPS; i++) {
    const neighbors = adj[curr];
    const idx = neighbors.indexOf(prev);
    const next = neighbors[(idx + 1) % neighbors.length];
    if (curr === startU && next === startV) return len;
    CYCLE_BUF[len++] = curr;
    VISITED_STAMP[curr * NUM_VERTICES + next] = stamp;
    prev = curr;
    curr = next;
  }
  return len;
}

function signedAreaBuf(len: number): number {
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const p = POINTS_BY_ID[CYCLE_BUF[i]];
    const q = POINTS_BY_ID[CYCLE_BUF[i + 1 === len ? 0 : i + 1]];
    sum += p.col * q.row - q.col * p.row;
  }
  return sum / 2;
}

function pointInBufPolygon(point: Point, len: number): boolean {
  let inside = false;
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const vi = POINTS_BY_ID[CYCLE_BUF[i]];
    const vj = POINTS_BY_ID[CYCLE_BUF[j]];
    const cruza =
      vi.col > point.col !== vj.col > point.col &&
      point.row < ((vj.row - vi.row) * (point.col - vi.col)) / (vj.col - vi.col) + vi.row;
    if (cruza) inside = !inside;
  }
  return inside;
}

function areaNetaBuf(
  len: number,
  areaBruta: number,
  regions: readonly ConquistaRegion[]
): number {
  if (regions.length === 0) return areaBruta;
  let area = areaBruta;
  for (let r = 0; r < regions.length; r++) {
    const reg = regions[r];
    let comparte = false;
    for (let i = 0; i < reg.vertices.length && !comparte; i++) {
      const rv = reg.vertices[i];
      for (let j = 0; j < len; j++) {
        const cv = POINTS_BY_ID[CYCLE_BUF[j]];
        if (rv.row === cv.row && rv.col === cv.col) {
          comparte = true;
          break;
        }
      }
    }
    if (comparte) continue;
    for (let i = 0; i < reg.vertices.length; i++) {
      if (pointInBufPolygon(reg.vertices[i], len)) {
        area -= reg.area;
        break;
      }
    }
  }
  return area;
}

function areaNuevaDeCierre(
  adj: number[][],
  candIdx: number,
  regions: readonly ConquistaRegion[]
): number {
  const subs = CAND_SUBS[candIdx];
  for (let s = 0; s < subs.length; s++) {
    insertarEnListaOrdenada(adj[subs[s][0]], subs[s][0], subs[s][1]);
    insertarEnListaOrdenada(adj[subs[s][1]], subs[s][1], subs[s][0]);
  }

  const stamp = nextStamp();
  let totalArea = 0;
  for (let s = 0; s < subs.length; s++) {
    const [a, b] = subs[s];
    for (let dir = 0; dir < 2; dir++) {
      const u = dir === 0 ? a : b;
      const v = dir === 0 ? b : a;
      if (VISITED_STAMP[u * NUM_VERTICES + v] === stamp) continue;
      const len = trazarCara(adj, u, v, stamp);
      const signed = signedAreaBuf(len);
      if (signed < 0) {
        totalArea += areaNetaBuf(len, -signed, regions);
      }
    }
  }

  for (let s = 0; s < subs.length; s++) {
    quitarArista(adj, subs[s][0], subs[s][1]);
  }
  return totalArea;
}

// --- Búsqueda táctica y estratégica para Difícil ---

function obtenerCierresQueRegalaConIndice(
  ctx: BoardContext,
  byComp: number[][],
  candIdx: number
): number[] {
  const ru = ctx.comp[CAND_U[candIdx]];
  const rv = ctx.comp[CAND_V[candIdx]];
  const m = CAND_M[candIdx];
  const maskC = CAND_CONFLICT[candIdx];
  const res: number[] = [];

  if (m < 0) {
    const list = byComp[ru].length <= byComp[rv].length ? byComp[ru] : byComp[rv];
    for (let k = 0; k < list.length; k++) {
      const j = list[k];
      if ((maskC[j >>> 5] & (1 << (j & 31))) !== 0) continue;
      if (tocaDosDeDos(ctx.comp, j, ru, rv)) res.push(j);
    }
  } else {
    const rm = ctx.comp[m];
    const seen = new Set<number>();
    for (const r of [ru, rm]) {
      const list = byComp[r];
      for (let k = 0; k < list.length; k++) {
        const j = list[k];
        if (seen.has(j) || (maskC[j >>> 5] & (1 << (j & 31))) !== 0) continue;
        if (tocaDosDeTres(ctx.comp, j, ru, rm, rv)) {
          seen.add(j);
          res.push(j);
        }
      }
    }
  }
  return res;
}

function areaSacrificioRapido(
  state: ConquistaState,
  ctx: BoardContext,
  byComp: number[][],
  adj: number[][],
  candIdx: number
): number {
  const cierresRival = obtenerCierresQueRegalaConIndice(ctx, byComp, candIdx);
  if (cierresRival.length === 0) return 0;

  const subs = CAND_SUBS[candIdx];
  for (let s = 0; s < subs.length; s++) {
    insertarEnListaOrdenada(adj[subs[s][0]], subs[s][0], subs[s][1]);
    insertarEnListaOrdenada(adj[subs[s][1]], subs[s][1], subs[s][0]);
  }

  let maxUnaCara = 0;
  let sumaIndependiente = 0;
  const vistos: Array<{ idx: number; area: number }> = [];

  const maxCheck = Math.min(cierresRival.length, 5);
  for (let k = 0; k < maxCheck; k++) {
    const j = cierresRival[k];
    const area = areaNuevaDeCierre(adj, j, state.regions);
    if (area > maxUnaCara) maxUnaCara = area;
    vistos.push({ idx: j, area });
  }
  if (cierresRival.length > maxCheck) {
    maxUnaCara += (cierresRival.length - maxCheck) * 0.5;
  }

  if (vistos.length === 1) {
    sumaIndependiente = vistos[0].area;
  } else {
    vistos.sort((a, b) => b.area - a.area);
    const elegidos: number[] = [];
    for (let k = 0; k < vistos.length; k++) {
      const cur = vistos[k];
      let choca = false;
      for (let e = 0; e < elegidos.length; e++) {
        const ej = elegidos[e];
        if ((CAND_CONFLICT[ej][cur.idx >>> 5] & (1 << (cur.idx & 31))) !== 0) {
          choca = true;
          break;
        }
      }
      if (!choca) {
        sumaIndependiente += cur.area;
        elegidos.push(cur.idx);
      }
    }
  }

  for (let s = 0; s < subs.length; s++) {
    quitarArista(adj, subs[s][0], subs[s][1]);
  }
  return Math.max(maxUnaCara, sumaIndependiente);
}

function mejorCierreUnPaso(state: ConquistaState): { idx: number; area: number } | null {
  const ctx = extraerContexto(state);
  if (ctx.cierres.length === 0) return null;
  const adj = construirAdyacencia(state.fences);
  let bestIdx = ctx.cierres[0];
  let bestArea = -1;
  for (let k = 0; k < ctx.cierres.length; k++) {
    const c = ctx.cierres[k];
    const area = areaNuevaDeCierre(adj, c, state.regions);
    if (area > bestArea) {
      bestArea = area;
      bestIdx = c;
    }
  }
  return { idx: bestIdx, area: bestArea };
}

function simularCadenaCierresRival(
  stateAfterSacrifice: ConquistaState,
  rival: ConquistaPlayer,
  maxPasos = 4
): { gain: number; terminalState: ConquistaState } {
  let cur = stateAfterSacrifice;
  let gain = 0;
  for (let paso = 0; paso < maxPasos && cur.status === 'playing' && cur.currentPlayer === rival; paso++) {
    const mejor = mejorCierreUnPaso(cur);
    if (!mejor) break;
    gain += mejor.area;
    cur = jugarFence(cur, ALL_CANDIDATES[mejor.idx].fence);
  }
  return { gain, terminalState: cur };
}

function minimoSacrificioRapido(state: ConquistaState): number {
  const ctx = extraerContexto(state);
  if (ctx.legales.length === 0 || ctx.cierres.length > 0) return 0;
  const byComp = indexarPorComponente(ctx.comp, ctx.noCierres);
  const seguras = detectarSeguras(ctx.comp, ctx.noCierres, byComp);
  if (seguras.length > 0) return 0;
  const adj = construirAdyacencia(state.fences);
  let minArea = Infinity;
  const limite = Math.min(ctx.noCierres.length, 12);
  for (let k = 0; k < limite; k++) {
    const c = ctx.noCierres[k];
    const est = areaSacrificioRapido(state, ctx, byComp, adj, c);
    if (est < minArea) minArea = est;
    if (minArea <= 0.5) break;
  }
  return minArea === Infinity ? 0 : minArea;
}

function elegirSacrificioDificil(
  state: ConquistaState,
  ctx: BoardContext,
  byComp: number[][],
  rng: Rng
): Fence {
  if (ctx.noCierres.length === 1) {
    return ALL_CANDIDATES[ctx.noCierres[0]].fence;
  }

  const adj = construirAdyacencia(state.fences);
  const evaluadas = ctx.noCierres.map(idx => ({
    idx,
    est: areaSacrificioRapido(state, ctx, byComp, adj, idx),
  }));
  evaluadas.sort((a, b) => a.est - b.est || CAND_LEN_SQ[a.idx] - CAND_LEN_SQ[b.idx]);

  const limite = Math.min(evaluadas.length, 4);
  const yo = state.currentPlayer;
  const rival: ConquistaPlayer = yo === 1 ? 2 : 1;

  const simuladas: Array<{ c: number; oppGain: number; terminalState: ConquistaState }> = [];
  let minOppGain = Infinity;

  for (let k = 0; k < limite; k++) {
    const c = evaluadas[k].idx;
    const afterSac = jugarFence(state, ALL_CANDIDATES[c].fence);
    const { gain: oppGain, terminalState } = simularCadenaCierresRival(afterSac, rival);
    if (oppGain < minOppGain) minOppGain = oppGain;
    simuladas.push({ c, oppGain, terminalState });
  }

  const empatadas = simuladas.filter(s => s.oppGain <= minOppGain + 1e-6);
  if (empatadas.length === 1) {
    return ALL_CANDIDATES[empatadas[0].c].fence;
  }

  let bestRebote = -Infinity;
  let mejores: number[] = [];
  for (let k = 0; k < empatadas.length; k++) {
    const { c, terminalState } = empatadas[k];
    const rebote =
      terminalState.status === 'playing' && terminalState.currentPlayer === yo
        ? minimoSacrificioRapido(terminalState)
        : 0;
    if (rebote > bestRebote + 1e-6) {
      bestRebote = rebote;
      mejores = [c];
    } else if (Math.abs(rebote - bestRebote) <= 1e-6) {
      mejores.push(c);
    }
  }

  return ALL_CANDIDATES[elegirAlAzar(mejores, rng)].fence;
}

function elegirCierreDificil(
  state: ConquistaState,
  ctx: BoardContext,
  rng: Rng
): Fence {
  if (ctx.cierres.length === 1) {
    return ALL_CANDIDATES[ctx.cierres[0]].fence;
  }

  const adj = construirAdyacencia(state.fences);
  const rank = ctx.cierres.map(idx => ({
    idx,
    area: areaNuevaDeCierre(adj, idx, state.regions),
  }));
  rank.sort((a, b) => b.area - a.area || CAND_LEN_SQ[a.idx] - CAND_LEN_SQ[b.idx]);

  const yo = state.currentPlayer;
  const topN = Math.min(rank.length, 3);
  let bestValor = -Infinity;
  let mejores: number[] = [];

  for (let k = 0; k < topN; k++) {
    const c = rank[k].idx;
    let cur = jugarFence(state, ALL_CANDIDATES[c].fence);
    let gain = cur.scores[yo] - state.scores[yo];

    for (let paso = 0; paso < 3 && cur.status === 'playing' && cur.currentPlayer === yo; paso++) {
      const sig = mejorCierreUnPaso(cur);
      if (!sig) break;
      const prevScore = cur.scores[yo];
      cur = jugarFence(cur, ALL_CANDIDATES[sig.idx].fence);
      gain += cur.scores[yo] - prevScore;
    }

    let postValor = 0;
    if (cur.status === 'finished') {
      postValor = 500;
    } else {
      const postCtx = extraerContexto(cur);
      const postSeguras = detectarSeguras(postCtx.comp, postCtx.noCierres);
      postValor = postSeguras.length > 0 ? 10 + Math.min(20, postSeguras.length) * 0.1 : 0;
    }

    const valor = gain * 100 + postValor + rank[k].area * 0.1 - CAND_LEN_SQ[c] * 0.01;
    if (valor > bestValor + 1e-6) {
      bestValor = valor;
      mejores = [c];
    } else if (Math.abs(valor - bestValor) <= 1e-6) {
      mejores.push(c);
    }
  }

  return ALL_CANDIDATES[elegirAlAzar(mejores, rng)].fence;
}

// --- Búsqueda alfa-beta acotada para el tramo final de vallas seguras ---

interface SearchLimits {
  nodes: number;
  maxNodes: number;
}

function calcularSegurasEnBusqueda(
  blocked: Uint32Array,
  parent: Int8Array,
  initialLegales: readonly number[]
): { seguras: number[]; legalesCount: number } {
  const comp = new Uint8Array(NUM_VERTICES);
  for (let v = 0; v < NUM_VERTICES; v++) comp[v] = ufFind(parent, v);

  const noCierres: number[] = [];
  for (let k = 0; k < initialLegales.length; k++) {
    const c = initialLegales[k];
    if ((blocked[c >>> 5] & (1 << (c & 31))) !== 0) continue;
    noCierres.push(c);
  }
  return {
    seguras: detectarSeguras(comp, noCierres),
    legalesCount: noCierres.length,
  };
}

function negamaxSeguras(
  blocked: Uint32Array,
  parent: Int8Array,
  initialLegales: readonly number[],
  depth: number,
  alpha: number,
  beta: number,
  limits: SearchLimits
): number {
  limits.nodes++;
  const { seguras, legalesCount } = calcularSegurasEnBusqueda(blocked, parent, initialLegales);

  if (seguras.length === 0) {
    return legalesCount === 0 ? 0 : -1000 - depth;
  }
  if (depth === 0 || limits.nodes >= limits.maxNodes) {
    return 0;
  }

  let mejor = -Infinity;
  const nextBlocked = new Uint32Array(WORDS);

  for (let k = 0; k < seguras.length; k++) {
    const c = seguras[k];
    const mask = CAND_CONFLICT[c];
    for (let w = 0; w < WORDS; w++) nextBlocked[w] = blocked[w] | mask[w];
    const nextParent = new Int8Array(parent);
    const subs = CAND_SUBS[c];
    for (let s = 0; s < subs.length; s++) {
      ufUnion(nextParent, subs[s][0], subs[s][1]);
    }

    const val = -negamaxSeguras(
      nextBlocked,
      nextParent,
      initialLegales,
      depth - 1,
      -beta,
      -alpha,
      limits
    );
    if (val > mejor) mejor = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta || limits.nodes >= limits.maxNodes) break;
  }
  return mejor;
}

function puntuarSeguraPosicional(ctx: BoardContext, c: number): number {
  const u = CAND_U[c];
  const v = CAND_V[c];
  const m = CAND_M[c];
  let score = 0;
  score -= CAND_LEN_SQ[c] * 4;
  const degSum = ctx.deg[u] + ctx.deg[v] + (m >= 0 ? ctx.deg[m] : 0);
  score -= degSum * 3;
  const compSum = ctx.compSize[u] + ctx.compSize[v] + (m >= 0 ? ctx.compSize[m] : 0);
  score -= compSum * 2;
  score -= CAND_DIST_CENTER[c] * 0.5;
  return score;
}

function elegirSeguraDificil(
  ctx: BoardContext,
  seguras: number[],
  rng: Rng
): Fence {
  if (seguras.length === 1) return ALL_CANDIDATES[seguras[0]].fence;

  const ordenadas = [...seguras].sort(
    (a, b) => puntuarSeguraPosicional(ctx, b) - puntuarSeguraPosicional(ctx, a)
  );

  if (ordenadas.length <= 14) {
    const limits: SearchLimits = { nodes: 0, maxNodes: 250 };
    const depth = Math.min(6, ordenadas.length);
    let bestSearch = -Infinity;
    let mejores: number[] = [];
    const nextBlocked = new Uint32Array(WORDS);

    for (let k = 0; k < ordenadas.length; k++) {
      const c = ordenadas[k];
      const mask = CAND_CONFLICT[c];
      for (let w = 0; w < WORDS; w++) nextBlocked[w] = ctx.blocked[w] | mask[w];
      const nextParent = new Int8Array(ctx.parent);
      const subs = CAND_SUBS[c];
      for (let s = 0; s < subs.length; s++) {
        ufUnion(nextParent, subs[s][0], subs[s][1]);
      }

      const val = -negamaxSeguras(
        nextBlocked,
        nextParent,
        ctx.legales,
        depth - 1,
        -Infinity,
        Infinity,
        limits
      );
      if (val > bestSearch) {
        bestSearch = val;
        mejores = [c];
      } else if (val === bestSearch) {
        mejores.push(c);
      }
      if (limits.nodes >= limits.maxNodes) break;
    }

    if (mejores.length > 0) {
      const topScore = puntuarSeguraPosicional(ctx, mejores[0]);
      const topPosicional = mejores.filter(
        c => Math.abs(puntuarSeguraPosicional(ctx, c) - topScore) <= 1.5
      );
      return ALL_CANDIDATES[elegirAlAzar(topPosicional, rng)].fence;
    }
  }

  const nextBlocked = new Uint32Array(WORDS);
  const trampaLimite = Math.min(8, ordenadas.length);
  for (let k = 0; k < trampaLimite; k++) {
    const c = ordenadas[k];
    const mask = CAND_CONFLICT[c];
    for (let w = 0; w < WORDS; w++) nextBlocked[w] = ctx.blocked[w] | mask[w];
    const nextParent = new Int8Array(ctx.parent);
    const subs = CAND_SUBS[c];
    for (let s = 0; s < subs.length; s++) {
      ufUnion(nextParent, subs[s][0], subs[s][1]);
    }
    const { seguras: segDespues, legalesCount } = calcularSegurasEnBusqueda(
      nextBlocked,
      nextParent,
      ctx.legales
    );
    if (segDespues.length === 0 && legalesCount > 0) {
      return ALL_CANDIDATES[c].fence;
    }
  }

  const topScore = puntuarSeguraPosicional(ctx, ordenadas[0]);
  const top = ordenadas.filter(c => puntuarSeguraPosicional(ctx, c) >= topScore - 3);
  return ALL_CANDIDATES[elegirAlAzar(top.slice(0, Math.min(4, top.length)), rng)].fence;
}

/**
 * Elige la siguiente valla del bot de Conquista según la dificultad indicada.
 */
export function elegirMovimiento(
  state: ConquistaState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Fence {
  const ctx = extraerContexto(state);
  if (ctx.legales.length === 0) {
    return ALL_CANDIDATES[0].fence;
  }

  if (dificultad === 'facil') {
    if (ctx.cierres.length > 0) {
      if (ctx.noCierres.length === 0 || rng() < 0.45) {
        return ALL_CANDIDATES[elegirAlAzar(ctx.cierres, rng)].fence;
      }
      return ALL_CANDIDATES[elegirAlAzar(ctx.noCierres, rng)].fence;
    }
    return ALL_CANDIDATES[elegirAlAzar(ctx.legales, rng)].fence;
  }

  if (dificultad === 'medio') {
    if (ctx.cierres.length > 0) {
      const adj = construirAdyacencia(state.fences);
      let maxArea = -1;
      let mejores: number[] = [];
      for (let k = 0; k < ctx.cierres.length; k++) {
        const c = ctx.cierres[k];
        const area = areaNuevaDeCierre(adj, c, state.regions);
        if (area > maxArea + 1e-6) {
          maxArea = area;
          mejores = [c];
        } else if (Math.abs(area - maxArea) <= 1e-6) {
          mejores.push(c);
        }
      }
      return ALL_CANDIDATES[elegirAlAzar(mejores, rng)].fence;
    }

    const byComp = indexarPorComponente(ctx.comp, ctx.noCierres);
    const seguras = detectarSeguras(ctx.comp, ctx.noCierres, byComp);
    if (seguras.length > 0) {
      return ALL_CANDIDATES[elegirAlAzar(seguras, rng)].fence;
    }
    return ALL_CANDIDATES[elegirAlAzar(ctx.noCierres, rng)].fence;
  }

  if (ctx.cierres.length > 0) {
    return elegirCierreDificil(state, ctx, rng);
  }

  const byComp = indexarPorComponente(ctx.comp, ctx.noCierres);
  const seguras = detectarSeguras(ctx.comp, ctx.noCierres, byComp);
  if (seguras.length > 0) {
    return elegirSeguraDificil(ctx, seguras, rng);
  }

  return elegirSacrificioDificil(state, ctx, byComp, rng);
}
