import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, TOTAL, type SnakesState } from './engine';

const CENTRO = Math.floor(TOTAL / 2); // (3, 3) = 24
const INF = 255;
const SCORE_VICTORIA = 60_000;
const SCORE_COMPONENTE_EXACTA = 45_000;
const MAX_NODOS_BUSQUEDA = 1_200;
const MAX_NODOS_COMPONENTE_RAIZ = 1_500;
const MAX_NODOS_COMPONENTE_NODO = 200;
const MAX_PROFUNDIDAD = 12;

const PARIDAD = new Uint8Array(TOTAL);
const DIST_CENTRO = new Uint8Array(TOTAL);
const VECINOS: Uint8Array[] = Array.from({ length: TOTAL }, (_, idx) => {
  const f = Math.floor(idx / TAMANO);
  const c = idx % TAMANO;
  PARIDAD[idx] = (f + c) & 1;
  DIST_CENTRO[idx] = Math.abs(f - 3) + Math.abs(c - 3);
  const lista: number[] = [];
  if (f > 0) lista.push(idx - TAMANO);
  if (f < TAMANO - 1) lista.push(idx + TAMANO);
  if (c > 0) lista.push(idx - 1);
  if (c < TAMANO - 1) lista.push(idx + 1);
  return Uint8Array.from(lista);
});

// Buffers reutilizables para evitar asignaciones en los bucles calientes.
const BOARD_BUF = new Uint8Array(TOTAL);
const BFS_DIST_A = new Uint8Array(TOTAL);
const BFS_DIST_B = new Uint8Array(TOTAL);
const BFS_QUEUE = new Uint8Array(TOTAL);
const VOR_OWNER = new Uint8Array(TOTAL);
const VOR_DIST = new Uint8Array(TOTAL);
const VOR_QUEUE_A = new Uint8Array(TOTAL);
const VOR_QUEUE_B = new Uint8Array(TOTAL);
const COMP_VISITED = new Uint8Array(TOTAL);
const MOVES_STACK = new Uint8Array((MAX_PROFUNDIDAD + 2) * 4);
const ORDEN_SCORES = new Int32Array(4);

function cargarEstado(state: SnakesState, board: Uint8Array): { c1: number; c2: number } {
  board.fill(0);
  const p1 = state.caminos[1];
  const p2 = state.caminos[2];
  for (let i = 0; i < p1.length; i++) board[p1[i]] = 1;
  for (let i = 0; i < p2.length; i++) board[p2[i]] = 1;
  return { c1: p1[p1.length - 1], c2: p2[p2.length - 1] };
}

function obtenerLibres(board: Uint8Array, cabeza: number): number[] {
  const vecs = VECINOS[cabeza];
  const libres: number[] = [];
  for (let i = 0; i < vecs.length; i++) {
    const v = vecs[i];
    if (board[v] === 0) libres.push(v);
  }
  return libres;
}

function contarLibres(board: Uint8Array, cabeza: number): number {
  const vecs = VECINOS[cabeza];
  let n = 0;
  for (let i = 0; i < vecs.length; i++) {
    if (board[vecs[i]] === 0) n++;
  }
  return n;
}

function encierraRivalEnUno(board: Uint8Array, move: number, rivalHead: number): boolean {
  board[move] = 1;
  const atrapado = contarLibres(board, rivalHead) === 0;
  board[move] = 0;
  return atrapado;
}

function bfsDistancias(
  board: Uint8Array,
  origen: number,
  distOut: Uint8Array
): number {
  distOut.fill(INF);
  let head = 0;
  let tail = 0;
  const vecs0 = VECINOS[origen];
  for (let i = 0; i < vecs0.length; i++) {
    const v = vecs0[i];
    if (board[v] === 0 && distOut[v] === INF) {
      distOut[v] = 1;
      BFS_QUEUE[tail++] = v;
    }
  }
  while (head < tail) {
    const u = BFS_QUEUE[head++];
    const dNext = distOut[u] + 1;
    const vecs = VECINOS[u];
    for (let i = 0; i < vecs.length; i++) {
      const v = vecs[i];
      if (board[v] === 0 && distOut[v] === INF) {
        distOut[v] = dNext;
        BFS_QUEUE[tail++] = v;
      }
    }
  }
  return tail;
}

