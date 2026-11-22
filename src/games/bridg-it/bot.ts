import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { puedeJugar, type BridgItState, type Edge, type Player } from './engine';

const INF = 99;
const TOTAL_SLOTS = 41;
const NODOS_GRILLA = 30;
const NODOS_CONTRAIDOS = 22;
const MAX_PROF = 6;

const SLOT_P1: Edge[] = [];
const SLOT_P2: Edge[] = [];
const P1_U = new Int8Array(TOTAL_SLOTS);
const P1_V = new Int8Array(TOTAL_SLOTS);
const P2_U = new Int8Array(TOTAL_SLOTS);
const P2_V = new Int8Array(TOTAL_SLOTS);

// 0..24: redV(r, c) <-> blueH(r, c) para r=0..4, c=0..4
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    const i = r * 5 + c;
    SLOT_P1.push({ type: 'v', row: r, col: c });
    SLOT_P2.push({ type: 'h', row: r, col: c });
    P1_U[i] = r * 5 + c;
    P1_V[i] = (r + 1) * 5 + c;
    P2_U[i] = r * 6 + c;
    P2_V[i] = r * 6 + c + 1;
  }
}

// 25..40: redH(r, c) <-> blueV(r-1, c+1) para r=1..4, c=0..3
for (let r = 1; r <= 4; r++) {
  for (let c = 0; c < 4; c++) {
    const i = 25 + (r - 1) * 4 + c;
    SLOT_P1.push({ type: 'h', row: r, col: c });
    SLOT_P2.push({ type: 'v', row: r - 1, col: c + 1 });
    P1_U[i] = r * 5 + c;
    P1_V[i] = r * 5 + c + 1;
    P2_U[i] = (r - 1) * 6 + (c + 1);
    P2_V[i] = r * 6 + (c + 1);
  }
}

// Scratches prealocados para 0-1 BFS y alfa-beta (síncrono, sin asignaciones por nodo).
const SLOTS_SCRATCH = new Int8Array(TOTAL_SLOTS);
const DQ_SCRATCH = new Int32Array(128);
const D1_START = new Int32Array(NODOS_GRILLA);
const D1_GOAL = new Int32Array(NODOS_GRILLA);
const D2_START = new Int32Array(NODOS_GRILLA);
const D2_GOAL = new Int32Array(NODOS_GRILLA);
const CAND_BUF = Array.from({ length: MAX_PROF }, () => new Int8Array(TOTAL_SLOTS));
const SCORE_BUF = new Int32Array(TOTAL_SLOTS);

function cargarSlots(state: BridgItState, slots: Int8Array): void {
  let k = 0;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      slots[k++] = state.redV[r][c] ? 1 : state.blueH[r][c] ? 2 : 0;
    }
  }
  for (let r = 1; r <= 4; r++) {
    for (let c = 0; c < 4; c++) {
      slots[k++] = state.redH[r][c] ? 1 : state.blueV[r - 1][c + 1] ? 2 : 0;
    }
  }
}

function slotDeArista(player: Player, edge: Edge): number {
  if (player === 1) {
    if (edge.type === 'v') {
      return edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 4
        ? edge.row * 5 + edge.col
        : -1;
    }
    return edge.row >= 1 && edge.row <= 4 && edge.col >= 0 && edge.col <= 3
      ? 25 + (edge.row - 1) * 4 + edge.col
      : -1;
  }
  if (edge.type === 'h') {
    return edge.row >= 0 && edge.row <= 4 && edge.col >= 0 && edge.col <= 4
      ? edge.row * 5 + edge.col
      : -1;
  }
  return edge.row >= 0 && edge.row <= 3 && edge.col >= 1 && edge.col <= 4
    ? 25 + edge.row * 4 + (edge.col - 1)
    : -1;
}

