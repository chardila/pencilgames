import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  aristasDe,
  aristasValidas,
  claveDeArista,
  puntoEnTablero,
  puntosDe,
  puntosValidos,
  TRIANGULOS,
  type Direccion,
  type Move,
  type TrigglePlayer,
  type TriggleState,
} from './engine';

const NUM_POINTS = 37;
const NUM_EDGES = 90;
const NUM_TRIS = TRIANGULOS.length; // 54
const NUM_LINES = 48;
const MAX_PLY = 20;
const MAX_NODES = 6000;

// --- Tablas precalculadas de puntos, aristas, 54 triángulos y 48 líneas ---

const PUNTOS = puntosValidos();
const PUNTO_IDX = new Map<string, number>();
const POINT_WORD = new Uint8Array(NUM_POINTS);
const POINT_BIT = new Int32Array(NUM_POINTS);

for (let i = 0; i < PUNTOS.length; i++) {
  const p = PUNTOS[i];
  PUNTO_IDX.set(`${p.q},${p.r}`, i);
  POINT_WORD[i] = i < 30 ? 0 : 1;
  POINT_BIT[i] = 1 << (i % 30);
}

const ARISTAS = aristasValidas();
const ARISTA_IDX = new Map<string, number>();
const EDGE_WORD = new Uint8Array(NUM_EDGES);
const EDGE_BIT = new Int32Array(NUM_EDGES);

for (let i = 0; i < ARISTAS.length; i++) {
  ARISTA_IDX.set(claveDeArista(ARISTAS[i]), i);
  EDGE_WORD[i] = Math.floor(i / 30);
  EDGE_BIT[i] = 1 << (i % 30);
}

const EDGE_TRIS: Uint8Array[] = (() => {
  const buckets: number[][] = Array.from({ length: NUM_EDGES }, () => []);
  for (let t = 0; t < NUM_TRIS; t++) {
    for (const a of TRIANGULOS[t].aristas) {
      const eIdx = ARISTA_IDX.get(claveDeArista(a));
      if (eIdx !== undefined) buckets[eIdx].push(t);
    }
  }
  return buckets.map(b => Uint8Array.from(b));
})();

const MOVES: Move[] = [];
const LINE_E0 = new Int32Array(NUM_LINES);
const LINE_E1 = new Int32Array(NUM_LINES);
const LINE_E2 = new Int32Array(NUM_LINES);
const LINE_P0 = new Int32Array(NUM_LINES);
const LINE_P1 = new Int32Array(NUM_LINES);
const LINE_EDGES = new Uint8Array(NUM_LINES * 3);
const LINE_HEUR = new Int16Array(NUM_LINES);

(() => {
  const dirs: Direccion[] = ['H', 'D1', 'D2'];
  for (const p of PUNTOS) {
    for (const dir of dirs) {
      const move: Move = { q: p.q, r: p.r, dir };
      const pts = puntosDe(move);
      if (!pts.every(pt => puntoEnTablero(pt.q, pt.r))) continue;

      const idx = MOVES.length;
      MOVES.push(move);

      let p0 = 0;
      let p1 = 0;
      let distSum = 0;
      for (const pt of pts) {
        const pi = PUNTO_IDX.get(`${pt.q},${pt.r}`)!;
        if (POINT_WORD[pi] === 0) p0 |= POINT_BIT[pi];
        else p1 |= POINT_BIT[pi];
        distSum += Math.abs(pt.q) + Math.abs(pt.r) + Math.abs(pt.q + pt.r);
      }
      LINE_P0[idx] = p0;
      LINE_P1[idx] = p1;

      const edges = aristasDe(move);
      let e0 = 0;
      let e1 = 0;
      let e2 = 0;
      let touchTris = 0;
      for (let k = 0; k < 3; k++) {
        const ei = ARISTA_IDX.get(claveDeArista(edges[k]))!;
        LINE_EDGES[idx * 3 + k] = ei;
        const w = EDGE_WORD[ei];
        const b = EDGE_BIT[ei];
        if (w === 0) e0 |= b;
        else if (w === 1) e1 |= b;
        else e2 |= b;
        touchTris += EDGE_TRIS[ei].length;
      }
      LINE_E0[idx] = e0;
      LINE_E1[idx] = e1;
      LINE_E2[idx] = e2;
      // Preferir líneas interiores (tocan más triángulos y están más centradas).
      LINE_HEUR[idx] = touchTris * 6 - distSum;
    }
  }
})();