function elegirFacil(
  board: Uint8Array,
  libres: number[],
  rivalHead: number,
  rng: Rng
): number {
  const ganadoras: number[] = [];
  const otras: number[] = [];
  for (let i = 0; i < libres.length; i++) {
    const m = libres[i];
    if (encierraRivalEnUno(board, m, rivalHead)) {
      ganadoras.push(m);
    } else {
      otras.push(m);
    }
  }
  if (ganadoras.length > 0 && (otras.length === 0 || rng() < 0.35)) {
    return elegirAlAzar(ganadoras, rng);
  }
  return elegirAlAzar(otras.length > 0 ? otras : ganadoras, rng);
}

function elegirMedio(
  board: Uint8Array,
  libres: number[],
  rivalHead: number,
  rng: Rng
): number {
  const ganadoras: number[] = [];
  for (let i = 0; i < libres.length; i++) {
    if (encierraRivalEnUno(board, libres[i], rivalHead)) {
      ganadoras.push(libres[i]);
    }
  }
  if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);

  // Descartar salidas sin continuación si existen otras opciones.
  const conSalida: number[] = [];
  for (let i = 0; i < libres.length; i++) {
    const m = libres[i];
    board[m] = 1;
    const salidas = contarLibres(board, m);
    board[m] = 0;
    if (salidas > 0) conSalida.push(m);
  }
  const candidatas = conSalida.length > 0 ? conSalida : libres;

  // Evitar jugadas que permiten al rival encerrar en 1 en el siguiente turno.
  const seguras: number[] = [];
  for (let i = 0; i < candidatas.length; i++) {
    const m = candidatas[i];
    board[m] = 1;
    let rivalGanaEnUno = false;
    const vecsR = VECINOS[rivalHead];
    for (let j = 0; j < vecsR.length; j++) {
      const r = vecsR[j];
      if (board[r] === 0 && encierraRivalEnUno(board, r, m)) {
        rivalGanaEnUno = true;
        break;
      }
    }
    board[m] = 0;
    if (!rivalGanaEnUno) seguras.push(m);
  }
  const pool = seguras.length > 0 ? seguras : candidatas;

  let mejorScore = -Infinity;
  let mejores: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    const m = pool[i];
    board[m] = 1;
    const area = bfsDistancias(board, m, BFS_DIST_A);
    const salidas = contarLibres(board, m);
    board[m] = 0;
    // Prioridad absoluta al área BFS; en empate, preferir más salidas y control central.
    const score = area * 32 + salidas * 6 - DIST_CENTRO[m];
    if (score > mejorScore) {
      mejorScore = score;
      mejores = [m];
    } else if (score === mejorScore) {
      mejores.push(m);
    }
  }
  return elegirAlAzar(mejores, rng);
}

interface ResultadoCamino {
  len: number;
  maxTeorico: number;
  exact: boolean;
  nodos: number;
}

/**
 * Calcula el camino simple más largo desde `cabeza` en su componente conexa,
 * usando cota superior de paridad en O(1) y ordenamiento tipo Warnsdorff.
 */