function listarJugadasLegales(state: BridgItState): Edge[] {
  const legales: Edge[] = [];
  if (state.currentPlayer === 1) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        const edge: Edge = { type: 'h', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const edge: Edge = { type: 'v', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
  } else {
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const edge: Edge = { type: 'h', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        const edge: Edge = { type: 'v', row: r, col: c };
        if (puedeJugar(state, edge)) legales.push(edge);
      }
    }
  }
  return legales;
}

function bfs01(
  slots: Int8Array,
  player: Player,
  desdeMeta: boolean,
  outDist: Int32Array
): number {
  outDist.fill(INF);
  let head = 64;
  let tail = 64;

  if (player === 1) {
    const startR = desdeMeta ? 5 : 0;
    for (let c = 0; c < 5; c++) {
      const idx = startR * 5 + c;
      outDist[idx] = 0;
      DQ_SCRATCH[tail++] = idx;
    }
    while (head < tail) {
      const idx = DQ_SCRATCH[head++];
      const d = outDist[idx];
      const r = (idx / 5) | 0;
      const c = idx % 5;

      if (r > 0) {
        const st = slots[(r - 1) * 5 + c];
        if (st !== 2) {
          const w = st === 1 ? 0 : 1;
          const n = idx - 5;
          if (d + w < outDist[n]) {
            outDist[n] = d + w;
            if (w === 0) DQ_SCRATCH[--head] = n;
            else DQ_SCRATCH[tail++] = n;
          }
        }
      }
      if (r < 5) {
        const st = slots[r * 5 + c];
        if (st !== 2) {
          const w = st === 1 ? 0 : 1;
          const n = idx + 5;
          if (d + w < outDist[n]) {
            outDist[n] = d + w;
            if (w === 0) DQ_SCRATCH[--head] = n;
            else DQ_SCRATCH[tail++] = n;
          }
        }
      }
      if (c > 0 && r >= 1 && r <= 4) {
        const st = slots[25 + (r - 1) * 4 + (c - 1)];
        if (st !== 2) {
          const w = st === 1 ? 0 : 1;
          const n = idx - 1;
          if (d + w < outDist[n]) {
            outDist[n] = d + w;
            if (w === 0) DQ_SCRATCH[--head] = n;
            else DQ_SCRATCH[tail++] = n;
          }
        }
      }
      if (c < 4 && r >= 1 && r <= 4) {
        const st = slots[25 + (r - 1) * 4 + c];
        if (st !== 2) {
          const w = st === 1 ? 0 : 1;
          const n = idx + 1;
          if (d + w < outDist[n]) {
            outDist[n] = d + w;
            if (w === 0) DQ_SCRATCH[--head] = n;
            else DQ_SCRATCH[tail++] = n;
          }
        }
      }
    }
    const targetR = desdeMeta ? 0 : 5;
    let best = INF;
    for (let c = 0; c < 5; c++) {
      if (outDist[targetR * 5 + c] < best) best = outDist[targetR * 5 + c];
    }
    return best;
  }

  const startC = desdeMeta ? 5 : 0;
  for (let r = 0; r < 5; r++) {
    const idx = r * 6 + startC;
    outDist[idx] = 0;
    DQ_SCRATCH[tail++] = idx;
  }
  while (head < tail) {
    const idx = DQ_SCRATCH[head++];
    const d = outDist[idx];
    const r = (idx / 6) | 0;
    const c = idx % 6;

    if (c > 0) {
      const st = slots[r * 5 + (c - 1)];
      if (st !== 1) {
        const w = st === 2 ? 0 : 1;
        const n = idx - 1;
        if (d + w < outDist[n]) {
          outDist[n] = d + w;
          if (w === 0) DQ_SCRATCH[--head] = n;
          else DQ_SCRATCH[tail++] = n;
        }
      }
    }
    if (c < 5) {
      const st = slots[r * 5 + c];
      if (st !== 1) {
        const w = st === 2 ? 0 : 1;
        const n = idx + 1;
        if (d + w < outDist[n]) {
          outDist[n] = d + w;
          if (w === 0) DQ_SCRATCH[--head] = n;
          else DQ_SCRATCH[tail++] = n;
        }
      }
    }
    if (r > 0 && c >= 1 && c <= 4) {
      const st = slots[25 + (r - 1) * 4 + (c - 1)];
      if (st !== 1) {
        const w = st === 2 ? 0 : 1;
        const n = idx - 6;
        if (d + w < outDist[n]) {
          outDist[n] = d + w;
          if (w === 0) DQ_SCRATCH[--head] = n;
          else DQ_SCRATCH[tail++] = n;
        }
      }
    }
    if (r < 4 && c >= 1 && c <= 4) {
      const st = slots[25 + r * 4 + (c - 1)];
      if (st !== 1) {
        const w = st === 2 ? 0 : 1;
        const n = idx + 6;
        if (d + w < outDist[n]) {
          outDist[n] = d + w;
          if (w === 0) DQ_SCRATCH[--head] = n;
          else DQ_SCRATCH[tail++] = n;
        }
      }
    }
  }
  const targetC = desdeMeta ? 0 : 5;
  let best = INF;
  for (let r = 0; r < 5; r++) {
    if (outDist[r * 6 + targetC] < best) best = outDist[r * 6 + targetC];
  }
  return best;
}