// --- Estado mutable compacto para búsqueda síncrona sin asignaciones ---

let sE0 = 0;
let sE1 = 0;
let sE2 = 0;
let sP0 = 0;
let sP1 = 0;
let sTwos = 0;
let sJugadaCount = 0;
let sNodes = 0;

const sTriCount = new Uint8Array(NUM_TRIS);
const sTriClaimed = new Uint8Array(NUM_TRIS);

const PLY_MOVES = Array.from({ length: MAX_PLY }, () => new Uint8Array(NUM_LINES));
const PLY_SCORES = Array.from({ length: MAX_PLY }, () => new Int32Array(NUM_LINES));

function cargarEstado(state: TriggleState): void {
  sE0 = 0;
  sE1 = 0;
  sE2 = 0;
  sP0 = 0;
  sP1 = 0;
  sTwos = 0;
  sJugadaCount = state.jugadaCount;
  sTriCount.fill(0);
  sTriClaimed.fill(0);

  for (const clave of Object.keys(state.edges)) {
    const ei = ARISTA_IDX.get(clave);
    if (ei === undefined) continue;
    const w = EDGE_WORD[ei];
    const b = EDGE_BIT[ei];
    if (w === 0) sE0 |= b;
    else if (w === 1) sE1 |= b;
    else sE2 |= b;

    const tris = EDGE_TRIS[ei];
    for (let i = 0; i < tris.length; i++) {
      sTriCount[tris[i]]++;
    }
  }

  for (const clave of Object.keys(state.touched)) {
    const pi = PUNTO_IDX.get(clave);
    if (pi === undefined) continue;
    if (POINT_WORD[pi] === 0) sP0 |= POINT_BIT[pi];
    else sP1 |= POINT_BIT[pi];
  }

  for (let t = 0; t < NUM_TRIS; t++) {
    if (state.triangleOwners[t] !== null) {
      sTriClaimed[t] = 1;
    } else if (sTriCount[t] === 2) {
      sTwos++;
    }
  }
}

function esLineaLegal(m: number): boolean {
  if (((~sE0 & LINE_E0[m]) | (~sE1 & LINE_E1[m]) | (~sE2 & LINE_E2[m])) === 0) {
    return false;
  }
  if (sJugadaCount > 0 && ((sP0 & LINE_P0[m]) | (sP1 & LINE_P1[m])) === 0) {
    return false;
  }
  return true;
}

/**
 * Calcula en O(1) cuántos triángulos cierra `m` (`gain`) y cuántos deja con
 * 2 lados (`createdTwos`) sin mutar el estado.
 * Devuelve `(gain << 8) | createdTwos`.
 */
function impactoLinea(m: number): number {
  let gain = 0;
  let createdTwos = 0;
  const base = m * 3;
  for (let k = 0; k < 3; k++) {
    const ei = LINE_EDGES[base + k];
    const w = EDGE_WORD[ei];
    const b = EDGE_BIT[ei];
    const activo = w === 0 ? sE0 & b : w === 1 ? sE1 & b : sE2 & b;
    if (activo !== 0) continue;

    const tris = EDGE_TRIS[ei];
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      if (sTriClaimed[t] !== 0) continue;
      const c = sTriCount[t];
      if (c === 2) gain++;
      else if (c === 1) createdTwos++;
    }
  }
  return (gain << 8) | createdTwos;
}

function aplicarLinea(m: number): { gained: number; addedMask: number } {
  let gained = 0;
  let addedMask = 0;
  const base = m * 3;
  for (let k = 0; k < 3; k++) {
    const ei = LINE_EDGES[base + k];
    const w = EDGE_WORD[ei];
    const b = EDGE_BIT[ei];
    const activo = w === 0 ? sE0 & b : w === 1 ? sE1 & b : sE2 & b;
    if (activo !== 0) continue;

    addedMask |= 1 << k;
    if (w === 0) sE0 |= b;
    else if (w === 1) sE1 |= b;
    else sE2 |= b;

    const tris = EDGE_TRIS[ei];
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      if (sTriClaimed[t] !== 0) continue;
      const c = sTriCount[t] + 1;
      sTriCount[t] = c;
      if (c === 2) {
        sTwos++;
      } else if (c === 3) {
        sTwos--;
        sTriClaimed[t] = 1;
        gained++;
      }
    }
  }
  sP0 |= LINE_P0[m];
  sP1 |= LINE_P1[m];
  sJugadaCount++;
  return { gained, addedMask };
}