function caminoMasLargo(board: Uint8Array, cabeza: number, maxNodos: number): ResultadoCamino {
  COMP_VISITED.fill(0);
  let head = 0;
  let tail = 0;
  let nEven = 0;
  let nOdd = 0;

  const vecs0 = VECINOS[cabeza];
  for (let i = 0; i < vecs0.length; i++) {
    const v = vecs0[i];
    if (board[v] === 0 && COMP_VISITED[v] === 0) {
      COMP_VISITED[v] = 1;
      BFS_QUEUE[tail++] = v;
      if (PARIDAD[v] === 0) nEven++;
      else nOdd++;
    }
  }
  while (head < tail) {
    const u = BFS_QUEUE[head++];
    const vecs = VECINOS[u];
    for (let i = 0; i < vecs.length; i++) {
      const v = vecs[i];
      if (board[v] === 0 && COMP_VISITED[v] === 0) {
        COMP_VISITED[v] = 1;
        BFS_QUEUE[tail++] = v;
        if (PARIDAD[v] === 0) nEven++;
        else nOdd++;
      }
    }
  }

  if (tail <= 1) return { len: tail, maxTeorico: tail, exact: true, nodos: 1 };

  const startOther = PARIDAD[cabeza] === 0 ? nOdd : nEven;
  const startSame = PARIDAD[cabeza] === 0 ? nEven : nOdd;
  const maxTeorico = 2 * Math.min(startOther, startSame) + (startOther > startSame ? 1 : 0);
  if (maxTeorico <= 1) return { len: maxTeorico, maxTeorico, exact: true, nodos: 1 };

  let mejor = 0;
  let nodos = 0;
  let abortado = false;

  function intentar(nxt: number, depth: number, remEven: number, remOdd: number): void {
    board[nxt] = 1;
    if (PARIDAD[nxt] === 0) {
      dfs(nxt, depth + 1, remEven - 1, remOdd);
    } else {
      dfs(nxt, depth + 1, remEven, remOdd - 1);
    }
    board[nxt] = 0;
  }

  function dfs(pos: number, depth: number, remEven: number, remOdd: number): void {
    if (depth > mejor) {
      mejor = depth;
      if (mejor >= maxTeorico) return;
    }
    nodos++;
    if (nodos >= maxNodos) {
      abortado = true;
      return;
    }

    const rOther = PARIDAD[pos] === 0 ? remOdd : remEven;
    const rSame = PARIDAD[pos] === 0 ? remEven : remOdd;
    const cota = depth + 2 * Math.min(rOther, rSame) + (rOther > rSame ? 1 : 0);
    if (cota <= mejor) return;

    const vecs = VECINOS[pos];
    let c0 = -1;
    let d0 = 9;
    let c1 = -1;
    let d1 = 9;
    let c2 = -1;
    let d2 = 9;
    let count = 0;

    for (let i = 0; i < vecs.length; i++) {
      const v = vecs[i];
      if (board[v] !== 0) continue;
      let deg = 0;
      const vv = VECINOS[v];
      for (let j = 0; j < vv.length; j++) {
        if (board[vv[j]] === 0) deg++;
      }
      if (count === 0) {
        c0 = v;
        d0 = deg;
      } else if (count === 1) {
        if (deg < d0) {
          c1 = c0;
          d1 = d0;
          c0 = v;
          d0 = deg;
        } else {
          c1 = v;
          d1 = deg;
        }
      } else if (count === 2) {
        if (deg < d0) {
          c2 = c1;
          d2 = d1;
          c1 = c0;
          d1 = d0;
          c0 = v;
          d0 = deg;
        } else if (deg < d1) {
          c2 = c1;
          d2 = d1;
          c1 = v;
          d1 = deg;
        } else {
          c2 = v;
          d2 = deg;
        }
      }
      count++;
    }

    if (count === 0) return;

    intentar(c0, depth, remEven, remOdd);
    if (abortado || mejor >= maxTeorico || count < 2) return;
    intentar(c1, depth, remEven, remOdd);
    if (abortado || mejor >= maxTeorico || count < 3) return;
    intentar(c2, depth, remEven, remOdd);
  }

  dfs(cabeza, 0, nEven, nOdd);
  return { len: mejor, maxTeorico, exact: !abortado, nodos };
}

function puntuarComponentesSeparadas(
  board: Uint8Array,
  miCabeza: number,
  rivalCabeza: number,
  maxNodosComp: number,
  ctx?: ContextoBusqueda
): number {
  const resMi = caminoMasLargo(board, miCabeza, maxNodosComp);
  const resRiv = caminoMasLargo(board, rivalCabeza, maxNodosComp);
  if (ctx) {
    ctx.nodos += Math.floor((resMi.nodos + resRiv.nodos) / 4);
  }
  const diff = resMi.len - resRiv.len;
  if (resMi.len > resRiv.maxTeorico || (resRiv.exact && resMi.len > resRiv.len)) {
    return SCORE_COMPONENTE_EXACTA + diff * 100;
  }
  if (resRiv.len >= resMi.maxTeorico || (resMi.exact && resRiv.len >= resMi.len)) {
    return -SCORE_COMPONENTE_EXACTA + diff * 100;
  }
  return diff * 600 + (diff > 0 ? 250 : -250);
}