function throughSlot(idx: number, player: Player, dS: Int32Array, dG: Int32Array): number {
  const u = player === 1 ? P1_U[idx] : P2_U[idx];
  const v = player === 1 ? P1_V[idx] : P2_V[idx];
  const a = dS[u] + dG[v];
  const b = dS[v] + dG[u];
  return a < b ? a : b;
}

function evaluarNodo(slots: Int8Array, turno: Player): number {
  const m1 = bfs01(slots, 1, false, D1_START);
  if (m1 === 0) return turno === 1 ? 100_000 : -100_000;
  if (m1 >= INF) return turno === 1 ? -100_000 : 100_000;

  const m2 = bfs01(slots, 2, false, D2_START);
  if (m2 === 0) return turno === 2 ? 100_000 : -100_000;
  if (m2 >= INF) return turno === 2 ? -100_000 : 100_000;

  bfs01(slots, 1, true, D1_GOAL);
  bfs01(slots, 2, true, D2_GOAL);

  let short1 = 0;
  let near1 = 0;
  let win1 = 0;
  let short2 = 0;
  let near2 = 0;
  let win2 = 0;

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (slots[i] !== 0) continue;
    const t1 = throughSlot(i, 1, D1_START, D1_GOAL);
    if (t1 === 0) win1++;
    if (t1 === m1 - 1) short1++;
    else if (t1 === m1) near1++;

    const t2 = throughSlot(i, 2, D2_START, D2_GOAL);
    if (t2 === 0) win2++;
    if (t2 === m2 - 1) short2++;
    else if (t2 === m2) near2++;
  }

  if (turno === 1 && win1 > 0) return 90_000;
  if (turno === 2 && win2 > 0) return 90_000;
  if (turno === 1 && win2 >= 2) return -80_000;
  if (turno === 2 && win1 >= 2) return -80_000;

  const myM = turno === 1 ? m1 : m2;
  const opM = turno === 1 ? m2 : m1;
  const myRed = turno === 1 ? short1 - m1 : short2 - m2;
  const opRed = turno === 1 ? short2 - m2 : short1 - m1;
  const myNear = turno === 1 ? near1 : near2;
  const opNear = turno === 1 ? near2 : near1;

  return (opM - myM) * 1000 + (myRed - opRed) * 45 + (myNear - opNear) * 10 + 350;
}

