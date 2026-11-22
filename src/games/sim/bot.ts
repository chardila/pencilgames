import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  getEdgeFromIndex,
  getEdgeIndex,
  TOTAL_EDGES,
  TOTAL_VERTICES,
  type Edge,
  type SimState,
} from './engine';

const ALL_EDGES_MASK = (1 << TOTAL_EDGES) - 1;
const PROFUNDIDAD_INICIAL = 8;
const UMBRAL_EXACTO = 11;
const SCORE_TERMINAL = 1000;

// Tabla de amenazas: THREAT_MASK[mask] tiene el bit `e` encendido si agregar `e`
// completa un triángulo monocromático con dos aristas ya presentes en `mask`.
const THREAT_MASK = new Uint16Array(1 << TOTAL_EDGES);
const ADJACENT_MASK = new Uint16Array(TOTAL_EDGES);

(() => {
  const paresPorArista: number[][] = Array.from({ length: TOTAL_EDGES }, () => []);
  for (let u = 0; u < TOTAL_VERTICES; u++) {
    for (let v = u + 1; v < TOTAL_VERTICES; v++) {
      const e = getEdgeIndex(u, v);
      let adj = 0;
      for (let w = 0; w < TOTAL_VERTICES; w++) {
        if (w === u || w === v) continue;
        const eUW = getEdgeIndex(u, w);
        const eVW = getEdgeIndex(v, w);
        adj |= (1 << eUW) | (1 << eVW);
        paresPorArista[e].push((1 << eUW) | (1 << eVW));
      }
      ADJACENT_MASK[e] = adj;
    }
  }

  for (let mask = 0; mask < 1 << TOTAL_EDGES; mask++) {
    let amenazas = 0;
    for (let e = 0; e < TOTAL_EDGES; e++) {
      const pares = paresPorArista[e];
      if (
        (mask & pares[0]) === pares[0] ||
        (mask & pares[1]) === pares[1] ||
        (mask & pares[2]) === pares[2] ||
        (mask & pares[3]) === pares[3]
      ) {
        amenazas |= 1 << e;
      }
    }
    THREAT_MASK[mask] = amenazas;
  }
})();

// Tabla de transposición y buffers por profundidad (cero asignaciones durante la búsqueda)
const TT_SIZE = 1 << 16;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const ttKey = new Int32Array(TT_SIZE);
const ttVal = new Int32Array(TT_SIZE);
const ttMeta = new Uint16Array(TT_SIZE);
const ttBest = new Int8Array(TT_SIZE);

const MAX_PLY = TOTAL_EDGES + 1;
const MOVE_BUF = new Int8Array(MAX_PLY * TOTAL_EDGES);
const SCORE_BUF = new Int16Array(MAX_PLY * TOTAL_EDGES);

function popcount15(m: number): number {
  m = m - ((m >>> 1) & 0x5555);
  m = (m & 0x3333) + ((m >>> 2) & 0x3333);
  m = (m + (m >>> 4)) & 0x0f0f;
  return (m + (m >>> 8)) & 0x1f;
}

function extractBits(mask: number): number[] {
  const res: number[] = [];
  let m = mask;
  while (m !== 0) {
    const bit = m & -m;
    m ^= bit;
    res.push(31 - Math.clz32(bit));
  }
  return res;
}

function hashKey(key: number): number {
  return (Math.imul(key ^ (key >>> 16), 0x45d9f3b) >>> 0) & TT_MASK;
}

function evaluar(myMask: number, oppMask: number, freeMask: number): number {
  const mySafeMask = freeMask & ~THREAT_MASK[myMask];
  const oppSafeMask = freeMask & ~THREAT_MASK[oppMask];
  const onlyMy = popcount15(mySafeMask & ~oppSafeMask);
  const onlyOpp = popcount15(oppSafeMask & ~mySafeMask);
  return (onlyMy - onlyOpp) * 26;
}