function deshacerLinea(
  m: number,
  addedMask: number,
  prevE0: number,
  prevE1: number,
  prevE2: number,
  prevP0: number,
  prevP1: number,
  prevTwos: number
): void {
  sE0 = prevE0;
  sE1 = prevE1;
  sE2 = prevE2;
  sP0 = prevP0;
  sP1 = prevP1;
  sTwos = prevTwos;
  sJugadaCount--;

  const base = m * 3;
  for (let k = 0; k < 3; k++) {
    if ((addedMask & (1 << k)) === 0) continue;
    const ei = LINE_EDGES[base + k];
    const tris = EDGE_TRIS[ei];
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      if (sTriCount[t] === 3) {
        sTriClaimed[t] = 0;
        sTriCount[t] = 2;
      } else if (sTriClaimed[t] === 0 && sTriCount[t] > 0) {
        sTriCount[t]--;
      }
    }
  }
}

function remTwosPenalty(rem: number): number {
  if (rem <= 0) return 0;
  return 650 + (rem - 1) * 450;
}

function evaluarHoja(scoreDiff: number): number {
  let legalCount = 0;
  let safeCount = 0;
  let minCreatedTwos = 99;
  let bestImmediate = -100_000;

  for (let m = 0; m < NUM_LINES; m++) {
    if (!esLineaLegal(m)) continue;
    legalCount++;
    const imp = impactoLinea(m);
    const gain = imp >> 8;
    const createdTwos = imp & 0xff;
    if (createdTwos === 0) safeCount++;
    if (createdTwos < minCreatedTwos) minCreatedTwos = createdTwos;

    const rem = sTwos - gain + createdTwos;
    const val = gain * 750 - remTwosPenalty(rem);
    if (val > bestImmediate) bestImmediate = val;
  }

  if (legalCount === 0) {
    return scoreDiff * 10_000;
  }

  let positional = 0;
  if (sTwos > 0) {
    positional = bestImmediate;
  } else if (safeCount === 0) {
    positional = -minCreatedTwos * 600;
  } else {
    positional = Math.min(safeCount, 8) * 10;
  }

  return scoreDiff * 1000 + positional;
}

function negamax(
  ply: number,
  profundidad: number,
  alpha: number,
  beta: number,
  scoreDiff: number
): number {
  sNodes++;
  if (profundidad === 0 || sNodes >= MAX_NODES) {
    return evaluarHoja(scoreDiff);
  }

  const movesArr = PLY_MOVES[ply];
  const scoresArr = PLY_SCORES[ply];
  let n = 0;

  for (let m = 0; m < NUM_LINES; m++) {
    if (!esLineaLegal(m)) continue;
    const imp = impactoLinea(m);
    const gain = imp >> 8;
    const createdTwos = imp & 0xff;
    movesArr[n] = m;
    scoresArr[n] = gain * 1000 - createdTwos * 450 + LINE_HEUR[m];
    n++;
  }

  if (n === 0) {
    return scoreDiff * 10_000;
  }

  // En el tramo final (<= 8 movimientos legales) resolvemos exacto hasta el final.
  const profEfectiva = n <= 8 && profundidad < 8 ? 16 : profundidad;
  const limite = n <= 8 ? n : Math.min(n <= 16 ? 7 : 6, n);

  let mejor = -Infinity;
  const prevE0 = sE0;
  const prevE1 = sE1;
  const prevE2 = sE2;
  const prevP0 = sP0;
  const prevP1 = sP1;
  const prevTwos = sTwos;

  for (let k = 0; k < limite; k++) {
    let bestPos = k;
    let bestScore = scoresArr[k];
    for (let j = k + 1; j < n; j++) {
      if (scoresArr[j] > bestScore) {
        bestScore = scoresArr[j];
        bestPos = j;
      }
    }
    const m = movesArr[bestPos];
    if (bestPos !== k) {
      movesArr[bestPos] = movesArr[k];
      scoresArr[bestPos] = scoresArr[k];
    }

    const { gained, addedMask } = aplicarLinea(m);
    const valor = -negamax(
      ply + 1,
      profEfectiva - 1,
      -beta,
      -alpha,
      -(scoreDiff + gained)
    );
    deshacerLinea(m, addedMask, prevE0, prevE1, prevE2, prevP0, prevP1, prevTwos);

    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }

  return mejor;
}