function seleccionarCandidatas(
  slots: Int8Array,
  turno: Player,
  maxK: number,
  prof: number
): number {
  const m1 = bfs01(slots, 1, false, D1_START);
  const m2 = bfs01(slots, 2, false, D2_START);
  bfs01(slots, 1, true, D1_GOAL);
  bfs01(slots, 2, true, D2_GOAL);

  const myM = turno === 1 ? m1 : m2;
  const opM = turno === 1 ? m2 : m1;
  const buf = CAND_BUF[prof];
  let cnt = 0;

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (slots[i] !== 0) continue;
    const t1 = throughSlot(i, 1, D1_START, D1_GOAL);
    const t2 = throughSlot(i, 2, D2_START, D2_GOAL);
    const myT = turno === 1 ? t1 : t2;
    const opT = turno === 1 ? t2 : t1;

    if (myT === 0) {
      buf[0] = i;
      SCORE_BUF[i] = 1_000_000;
      return 1;
    }

    let sc = 0;
    if (opT === 0) sc += 50_000;
    if (myT === myM - 1) sc += 1000;
    else if (myT === myM) sc += 300;
    else sc += Math.max(0, 100 - (myT - myM) * 20);

    if (opT === opM - 1) sc += 900;
    else if (opT === opM) sc += 250;
    else sc += Math.max(0, 80 - (opT - opM) * 20);

    buf[cnt++] = i;
    SCORE_BUF[i] = sc;
  }

  const lim = Math.min(maxK, cnt);
  for (let k = 0; k < lim; k++) {
    let bestPos = k;
    let bestVal = SCORE_BUF[buf[k]];
    for (let j = k + 1; j < cnt; j++) {
      const val = SCORE_BUF[buf[j]];
      if (val > bestVal) {
        bestVal = val;
        bestPos = j;
      }
    }
    const tmp = buf[k];
    buf[k] = buf[bestPos];
    buf[bestPos] = tmp;
  }

  return lim;
}