function negamax(
  myMask: number,
  oppMask: number,
  freeMask: number,
  freeCount: number,
  depth: number,
  alpha: number,
  beta: number
): number {
  const mySafeMask = freeMask & ~THREAT_MASK[myMask];
  if (mySafeMask === 0) {
    return -(SCORE_TERMINAL + freeCount);
  }
  if (depth === 0) {
    return evaluar(myMask, oppMask, freeMask);
  }
  if (depth === 1) {
    let best = -Infinity;
    let m = mySafeMask;
    while (m !== 0) {
      const bit = m & -m;
      m ^= bit;
      const nextFree = freeMask ^ bit;
      if ((nextFree & ~THREAT_MASK[oppMask]) === 0) {
        return SCORE_TERMINAL + freeCount - 1;
      }
      const v = -evaluar(oppMask, myMask | bit, nextFree);
      if (v > best) best = v;
      if (best >= beta) return best;
    }
    return best;
  }

  const key = (myMask << 16) | oppMask;
  const idx = hashKey(key);
  let ttMove = -1;
  const alphaOrig = alpha;

  if (ttKey[idx] === key) {
    const meta = ttMeta[idx];
    const ttDepth = meta >>> 2;
    const flag = meta & 3;
    ttMove = ttBest[idx];
    if (ttDepth >= depth) {
      const stored = ttVal[idx];
      if (flag === TT_EXACT) return stored;
      if (flag === TT_LOWER && stored > alpha) alpha = stored;
      else if (flag === TT_UPPER && stored < beta) beta = stored;
      if (alpha >= beta) return stored;
    }
  }

  let mejor = -Infinity;
  let mejorEdge = -1;
  let buscados = 0;

  // Probar primero la mejor jugada de la TT antes de generar el resto
  if (ttMove >= 0 && (mySafeMask & (1 << ttMove)) !== 0) {
    const bit = 1 << ttMove;
    const nextFree = freeMask ^ bit;
    if ((nextFree & ~THREAT_MASK[oppMask]) === 0) {
      const winScore = SCORE_TERMINAL + freeCount - 1;
      ttKey[idx] = key;
      ttVal[idx] = winScore;
      ttMeta[idx] = (depth << 2) | TT_EXACT;
      ttBest[idx] = ttMove;
      return winScore;
    }
    const val = -negamax(
      oppMask,
      myMask | bit,
      nextFree,
      freeCount - 1,
      depth - 1,
      -beta,
      -alpha
    );
    mejor = val;
    mejorEdge = ttMove;
    buscados = 1;
    if (val > alpha) alpha = val;
    if (alpha >= beta) {
      ttKey[idx] = key;
      ttVal[idx] = mejor;
      ttMeta[idx] = (depth << 2) | TT_LOWER;
      ttBest[idx] = mejorEdge;
      return mejor;
    }
  }

  // Generar y puntuar jugadas restantes en el buffer de esta profundidad
  const base = depth * TOTAL_EDGES;
  let count = 0;
  let m = ttMove >= 0 ? mySafeMask & ~(1 << ttMove) : mySafeMask;

  while (m !== 0) {
    const bit = m & -m;
    m ^= bit;
    const e = 31 - Math.clz32(bit);
    const nextFree = freeMask ^ bit;
    const oppSafeAfter = nextFree & ~THREAT_MASK[oppMask];
    if (oppSafeAfter === 0) {
      const winScore = SCORE_TERMINAL + freeCount - 1;
      ttKey[idx] = key;
      ttVal[idx] = winScore;
      ttMeta[idx] = (depth << 2) | TT_EXACT;
      ttBest[idx] = e;
      return winScore;
    }
    const mySafeAfter = popcount15(nextFree & ~THREAT_MASK[myMask | bit]);
    const oppSafeCount = popcount15(oppSafeAfter);
    MOVE_BUF[base + count] = e;
    SCORE_BUF[base + count] = mySafeAfter - oppSafeCount * 2;
    count++;
  }

  for (let i = 0; i < count; i++) {
    let bestPos = i;
    let bestHeuristic = SCORE_BUF[base + i];
    for (let j = i + 1; j < count; j++) {
      const s = SCORE_BUF[base + j];
      if (s > bestHeuristic) {
        bestHeuristic = s;
        bestPos = j;
      }
    }
    if (bestPos !== i) {
      const tmpM = MOVE_BUF[base + i];
      MOVE_BUF[base + i] = MOVE_BUF[base + bestPos];
      MOVE_BUF[base + bestPos] = tmpM;
      SCORE_BUF[base + bestPos] = SCORE_BUF[base + i];
    }

    const e = MOVE_BUF[base + i];
    const bit = 1 << e;
    const nextFree = freeMask ^ bit;
    let val: number;

    if (buscados === 0) {
      val = -negamax(
        oppMask,
        myMask | bit,
        nextFree,
        freeCount - 1,
        depth - 1,
        -beta,
        -alpha
      );
    } else {
      // PVS: ventana nula primero
      val = -negamax(
        oppMask,
        myMask | bit,
        nextFree,
        freeCount - 1,
        depth - 1,
        -alpha - 1,
        -alpha
      );
      if (val > alpha && val < beta) {
        val = -negamax(
          oppMask,
          myMask | bit,
          nextFree,
          freeCount - 1,
          depth - 1,
          -beta,
          -alpha
        );
      }
    }
    buscados++;

    if (val > mejor) {
      mejor = val;
      mejorEdge = e;
    }
    if (val > alpha) {
      alpha = val;
    }
    if (alpha >= beta) {
      break;
    }
  }

  let flag = TT_EXACT;
  if (mejor <= alphaOrig) flag = TT_UPPER;
  else if (mejor >= beta) flag = TT_LOWER;

  ttKey[idx] = key;
  ttVal[idx] = mejor;
  ttMeta[idx] = (depth << 2) | flag;
  ttBest[idx] = mejorEdge;

  return mejor;
}