/**
 * Evalúa el estado con BFS simultáneo (Voronoi por oleadas), detección de
 * componentes separadas, accesibilidad y paridad de tablero.
 */
function evaluarEstado(
  board: Uint8Array,
  miCabeza: number,
  rivalCabeza: number,
  ctx?: ContextoBusqueda
): number {
  const mobMi = contarLibres(board, miCabeza);
  if (mobMi === 0) return -SCORE_VICTORIA;
  const mobRival = contarLibres(board, rivalCabeza);
  if (mobRival === 0) return SCORE_VICTORIA;

  VOR_OWNER.fill(0);
  VOR_DIST.fill(INF);
  let hA = 0;
  let tA = 0;
  let hB = 0;
  let tB = 0;
  let conectados = false;

  const vMi = VECINOS[miCabeza];
  for (let i = 0; i < vMi.length; i++) {
    const v = vMi[i];
    if (board[v] === 0 && VOR_OWNER[v] === 0) {
      VOR_OWNER[v] = 1;
      VOR_DIST[v] = 1;
      VOR_QUEUE_A[tA++] = v;
    }
  }

  const vRiv = VECINOS[rivalCabeza];
  for (let i = 0; i < vRiv.length; i++) {
    const v = vRiv[i];
    if (board[v] !== 0) continue;
    const own = VOR_OWNER[v];
    if (own === 0) {
      VOR_OWNER[v] = 2;
      VOR_DIST[v] = 1;
      VOR_QUEUE_B[tB++] = v;
    } else if (own === 1) {
      VOR_OWNER[v] = 3;
      conectados = true;
      VOR_QUEUE_B[tB++] = v;
    }
  }

  let dist = 2;
  while (hA < tA || hB < tB) {
    const endA = tA;
    while (hA < endA) {
      const u = VOR_QUEUE_A[hA++];
      const vecs = VECINOS[u];
      for (let i = 0; i < vecs.length; i++) {
        const v = vecs[i];
        if (board[v] !== 0) continue;
        const own = VOR_OWNER[v];
        if (own === 0) {
          VOR_OWNER[v] = 1;
          VOR_DIST[v] = dist;
          VOR_QUEUE_A[tA++] = v;
        } else if (own === 2) {
          conectados = true;
        }
      }
    }

    const endB = tB;
    while (hB < endB) {
      const u = VOR_QUEUE_B[hB++];
      const vecs = VECINOS[u];
      for (let i = 0; i < vecs.length; i++) {
        const v = vecs[i];
        if (board[v] !== 0) continue;
        const own = VOR_OWNER[v];
        if (own === 0) {
          VOR_OWNER[v] = 2;
          VOR_DIST[v] = dist;
          VOR_QUEUE_B[tB++] = v;
        } else if (own === 1) {
          conectados = true;
          if (VOR_DIST[v] === dist) {
            VOR_OWNER[v] = 3;
            VOR_QUEUE_B[tB++] = v;
          }
        }
      }
    }

    dist++;
  }

  if (!conectados) {
    return puntuarComponentesSeparadas(
      board,
      miCabeza,
      rivalCabeza,
      MAX_NODOS_COMPONENTE_NODO,
      ctx
    );
  }

  let miRaw = 0;
  let rivRaw = 0;
  let ties = 0;
  let miEven = 0;
  let miOdd = 0;
  let rivEven = 0;
  let rivOdd = 0;
  let miDeg2 = 0;
  let rivDeg2 = 0;

  for (let i = 0; i < TOTAL; i++) {
    const own = VOR_OWNER[i];
    if (own === 0) continue;

    if (own === 3) {
      ties++;
      continue;
    }

    let freeDeg = 0;
    const vecs = VECINOS[i];
    for (let j = 0; j < vecs.length; j++) {
      if (board[vecs[j]] === 0) freeDeg++;
    }

    if (own === 1) {
      miRaw++;
      if (PARIDAD[i] === 0) miEven++;
      else miOdd++;
      if (freeDeg >= 2) miDeg2++;
    } else {
      rivRaw++;
      if (PARIDAD[i] === 0) rivEven++;
      else rivOdd++;
      if (freeDeg >= 2) rivDeg2++;
    }
  }

  const miOther = PARIDAD[miCabeza] === 0 ? miOdd : miEven;
  const miSame = PARIDAD[miCabeza] === 0 ? miEven : miOdd;
  const miCap = 2 * Math.min(miOther, miSame) + (miOther > miSame ? 1 : 0);

  const rivOther = PARIDAD[rivalCabeza] === 0 ? rivOdd : rivEven;
  const rivSame = PARIDAD[rivalCabeza] === 0 ? rivEven : rivOdd;
  const rivCap = 2 * Math.min(rivOther, rivSame) + (rivOther > rivSame ? 1 : 0);

  const voronoiScore = (miRaw - rivRaw) * 18;
  const parityScore = (miCap - rivCap) * 14;
  const tieScore = ties * 5;
  const accessScore = (miDeg2 - rivDeg2) * 6;
  const mobScore = (mobMi - mobRival) * 12 + (mobRival === 1 ? 25 : 0);
  const centerScore = (DIST_CENTRO[rivalCabeza] - DIST_CENTRO[miCabeza]) * 2;

  return voronoiScore + parityScore + tieScore + accessScore + mobScore + centerScore;
}