function negamax(
  slots: Int8Array,
  prof: number,
  alpha: number,
  beta: number,
  turno: Player
): number {
  if (prof === 0) return evaluarNodo(slots, turno);

  const maxK = prof >= 3 ? 6 : prof === 2 ? 6 : 5;
  const lim = seleccionarCandidatas(slots, turno, maxK, prof);
  if (lim === 0) return evaluarNodo(slots, turno);

  const buf = CAND_BUF[prof];
  if (lim === 1 && SCORE_BUF[buf[0]] >= 1_000_000) return 100_000 + prof;

  let mejor = -Infinity;
  const siguiente: Player = turno === 1 ? 2 : 1;
  for (let k = 0; k < lim; k++) {
    const idx = buf[k];
    slots[idx] = turno;
    const val = -negamax(slots, prof - 1, -beta, -alpha, siguiente);
    slots[idx] = 0;
    if (val > mejor) mejor = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return mejor;
}

/**
 * Comprueba mediante partición de matroides (algoritmo de aumentos de Edmonds)
 * si el multigrafo con `numNodes` vértices y `m` aristas admite dos árboles
 * generadores disjuntos en aristas.
 */
function tieneDosArbolesDisjuntos(
  uArr: Int32Array,
  vArr: Int32Array,
  m: number,
  numNodes: number
): boolean {
  if (numNodes <= 1) return true;
  if (m < 2 * (numNodes - 1)) return false;

  const deg = new Int32Array(numNodes);
  for (let i = 0; i < m; i++) {
    deg[uArr[i]]++;
    deg[vArr[i]]++;
  }
  for (let v = 0; v < numNodes; v++) {
    if (deg[v] < 2) return false;
  }

  const p1 = new Int32Array(numNodes);
  const p2 = new Int32Array(numNodes);
  for (let i = 0; i < numNodes; i++) {
    p1[i] = i;
    p2[i] = i;
  }
  const find = (p: Int32Array, x: number): number => {
    while (p[x] !== x) {
      p[x] = p[p[x]];
      x = p[x];
    }
    return x;
  };

  const assign = new Int8Array(m);
  let c1 = 0;
  let c2 = 0;
  for (let i = 0; i < m; i++) {
    const u = uArr[i];
    const v = vArr[i];
    const r1u = find(p1, u);
    const r1v = find(p1, v);
    if (r1u !== r1v) {
      p1[r1u] = r1v;
      assign[i] = 1;
      c1++;
    } else {
      const r2u = find(p2, u);
      const r2v = find(p2, v);
      if (r2u !== r2v) {
        p2[r2u] = r2v;
        assign[i] = 2;
        c2++;
      }
    }
  }

  const target = numNodes - 1;
  if (c1 === target && c2 === target) return true;

  const prevN = new Int32Array(numNodes);
  const prevE = new Int32Array(numNodes);
  const queueN = new Int32Array(numNodes);
  const seen = new Uint8Array(m * 3);
  const prevS = new Int32Array(m * 3);
  const queueS = new Int32Array(m * 3);

  const encontrarCamino = (t: number, start: number, goal: number): boolean => {
    let visMask = 1 << start;
    let qh = 0;
    let qt = 0;
    queueN[qt++] = start;
    while (qh < qt) {
      const cur = queueN[qh++];
      if (cur === goal) return true;
      for (let ei = 0; ei < m; ei++) {
        if (assign[ei] !== t) continue;
        const u = uArr[ei];
        const v = vArr[ei];
        const nxt = u === cur ? v : v === cur ? u : -1;
        if (nxt !== -1 && (visMask & (1 << nxt)) === 0) {
          visMask |= 1 << nxt;
          prevN[nxt] = cur;
          prevE[nxt] = ei;
          queueN[qt++] = nxt;
        }
      }
    }
    return false;
  };

  let total = c1 + c2;
  const needed = 2 * target;
  while (total < needed) {
    seen.fill(0);
    let qh = 0;
    let qt = 0;
    for (let i = 0; i < m; i++) {
      if (assign[i] !== 0) continue;
      const s1 = i * 3 + 1;
      seen[s1] = 1;
      prevS[s1] = -1;
      queueS[qt++] = s1;
      const s2 = i * 3 + 2;
      seen[s2] = 1;
      prevS[s2] = -1;
      queueS[qt++] = s2;
    }

    let found = -1;
    while (qh < qt) {
      const s = queueS[qh++];
      const ei = (s / 3) | 0;
      const t = s % 3;
      const u = uArr[ei];
      const v = vArr[ei];
      if (!encontrarCamino(t, u, v)) {
        found = s;
        break;
      }
      const otherT = t === 1 ? 2 : 1;
      let x = v;
      while (x !== u) {
        const pe = prevE[x];
        const ns = pe * 3 + otherT;
        if (!seen[ns]) {
          seen[ns] = 1;
          prevS[ns] = s;
          queueS[qt++] = ns;
        }
        x = prevN[x];
      }
    }
    if (found === -1) return false;
    let cur = found;
    while (cur !== -1) {
      assign[(cur / 3) | 0] = cur % 3;
      cur = prevS[cur];
    }
    total++;
  }

  return true;
}

/**
 * Estrategia exacta de Lehman (emparejamiento sobre dos árboles generadores
 * disjuntos) para el Jugador 1 sobre la retícula 5×6 contraída.
 * Retorna `null` si la posición actual ya se desvió de cualquier subgrafo con
 * invariante de 2 árboles.
 */
function elegirMovimientoLehmanJ1(state: BridgItState, rng: Rng): Edge | null {
  const uf = new Int32Array(NODOS_CONTRAIDOS);
  for (let i = 0; i < NODOS_CONTRAIDOS; i++) uf[i] = i;

  const find = (x: number): number => {
    while (uf[x] !== x) {
      uf[x] = uf[uf[x]];
      x = uf[x];
    }
    return x;
  };
  const union = (a: number, b: number): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) uf[ra] = rb;
  };

  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (state.redV[r][c]) {
        const u = r === 0 ? 0 : 1 + (r - 1) * 5 + c;
        const v = r === 4 ? 21 : 1 + r * 5 + c;
        union(u, v);
      }
    }
  }
  for (let r = 1; r <= 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (state.redH[r][c]) {
        union(1 + (r - 1) * 5 + c, 1 + (r - 1) * 5 + c + 1);
      }
    }
  }

  const topRoot = find(0);
  const botRoot = find(21);
  if (topRoot === botRoot) return null;

  const rootMap = new Int32Array(NODOS_CONTRAIDOS).fill(-1);
  let numNodes = 0;
  for (let i = 0; i < NODOS_CONTRAIDOS; i++) {
    const ri = find(i);
    if (rootMap[ri] === -1) rootMap[ri] = numNodes++;
  }

  const topN = rootMap[topRoot];
  const botN = rootMap[botRoot];

  interface AristaGrafo {
    edge: Edge;
    u: number;
    v: number;
  }
  const candBruto: AristaGrafo[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (!state.redV[r][c] && !state.blueH[r][c]) {
        const u = rootMap[find(r === 0 ? 0 : 1 + (r - 1) * 5 + c)];
        const v = rootMap[find(r === 4 ? 21 : 1 + r * 5 + c)];
        if (u !== v) candBruto.push({ edge: { type: 'v', row: r, col: c }, u, v });
      }
    }
  }
  for (let r = 1; r <= 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (!state.redH[r][c] && !state.blueV[r - 1][c + 1]) {
        const u = rootMap[find(1 + (r - 1) * 5 + c)];
        const v = rootMap[find(1 + (r - 1) * 5 + c + 1)];
        if (u !== v) candBruto.push({ edge: { type: 'h', row: r, col: c }, u, v });
      }
    }
  }

  // Podar vértices internos muertos (grado <= 1) que nunca pertenecen a 2 árboles.
  const alive = new Uint8Array(numNodes).fill(1);
  let cambio = true;
  while (cambio) {
    cambio = false;
    const deg = new Int32Array(numNodes);
    for (let i = 0; i < candBruto.length; i++) {
      const e = candBruto[i];
      if (alive[e.u] && alive[e.v]) {
        deg[e.u]++;
        deg[e.v]++;
      }
    }
    for (let v = 0; v < numNodes; v++) {
      if (alive[v] && v !== topN && v !== botN && deg[v] <= 1) {
        alive[v] = 0;
        cambio = true;
      }
    }
  }

  const remap = new Int32Array(numNodes).fill(-1);
  let nn = 0;
  for (let v = 0; v < numNodes; v++) {
    if (alive[v]) remap[v] = nn++;
  }
  const tN = remap[topN];
  const bN = remap[botN];
  const cand: AristaGrafo[] = [];
  for (let i = 0; i < candBruto.length; i++) {
    const e = candBruto[i];
    if (alive[e.u] && alive[e.v]) {
      cand.push({ edge: e.edge, u: remap[e.u], v: remap[e.v] });
    }
  }

  const win1 = cand.filter(
    c => (c.u === tN && c.v === bN) || (c.u === bN && c.v === tN)
  );
  if (win1.length > 0) return elegirAlAzar(win1, rng).edge;

  // Barajado Fisher-Yates determinista para variar aperturas y respuestas manteniendo garantía exacta.
  for (let i = cand.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    const tmp = cand[i];
    cand[i] = cand[j];
    cand[j] = tmp;
  }

  const uArr = new Int32Array(TOTAL_SLOTS);
  const vArr = new Int32Array(TOTAL_SLOTS);
  for (let i = 0; i < cand.length; i++) {
    let a = cand[i].u;
    let b = cand[i].v;
    if (a > b) {
      const tmp = a;
      a = b;
      b = tmp;
    }
    let m = 0;
    for (let j = 0; j < cand.length; j++) {
      if (j === i) continue;
      const cu = cand[j].u;
      const cv = cand[j].v;
      const nu = cu === b ? a : cu > b ? cu - 1 : cu;
      const nv = cv === b ? a : cv > b ? cv - 1 : cv;
      if (nu !== nv) {
        uArr[m] = nu;
        vArr[m] = nv;
        m++;
      }
    }
    if (tieneDosArbolesDisjuntos(uArr, vArr, m, nn - 1)) {
      return cand[i].edge;
    }
  }

  return null;
}