function elegirFacil(myMask: number, freeMask: number, rng: Rng): Edge {
  const libres = extractBits(freeMask);
  const safeMask = freeMask & ~THREAT_MASK[myMask];
  const seguras = extractBits(safeMask);

  if (seguras.length > 0 && (seguras.length === libres.length || rng() < 0.75)) {
    return getEdgeFromIndex(elegirAlAzar(seguras, rng));
  }
  return getEdgeFromIndex(elegirAlAzar(libres, rng));
}

function elegirMedio(myMask: number, oppMask: number, freeMask: number, rng: Rng): Edge {
  const safeMask = freeMask & ~THREAT_MASK[myMask];
  if (safeMask === 0) {
    return getEdgeFromIndex(elegirAlAzar(extractBits(freeMask), rng));
  }

  const seguras = extractBits(safeMask);
  if (seguras.length === 1) {
    return getEdgeFromIndex(seguras[0]);
  }

  const ganadoras1Ply: number[] = [];
  const sinRegalo2Ply: { edge: number; score: number }[] = [];

  for (let i = 0; i < seguras.length; i++) {
    const e = seguras[i];
    const bit = 1 << e;
    const nextMy = myMask | bit;
    const nextFree = freeMask ^ bit;
    const oppSafeMask = nextFree & ~THREAT_MASK[oppMask];

    if (oppSafeMask === 0) {
      ganadoras1Ply.push(e);
      continue;
    }

    let regalaEn2 = false;
    let m = oppSafeMask;
    while (m !== 0) {
      const rBit = m & -m;
      m ^= rBit;
      const freeAfter2 = nextFree ^ rBit;
      if ((freeAfter2 & ~THREAT_MASK[nextMy]) === 0) {
        regalaEn2 = true;
        break;
      }
    }

    if (!regalaEn2) {
      const mySafeAfter = popcount15(nextFree & ~THREAT_MASK[nextMy]);
      const oppSafeCount = popcount15(oppSafeMask);
      sinRegalo2Ply.push({ edge: e, score: mySafeAfter - oppSafeCount });
    }
  }

  if (ganadoras1Ply.length > 0) {
    return getEdgeFromIndex(elegirAlAzar(ganadoras1Ply, rng));
  }

  if (sinRegalo2Ply.length > 0) {
    sinRegalo2Ply.sort((a, b) => b.score - a.score);
    const mejorScore = sinRegalo2Ply[0].score;
    const top = sinRegalo2Ply.filter(c => c.score >= mejorScore - 1).map(c => c.edge);
    return getEdgeFromIndex(elegirAlAzar(top, rng));
  }

  return getEdgeFromIndex(elegirAlAzar(seguras, rng));
}