function elegirFacil(rng: Rng): Move {
  const cierres: Move[] = [];
  const noCierres: Move[] = [];
  for (let m = 0; m < NUM_LINES; m++) {
    if (!esLineaLegal(m)) continue;
    const gain = impactoLinea(m) >> 8;
    if (gain > 0) cierres.push(MOVES[m]);
    else noCierres.push(MOVES[m]);
  }
  if (cierres.length === 0 && noCierres.length === 0) return MOVES[0];
  if (cierres.length > 0 && (noCierres.length === 0 || rng() < 0.35)) {
    return elegirAlAzar(cierres, rng);
  }
  return elegirAlAzar(noCierres.length > 0 ? noCierres : cierres, rng);
}

function elegirMedio(rng: Rng): Move {
  let maxGain = -1;
  let minCreatedTwos = Infinity;
  let mejores: Move[] = [];

  for (let m = 0; m < NUM_LINES; m++) {
    if (!esLineaLegal(m)) continue;
    const imp = impactoLinea(m);
    const gain = imp >> 8;
    const createdTwos = imp & 0xff;

    if (gain > maxGain || (gain === maxGain && createdTwos < minCreatedTwos)) {
      maxGain = gain;
      minCreatedTwos = createdTwos;
      mejores = [MOVES[m]];
    } else if (gain === maxGain && createdTwos === minCreatedTwos) {
      mejores.push(MOVES[m]);
    }
  }

  return mejores.length > 0 ? elegirAlAzar(mejores, rng) : MOVES[0];
}

function elegirDificil(state: TriggleState, rng: Rng): Move {
  const yo: TrigglePlayer = state.currentPlayer;
  const rival: TrigglePlayer = yo === 1 ? 2 : 1;
  const scoreDiff = state.scores[yo] - state.scores[rival];

  const movesArr = PLY_MOVES[0];
  const scoresArr = PLY_SCORES[0];
  let n = 0;

  for (let m = 0; m < NUM_LINES; m++) {
    if (!esLineaLegal(m)) continue;
    const imp = impactoLinea(m);
    const gain = imp >> 8;
    const createdTwos = imp & 0xff;
    movesArr[n] = m;
    scoresArr[n] = gain * 1000 - createdTwos * 450 + LINE_HEUR[m];
    n++;
  }

  if (n === 0) return MOVES[0];
  if (n === 1) return MOVES[movesArr[0]];

  // Apertura: variar entre las mejores líneas interiores simétricas (profundidad 2).
  const profundidad = sJugadaCount === 0 ? 2 : n <= 8 ? 16 : n <= 16 ? 4 : 3;
  const limite = sJugadaCount === 0 ? 6 : n <= 8 ? n : Math.min(n <= 16 ? 9 : 8, n);

  sNodes = 0;
  let mejor = -Infinity;
  let mejores: Move[] = [];

  const prevE0 = sE0;
  const prevE1 = sE1;
  const prevE2 = sE2;
  const prevP0 = sP0;
  const prevP1 = sP1;
  const prevTwos = sTwos;

  for (let k = 0; k < limite; k++) {
    let bestPos = k;
    let bestScore = scoresArr[k];
    for (let j = k + 1; j < n; j++) {
      if (scoresArr[j] > bestScore) {
        bestScore = scoresArr[j];
        bestPos = j;
      }
    }
    const m = movesArr[bestPos];
    if (bestPos !== k) {
      movesArr[bestPos] = movesArr[k];
      scoresArr[bestPos] = scoresArr[k];
    }

    const { gained, addedMask } = aplicarLinea(m);
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(1, profundidad - 1, -Infinity, beta, -(scoreDiff + gained));
    deshacerLinea(m, addedMask, prevE0, prevE1, prevE2, prevP0, prevP1, prevTwos);

    if (valor > mejor) {
      mejor = valor;
      mejores = [MOVES[m]];
    } else if (valor === mejor) {
      mejores.push(MOVES[m]);
    }
  }

  return elegirAlAzar(mejores, rng);
}

/**
 * Elige la siguiente línea del bot de Triggle según la dificultad indicada.
 */
export function elegirMovimiento(
  state: TriggleState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Move {
  cargarEstado(state);

  if (dificultad === 'facil') return elegirFacil(rng);
  if (dificultad === 'medio') return elegirMedio(rng);
  return elegirDificil(state, rng);
}