/**
 * Elige la siguiente arista del bot de Bridg-It según la dificultad indicada.
 */
export function elegirMovimiento(
  state: BridgItState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Edge {
  const slots = SLOTS_SCRATCH;
  cargarSlots(state, slots);

  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const dS = yo === 1 ? D1_START : D2_START;
  const dG = yo === 1 ? D1_GOAL : D2_GOAL;
  const odS = rival === 1 ? D1_START : D2_START;
  const odG = rival === 1 ? D1_GOAL : D2_GOAL;

  bfs01(slots, yo, false, dS);
  bfs01(slots, yo, true, dG);
  bfs01(slots, rival, false, odS);
  bfs01(slots, rival, true, odG);

  if (dificultad === 'facil') {
    const legales = listarJugadasLegales(state);
    const ganadoras: Edge[] = [];
    const noGanadoras: Edge[] = [];
    for (let i = 0; i < legales.length; i++) {
      const edge = legales[i];
      const sl = slotDeArista(yo, edge);
      if (sl !== -1 && throughSlot(sl, yo, dS, dG) === 0) {
        ganadoras.push(edge);
      } else {
        noGanadoras.push(edge);
      }
    }
    if (ganadoras.length > 0 && (noGanadoras.length === 0 || rng() >= 0.6)) {
      return elegirAlAzar(ganadoras, rng);
    }
    return elegirAlAzar(noGanadoras.length > 0 ? noGanadoras : legales, rng);
  }

  const tabla = yo === 1 ? SLOT_P1 : SLOT_P2;
  const wins: number[] = [];
  const blocks: number[] = [];
  const bestShort: number[] = [];
  let minT = INF;
  let empty = 0;

  for (let i = 0; i < TOTAL_SLOTS; i++) {
    if (slots[i] !== 0) continue;
    empty++;
    const myT = throughSlot(i, yo, dS, dG);
    const opT = throughSlot(i, rival, odS, odG);
    if (myT === 0) wins.push(i);
    if (opT === 0) blocks.push(i);
    if (myT < minT) {
      minT = myT;
      bestShort.length = 0;
      bestShort.push(i);
    } else if (myT === minT) {
      bestShort.push(i);
    }
  }

  if (wins.length > 0) return tabla[elegirAlAzar(wins, rng)];

  if (dificultad === 'medio') {
    if (blocks.length > 0) return tabla[elegirAlAzar(blocks, rng)];
    if (bestShort.length > 0) return tabla[elegirAlAzar(bestShort, rng)];
    return elegirAlAzar(listarJugadasLegales(state), rng);
  }

  // Difícil: J1 usa la estrategia exacta de emparejamiento por 2 árboles disjuntos;
  // si está fuera de libro o es J2, ejecuta alfa-beta (prof. 3-4) sobre 0-1 BFS.
  if (yo === 1) {
    const movLehman = elegirMovimientoLehmanJ1(state, rng);
    if (movLehman) return movLehman;
  }

  if (blocks.length > 0) return tabla[elegirAlAzar(blocks, rng)];

  const prof = empty >= 32 ? 3 : 4;
  const lim = seleccionarCandidatas(slots, yo, 8, prof);
  if (lim === 0) return elegirAlAzar(listarJugadasLegales(state), rng);

  const rootBuf = new Int8Array(CAND_BUF[prof].subarray(0, lim));
  let bestVal = -Infinity;
  let bestList: number[] = [];

  for (let k = 0; k < lim; k++) {
    const idx = rootBuf[k];
    slots[idx] = yo;
    const beta = bestVal === -Infinity ? Infinity : -bestVal + 1;
    const val = -negamax(slots, prof - 1, -Infinity, beta, rival);
    slots[idx] = 0;
    if (val > bestVal) {
      bestVal = val;
      bestList = [idx];
    } else if (val === bestVal) {
      bestList.push(idx);
    }
  }

  return tabla[elegirAlAzar(bestList, rng)];
}