function ordenarSlice(
  board: Uint8Array,
  offset: number,
  len: number,
  rivalHead: number
): void {
  if (len <= 1) return;
  for (let i = 0; i < len; i++) {
    const m = MOVES_STACK[offset + i];
    board[m] = 1;
    const deg = contarLibres(board, m);
    const rivDeg = contarLibres(board, rivalHead);
    board[m] = 0;
    let s = deg * 100 - DIST_CENTRO[m] * 3;
    if (deg === 0) s -= 5_000;
    if (rivDeg <= 1) s += 300;
    ORDEN_SCORES[i] = s;
  }
  for (let i = 1; i < len; i++) {
    const m = MOVES_STACK[offset + i];
    const s = ORDEN_SCORES[i];
    let j = i - 1;
    while (j >= 0 && ORDEN_SCORES[j] < s) {
      MOVES_STACK[offset + j + 1] = MOVES_STACK[offset + j];
      ORDEN_SCORES[j + 1] = ORDEN_SCORES[j];
      j--;
    }
    MOVES_STACK[offset + j + 1] = m;
    ORDEN_SCORES[j + 1] = s;
  }
}

interface ContextoBusqueda {
  nodos: number;
  abortado: boolean;
}

function negamax(
  board: Uint8Array,
  profundidad: number,
  alpha: number,
  beta: number,
  miCabeza: number,
  rivalCabeza: number,
  ctx: ContextoBusqueda
): number {
  ctx.nodos++;
  if (ctx.nodos >= MAX_NODOS_BUSQUEDA) {
    ctx.abortado = true;
    return 0;
  }

  const offset = profundidad * 4;
  const vecs = VECINOS[miCabeza];
  let count = 0;
  for (let i = 0; i < vecs.length; i++) {
    const v = vecs[i];
    if (board[v] === 0) {
      if (encierraRivalEnUno(board, v, rivalCabeza)) {
        return SCORE_VICTORIA + profundidad;
      }
      MOVES_STACK[offset + count++] = v;
    }
  }

  if (count === 0) return -SCORE_VICTORIA - profundidad;

  if (profundidad === 0) {
    return evaluarEstado(board, miCabeza, rivalCabeza, ctx);
  }

  if (count > 1) {
    ordenarSlice(board, offset, count, rivalCabeza);
  }

  let mejor = -Infinity;
  for (let i = 0; i < count; i++) {
    const m = MOVES_STACK[offset + i];
    board[m] = 1;
    const val = -negamax(board, profundidad - 1, -beta, -alpha, rivalCabeza, m, ctx);
    board[m] = 0;
    if (ctx.abortado) return 0;
    if (val > mejor) mejor = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return mejor;
}

function ordenarRaiz(board: Uint8Array, moves: number[], rivalHead: number): void {
  if (moves.length <= 1) return;
  for (let i = 0; i < moves.length; i++) {
    MOVES_STACK[i] = moves[i];
  }
  ordenarSlice(board, 0, moves.length, rivalHead);
  for (let i = 0; i < moves.length; i++) {
    moves[i] = MOVES_STACK[i];
  }
}

function elegirDificil(
  board: Uint8Array,
  libres: number[],
  rivalHead: number,
  rng: Rng
): number {
  const ganadoras: number[] = [];
  for (let i = 0; i < libres.length; i++) {
    if (encierraRivalEnUno(board, libres[i], rivalHead)) {
      ganadoras.push(libres[i]);
    }
  }
  if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);

  // Si ya están en componentes separadas desde la raíz, resolver directamente el camino más largo.
  bfsDistancias(board, rivalHead, BFS_DIST_B);
  let conectadoAlguno = false;
  for (let i = 0; i < libres.length; i++) {
    board[libres[i]] = 1;
    bfsDistancias(board, libres[i], BFS_DIST_A);
    board[libres[i]] = 0;
    if (BFS_DIST_B[libres[i]] !== INF) {
      conectadoAlguno = true;
      break;
    }
    for (let c = 0; c < TOTAL; c++) {
      if (board[c] === 0 && BFS_DIST_A[c] !== INF && BFS_DIST_B[c] !== INF) {
        conectadoAlguno = true;
        break;
      }
    }
    if (conectadoAlguno) break;
  }

  if (!conectadoAlguno) {
    let mejorLen = -1;
    let mejores: number[] = [];
    for (let i = 0; i < libres.length; i++) {
      const m = libres[i];
      board[m] = 1;
      const res = caminoMasLargo(board, m, MAX_NODOS_COMPONENTE_RAIZ);
      board[m] = 0;
      const total = 1 + res.len;
      if (total > mejorLen) {
        mejorLen = total;
        mejores = [m];
      } else if (total === mejorLen) {
        mejores.push(m);
      }
    }
    return elegirAlAzar(mejores, rng);
  }

  ordenarRaiz(board, libres, rivalHead);

  let mejoresGlobales: number[] = [libres[0]];
  const ctx: ContextoBusqueda = { nodos: 0, abortado: false };
  const profundidades = [2, 4, 6, 8, 10, 12];

  for (let p = 0; p < profundidades.length; p++) {
    const prof = profundidades[p];
    let mejorScore = -Infinity;
    let mejoresIter: number[] = [];
    let alpha = -Infinity;
    const beta = Infinity;

    for (let i = 0; i < libres.length; i++) {
      const m = libres[i];
      board[m] = 1;
      const val = -negamax(board, prof - 1, -beta, -alpha, rivalHead, m, ctx);
      board[m] = 0;
      if (ctx.abortado) break;

      if (val > mejorScore) {
        mejorScore = val;
        mejoresIter = [m];
      } else if (val === mejorScore) {
        mejoresIter.push(m);
      }
      if (val > alpha) alpha = val;
    }

    if (ctx.abortado) break;
    mejoresGlobales = mejoresIter;

    if (mejorScore >= SCORE_COMPONENTE_EXACTA) break;

    if (mejoresGlobales.length > 0 && libres[0] !== mejoresGlobales[0]) {
      const idxBest = libres.indexOf(mejoresGlobales[0]);
      if (idxBest > 0) {
        libres[idxBest] = libres[0];
        libres[0] = mejoresGlobales[0];
      }
    }
  }

  return elegirAlAzar(mejoresGlobales, rng);
}

/**
 * Elige la siguiente casilla del bot de Serpientes según la dificultad indicada.
 */
export function elegirMovimiento(
  state: SnakesState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const { c1, c2 } = cargarEstado(state, BOARD_BUF);
  const yoHead = state.currentPlayer === 1 ? c1 : c2;
  const rivalHead = state.currentPlayer === 1 ? c2 : c1;
  const libres = obtenerLibres(BOARD_BUF, yoHead);

  if (libres.length === 0) return CENTRO;
  if (libres.length === 1) return libres[0];

  if (dificultad === 'facil') {
    return elegirFacil(BOARD_BUF, libres, rivalHead, rng);
  }
  if (dificultad === 'medio') {
    return elegirMedio(BOARD_BUF, libres, rivalHead, rng);
  }
  return elegirDificil(BOARD_BUF, libres, rivalHead, rng);
}