function elegirDificil(
  myMask: number,
  oppMask: number,
  freeMask: number,
  freeCount: number,
  rng: Rng
): Edge {
  // En tablero vacío las 15 aristas son simétricas por isomorfismo de K6
  if (freeCount === TOTAL_EDGES) {
    return getEdgeFromIndex(elegirAlAzar(extractBits(freeMask), rng));
  }

  // Con 1 sola arista jugada existen exactamente 2 clases de simetría (adyacente vs disjunta)
  if (freeCount === TOTAL_EDGES - 1 && oppMask !== 0) {
    const e0 = 31 - Math.clz32(oppMask);
    const adjMask = freeMask & ADJACENT_MASK[e0];
    const disjMask = freeMask & ~ADJACENT_MASK[e0];
    const repAdj = 31 - Math.clz32(adjMask & -adjMask);
    const repDisj = 31 - Math.clz32(disjMask & -disjMask);

    ttKey.fill(-1);
    const depth = PROFUNDIDAD_INICIAL - 1;
    const valAdj = -negamax(
      oppMask,
      1 << repAdj,
      freeMask ^ (1 << repAdj),
      freeCount - 1,
      depth,
      -Infinity,
      Infinity
    );
    const valDisj = -negamax(
      oppMask,
      1 << repDisj,
      freeMask ^ (1 << repDisj),
      freeCount - 1,
      depth,
      -Infinity,
      Infinity
    );

    const poolMask =
      valAdj > valDisj ? adjMask : valDisj > valAdj ? disjMask : freeMask;
    return getEdgeFromIndex(elegirAlAzar(extractBits(poolMask), rng));
  }

  const safeMask = freeMask & ~THREAT_MASK[myMask];
  if (safeMask === 0) {
    return getEdgeFromIndex(elegirAlAzar(extractBits(freeMask), rng));
  }

  const seguras = extractBits(safeMask);
  if (seguras.length === 1) {
    return getEdgeFromIndex(seguras[0]);
  }

  ttKey.fill(-1);
  const depth = freeCount <= UMBRAL_EXACTO ? freeCount : PROFUNDIDAD_INICIAL;

  const candidatas: { edge: number; h: number }[] = [];
  for (let i = 0; i < seguras.length; i++) {
    const e = seguras[i];
    const bit = 1 << e;
    const nextFree = freeMask ^ bit;
    const oppSafeAfter = nextFree & ~THREAT_MASK[oppMask];
    if (oppSafeAfter === 0) {
      candidatas.push({ edge: e, h: 10_000 });
    } else {
      const mySafeAfter = popcount15(nextFree & ~THREAT_MASK[myMask | bit]);
      candidatas.push({ edge: e, h: mySafeAfter - popcount15(oppSafeAfter) * 2 });
    }
  }

  const inmediatas = candidatas.filter(c => c.h === 10_000).map(c => c.edge);
  if (inmediatas.length > 0) {
    return getEdgeFromIndex(elegirAlAzar(inmediatas, rng));
  }

  candidatas.sort((a, b) => b.h - a.h);

  // Calentamiento rápido por profundización iterativa para poblar ttBest y ordenar la raíz
  if (depth >= 6) {
    for (let d = 4; d < depth; d += 2) {
      let bestWarm = -Infinity;
      for (let i = 0; i < candidatas.length; i++) {
        const c = candidatas[i];
        const bit = 1 << c.edge;
        const val = -negamax(
          oppMask,
          myMask | bit,
          freeMask ^ bit,
          freeCount - 1,
          d - 1,
          -Infinity,
          bestWarm === -Infinity ? Infinity : -(bestWarm - 1)
        );
        c.h = val;
        if (val > bestWarm) bestWarm = val;
      }
      candidatas.sort((a, b) => b.h - a.h);
    }
  }

  let mejorVal = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < candidatas.length; i++) {
    const e = candidatas[i].edge;
    const bit = 1 << e;
    const beta = mejorVal === -Infinity ? Infinity : -(mejorVal - 1);
    const val = -negamax(
      oppMask,
      myMask | bit,
      freeMask ^ bit,
      freeCount - 1,
      depth - 1,
      -Infinity,
      beta
    );

    if (val > mejorVal) {
      mejorVal = val;
      mejores = [e];
    } else if (val === mejorVal) {
      mejores.push(e);
    }
  }

  return getEdgeFromIndex(elegirAlAzar(mejores, rng));
}

/**
 * Elige la siguiente arista para el bot de Sim según la dificultad indicada.
 */
export function elegirMovimiento(
  state: SimState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Edge {
  const yo = state.currentPlayer;
  let myMask = 0;
  let oppMask = 0;
  let occupiedMask = 0;

  for (let i = 0; i < TOTAL_EDGES; i++) {
    const owner = state.edges[i];
    if (owner !== null) {
      const bit = 1 << i;
      occupiedMask |= bit;
      if (owner === yo) myMask |= bit;
      else oppMask |= bit;
    }
  }

  const freeMask = ALL_EDGES_MASK ^ occupiedMask;
  if (freeMask === 0) {
    return getEdgeFromIndex(0);
  }

  if (dificultad === 'facil') {
    return elegirFacil(myMask, freeMask, rng);
  }
  if (dificultad === 'medio') {
    return elegirMedio(myMask, oppMask, freeMask, rng);
  }

  const freeCount = popcount15(freeMask);
  return elegirDificil(myMask, oppMask, freeMask, freeCount, rng);
}
