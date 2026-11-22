import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  casillasLegales,
  puntajes,
  TAMANO,
  TOTAL,
  type Move,
  type Player,
  type WalkingDotsState,
} from './engine';

const WIN_SCORE = 1_000_000;
const INF_DIST = 99;
const MAX_PROF_DIFICIL = 5;
const MAX_PROF_FIN = 7;
const MAX_NODOS = 2_000;

// Tablero con borde centinela (9×9, WALL = 3) para desenrollar vecinos sin comprobar límites.
const STRIDE = TAMANO + 2;
const PAD_TOTAL = STRIDE * STRIDE;
const WALL = 3;

const IDX_TO_PAD = new Uint8Array(TOTAL);
const PAD_TO_IDX = new Int8Array(PAD_TOTAL).fill(-1);
const CENTRO_BONUS_PAD = new Int8Array(PAD_TOTAL);
const BORDE_BONUS_PAD = new Int8Array(PAD_TOTAL);

for (let f = 0; f < TAMANO; f++) {
  for (let c = 0; c < TAMANO; c++) {
    const idx = f * TAMANO + c;
    const pad = (f + 1) * STRIDE + (c + 1);
    IDX_TO_PAD[idx] = pad;
    PAD_TO_IDX[pad] = idx;
    CENTRO_BONUS_PAD[pad] = 6 - (Math.abs(f - 3) + Math.abs(c - 3));
    BORDE_BONUS_PAD[pad] = f === 0 || f === TAMANO - 1 || c === 0 || c === TAMANO - 1 ? 4 : 0;
  }
}

// Buffers reutilizables para análisis y ordenamiento cero-asignaciones.
const PAD_BOARD = new Uint8Array(PAD_TOTAL);
const DIST1 = new Uint8Array(PAD_TOTAL);
const DIST2 = new Uint8Array(PAD_TOTAL);
const Q1 = new Uint8Array(TOTAL);
const Q2 = new Uint8Array(TOTAL);
const WAVE_OWNER = new Uint8Array(PAD_TOTAL);
const WAVE_DIST = new Uint8Array(PAD_TOTAL);
const WAVE_Q = new Uint8Array(TOTAL);

const MAX_DEPTH_SCRATCH = 10;
const CAND_STACK: Uint8Array[] = Array.from(
  { length: MAX_DEPTH_SCRATCH },
  () => new Uint8Array(TOTAL)
);
const SCORE_STACK: Int32Array[] = Array.from(
  { length: MAX_DEPTH_SCRATCH },
  () => new Int32Array(TOTAL)
);

// Resultados escalares del último analizarTablero (evita asignaciones de objeto por nodo).
let resTotal1 = 0;
let resTotal2 = 0;
let resMob1 = 0;
let resMob2 = 0;
let resContested = 0;

function cargarTablero(board: readonly (Player | null)[]): void {
  PAD_BOARD.fill(WALL);
  for (let i = 0; i < TOTAL; i++) {
    const v = board[i];
    PAD_BOARD[IDX_TO_PAD[i]] = v === null ? 0 : v;
  }
}

/**
 * Ejecuta dos BFS ortogonales desenrollados sobre el tablero con borde.
 * Actualiza `resTotal1`, `resTotal2`, `resMob1`, `resMob2` y `resContested`.
 */
function analizarTablero(board: Uint8Array): void {
  DIST1.fill(INF_DIST);
  DIST2.fill(INF_DIST);

  let pts1 = 0;
  let pts2 = 0;
  let t1 = 0;
  let t2 = 0;

  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    const v = board[pad];
    if (v === 1) {
      pts1++;
      DIST1[pad] = 0;
      Q1[t1++] = pad;
    } else if (v === 2) {
      pts2++;
      DIST2[pad] = 0;
      Q2[t2++] = pad;
    }
  }

  let h1 = 0;
  while (h1 < t1) {
    const u = Q1[h1++];
    const nd = DIST1[u] + 1;
    let n = u - STRIDE;
    if (board[n] === 0 && DIST1[n] === INF_DIST) { DIST1[n] = nd; Q1[t1++] = n; }
    n = u - 1;
    if (board[n] === 0 && DIST1[n] === INF_DIST) { DIST1[n] = nd; Q1[t1++] = n; }
    n = u + 1;
    if (board[n] === 0 && DIST1[n] === INF_DIST) { DIST1[n] = nd; Q1[t1++] = n; }
    n = u + STRIDE;
    if (board[n] === 0 && DIST1[n] === INF_DIST) { DIST1[n] = nd; Q1[t1++] = n; }
  }

  let h2 = 0;
  while (h2 < t2) {
    const u = Q2[h2++];
    const nd = DIST2[u] + 1;
    let n = u - STRIDE;
    if (board[n] === 0 && DIST2[n] === INF_DIST) { DIST2[n] = nd; Q2[t2++] = n; }
    n = u - 1;
    if (board[n] === 0 && DIST2[n] === INF_DIST) { DIST2[n] = nd; Q2[t2++] = n; }
    n = u + 1;
    if (board[n] === 0 && DIST2[n] === INF_DIST) { DIST2[n] = nd; Q2[t2++] = n; }
    n = u + STRIDE;
    if (board[n] === 0 && DIST2[n] === INF_DIST) { DIST2[n] = nd; Q2[t2++] = n; }
  }

  let terr1 = 0;
  let terr2 = 0;
  let mob1 = 0;
  let mob2 = 0;
  let contested = 0;

  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (board[pad] !== 0) continue;
    const d1 = DIST1[pad];
    const d2 = DIST2[pad];
    if (d1 < INF_DIST && d2 === INF_DIST) {
      terr1++;
    } else if (d2 < INF_DIST && d1 === INF_DIST) {
      terr2++;
    } else if (d1 < INF_DIST && d2 < INF_DIST) {
      contested++;
      if (d1 === 1) mob1++;
      if (d2 === 1) mob2++;
    }
  }

  resTotal1 = pts1 + terr1;
  resTotal2 = pts2 + terr2;
  resMob1 = mob1;
  resMob2 = mob2;
  resContested = contested;
}

function scoreTerminal(diff: number, profundidad: number): number {
  if (diff > 0) return WIN_SCORE + diff * 100 + profundidad;
  if (diff < 0) return -WIN_SCORE + diff * 100 - profundidad;
  return 0;
}

/**
 * Evalúa la posición con territorio cerrado exacto + Voronoi bloqueado en frontera
 * + movilidad disputada (desenrollado sobre tablero con borde).
 */
function evaluarVoronoi(board: Uint8Array, turno: Player): number {
  const rival: Player = turno === 1 ? 2 : 1;
  const totalTurno = turno === 1 ? resTotal1 : resTotal2;
  const totalRival = turno === 1 ? resTotal2 : resTotal1;
  const exactDiff = totalTurno - totalRival;

  if (resContested === 0) {
    return scoreTerminal(exactDiff, 0);
  }

  let score = exactDiff * 100;

  WAVE_OWNER.fill(0);
  WAVE_DIST.fill(INF_DIST);
  let wHead = 0;
  let wTail = 0;

  // Empujar primero las fichas del jugador al turno para modelar iniciativa de 1 tiempo.
  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (board[pad] === turno) {
      WAVE_OWNER[pad] = turno;
      WAVE_DIST[pad] = 0;
      WAVE_Q[wTail++] = pad;
    }
  }
  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (board[pad] === rival) {
      WAVE_OWNER[pad] = rival;
      WAVE_DIST[pad] = 0;
      WAVE_Q[wTail++] = pad;
    }
  }

  while (wHead < wTail) {
    const u = WAVE_Q[wHead++];
    const ownerU = WAVE_OWNER[u];
    if (ownerU === 3) continue;
    const nd = WAVE_DIST[u] + 1;

    let n = u - STRIDE;
    if (board[n] === 0 && DIST1[n] < INF_DIST && DIST2[n] < INF_DIST) {
      if (WAVE_DIST[n] === INF_DIST) { WAVE_DIST[n] = nd; WAVE_OWNER[n] = ownerU; WAVE_Q[wTail++] = n; }
      else if (WAVE_DIST[n] === nd && WAVE_OWNER[n] === turno && ownerU === rival) { WAVE_OWNER[n] = 3; }
    }
    n = u - 1;
    if (board[n] === 0 && DIST1[n] < INF_DIST && DIST2[n] < INF_DIST) {
      if (WAVE_DIST[n] === INF_DIST) { WAVE_DIST[n] = nd; WAVE_OWNER[n] = ownerU; WAVE_Q[wTail++] = n; }
      else if (WAVE_DIST[n] === nd && WAVE_OWNER[n] === turno && ownerU === rival) { WAVE_OWNER[n] = 3; }
    }
    n = u + 1;
    if (board[n] === 0 && DIST1[n] < INF_DIST && DIST2[n] < INF_DIST) {
      if (WAVE_DIST[n] === INF_DIST) { WAVE_DIST[n] = nd; WAVE_OWNER[n] = ownerU; WAVE_Q[wTail++] = n; }
      else if (WAVE_DIST[n] === nd && WAVE_OWNER[n] === turno && ownerU === rival) { WAVE_OWNER[n] = 3; }
    }
    n = u + STRIDE;
    if (board[n] === 0 && DIST1[n] < INF_DIST && DIST2[n] < INF_DIST) {
      if (WAVE_DIST[n] === INF_DIST) { WAVE_DIST[n] = nd; WAVE_OWNER[n] = ownerU; WAVE_Q[wTail++] = n; }
      else if (WAVE_DIST[n] === nd && WAVE_OWNER[n] === turno && ownerU === rival) { WAVE_OWNER[n] = 3; }
    }
  }

  const distTurno = turno === 1 ? DIST1 : DIST2;
  const distRival = turno === 1 ? DIST2 : DIST1;

  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (board[pad] !== 0 || DIST1[pad] === INF_DIST || DIST2[pad] === INF_DIST) continue;
    const wo = WAVE_OWNER[pad];
    const dMargin = distRival[pad] - distTurno[pad];
    if (wo === turno) {
      score += dMargin >= 2 ? 64 : 52;
    } else if (wo === rival) {
      score -= dMargin <= -2 ? 64 : 52;
    } else {
      score += 6;
    }
  }

  const mobTurno = turno === 1 ? resMob1 : resMob2;
  const mobRival = turno === 1 ? resMob2 : resMob1;
  score += (mobTurno - mobRival) * 9;

  return score;
}

function prepararCandidatasNivel(board: Uint8Array, turno: Player, ply: number): number {
  const distTurno = turno === 1 ? DIST1 : DIST2;
  const distRival = turno === 1 ? DIST2 : DIST1;
  const cands = CAND_STACK[ply];
  const scores = SCORE_STACK[ply];
  let n = 0;

  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (board[pad] === 0 && distTurno[pad] === 1 && distRival[pad] < INF_DIST) {
      const dr = Math.min(10, distRival[pad]);
      let libres = 0;
      let propias = 0;
      const v0 = board[pad - STRIDE];
      if (v0 === 0) libres++; else if (v0 === turno) propias++;
      const v1 = board[pad - 1];
      if (v1 === 0) libres++; else if (v1 === turno) propias++;
      const v2 = board[pad + 1];
      if (v2 === 0) libres++; else if (v2 === turno) propias++;
      const v3 = board[pad + STRIDE];
      if (v3 === 0) libres++; else if (v3 === turno) propias++;

      cands[n] = pad;
      scores[n] =
        (11 - dr) * 16 +
        libres * 7 +
        (propias >= 2 ? 10 : 0) +
        BORDE_BONUS_PAD[pad] +
        CENTRO_BONUS_PAD[pad];
      n++;
    }
  }

  return n;
}

interface BusquedaEstado {
  nodos: number;
  abortado: boolean;
}

function negamax(
  board: Uint8Array,
  profundidad: number,
  ply: number,
  alpha: number,
  beta: number,
  turno: Player,
  pasesSeguidos: number,
  busq: BusquedaEstado
): number {
  busq.nodos++;
  if (busq.nodos >= MAX_NODOS) {
    busq.abortado = true;
    return 0;
  }

  analizarTablero(board);
  const totalTurno = turno === 1 ? resTotal1 : resTotal2;
  const totalRival = turno === 1 ? resTotal2 : resTotal1;
  const diff = totalTurno - totalRival;

  // Sin casillas disputadas: el marcador final ya es inmutable.
  if (resContested === 0) {
    return scoreTerminal(diff, profundidad);
  }

  if (pasesSeguidos === 1) {
    if (diff > 0) return scoreTerminal(diff, profundidad);
    if (diff === 0) {
      if (0 >= beta) return 0;
      if (0 > alpha) alpha = 0;
    }
  }

  if (profundidad === 0 || ply >= MAX_DEPTH_SCRATCH) {
    return evaluarVoronoi(board, turno);
  }

  const n = prepararCandidatasNivel(board, turno, ply);
  if (n === 0) {
    return scoreTerminal(diff, profundidad);
  }

  const cands = CAND_STACK[ply];
  const scores = SCORE_STACK[ply];
  const limite = Math.min(
    profundidad >= 3 ? 6 : profundidad === 2 ? 5 : 4,
    n
  );

  const rival: Player = turno === 1 ? 2 : 1;
  let mejor = pasesSeguidos === 1 && diff === 0 ? 0 : -Infinity;

  for (let k = 0; k < limite; k++) {
    let bestPos = k;
    let bestS = scores[k];
    for (let j = k + 1; j < n; j++) {
      if (scores[j] > bestS) {
        bestS = scores[j];
        bestPos = j;
      }
    }
    const pad = cands[bestPos];
    cands[bestPos] = cands[k];
    scores[bestPos] = scores[k];

    board[pad] = turno;
    const val = -negamax(board, profundidad - 1, ply + 1, -beta, -alpha, rival, 0, busq);
    board[pad] = 0;

    if (busq.abortado) return 0;
    if (val > mejor) mejor = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }

  return mejor;
}

function elegirFacil(state: WalkingDotsState, rng: Rng): Move {
  const legales = casillasLegales(state.board, state.currentPlayer);
  if (legales.length === 0) return 'pasar';
  return elegirAlAzar(legales, rng);
}

function elegirMedio(state: WalkingDotsState, rng: Rng): Move {
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const area = puntajes(state.board);

  if (state.pasesSeguidos === 1 && area.total[yo] > area.total[rival]) {
    return 'pasar';
  }

  const legales = casillasLegales(state.board, yo);
  if (legales.length === 0) return 'pasar';

  // Evitar rellenar cavidades ya cercadas propias.
  const abiertas = legales.filter(i => area.duenoDeVacia[i] === null);
  if (abiertas.length === 0) return 'pasar';

  cargarTablero(state.board);
  analizarTablero(PAD_BOARD);
  const distRival = yo === 1 ? DIST2 : DIST1;
  const distAntes = abiertas.map(m => Math.min(10, distRival[IDX_TO_PAD[m]]));
  const baseDiff = area.total[yo] - area.total[rival];

  const evaluadas: { mov: number; score: number }[] = [];
  for (let i = 0; i < abiertas.length; i++) {
    const m = abiertas[i];
    const pad = IDX_TO_PAD[m];
    const dr = distAntes[i];
    PAD_BOARD[pad] = yo;
    analizarTablero(PAD_BOARD);
    PAD_BOARD[pad] = 0;

    const postDiff = yo === 1 ? resTotal1 - resTotal2 : resTotal2 - resTotal1;
    const ganancia = postDiff - baseDiff;

    let libresContiguas = 0;
    if (PAD_BOARD[pad - STRIDE] === 0) libresContiguas++;
    if (PAD_BOARD[pad - 1] === 0) libresContiguas++;
    if (PAD_BOARD[pad + 1] === 0) libresContiguas++;
    if (PAD_BOARD[pad + STRIDE] === 0) libresContiguas++;

    const score =
      ganancia * 24 +
      CENTRO_BONUS_PAD[pad] * 3 +
      (11 - dr) * 3 +
      libresContiguas * 2;
    evaluadas.push({ mov: m, score });
  }

  evaluadas.sort((a, b) => b.score - a.score);
  const mejorScore = evaluadas[0].score;
  const cercanas = evaluadas
    .filter(e => mejorScore - e.score <= 6)
    .slice(0, 3)
    .map(e => e.mov);

  return elegirAlAzar(cercanas, rng);
}

function elegirDificil(state: WalkingDotsState, rng: Rng): Move {
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;

  cargarTablero(state.board);
  analizarTablero(PAD_BOARD);
  const totalYo = yo === 1 ? resTotal1 : resTotal2;
  const totalRival = yo === 1 ? resTotal2 : resTotal1;
  const diff = totalYo - totalRival;

  // Decisión inmediata de pasar si el rival pasó y vamos adelante.
  if (state.pasesSeguidos === 1 && diff > 0) {
    return 'pasar';
  }

  // Poda completa de auto-relleno: si no hay casillas disputadas, pasar cierra sin regalar turnos.
  if (resContested === 0) {
    return 'pasar';
  }

  const distYo = yo === 1 ? DIST1 : DIST2;
  const distRival = yo === 1 ? DIST2 : DIST1;
  const candidatasPad: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (PAD_BOARD[pad] === 0 && distYo[pad] === 1 && distRival[pad] < INF_DIST) {
      candidatasPad.push(pad);
    }
  }
  if (candidatasPad.length === 0) {
    return 'pasar';
  }

  const contestedInicial = resContested;

  // Ordenar candidatas de raíz 1 vez con evaluación Voronoi 1-ply (detecta cierres y bloqueos).
  const ordenRaiz = candidatasPad.map(pad => {
    PAD_BOARD[pad] = yo;
    analizarTablero(PAD_BOARD);
    const valRival = evaluarVoronoi(PAD_BOARD, rival);
    PAD_BOARD[pad] = 0;
    return { pad, s: -valRival + CENTRO_BONUS_PAD[pad] };
  });
  ordenRaiz.sort((a, b) => b.s - a.s);

  const limiteRaiz = Math.min(8, ordenRaiz.length);
  const baseOrden = new Uint8Array(limiteRaiz);
  for (let i = 0; i < limiteRaiz; i++) baseOrden[i] = ordenRaiz[i].pad;

  const puedePasarPorEmpate = state.pasesSeguidos === 1 && diff === 0;
  const maxProf = contestedInicial <= 12 ? MAX_PROF_FIN : MAX_PROF_DIFICIL;

  let pvPad = baseOrden[0];
  let mejoresFinales: Move[] = [PAD_TO_IDX[pvPad]];
  const busq: BusquedaEstado = { nodos: 0, abortado: false };
  const ordenIter = new Uint8Array(limiteRaiz);

  // Profundización iterativa determinista acotada por nodos (sin reloj).
  for (let prof = 2; prof <= maxProf; prof++) {
    let pos = 0;
    if (pvPad > 0) ordenIter[pos++] = pvPad;
    for (let i = 0; i < limiteRaiz; i++) {
      if (baseOrden[i] !== pvPad) ordenIter[pos++] = baseOrden[i];
    }

    let mejorValor = puedePasarPorEmpate ? 0 : -Infinity;
    let mejoresProf: Move[] = puedePasarPorEmpate ? ['pasar'] : [];
    let alpha = puedePasarPorEmpate ? 0 : -Infinity;
    const beta = Infinity;

    let completo = true;
    for (let i = 0; i < limiteRaiz; i++) {
      const pad = ordenIter[i];
      PAD_BOARD[pad] = yo;
      const val = -negamax(PAD_BOARD, prof - 1, 1, -beta, -alpha, rival, 0, busq);
      PAD_BOARD[pad] = 0;

      if (busq.abortado) {
        completo = false;
        break;
      }

      const movIdx = PAD_TO_IDX[pad];
      if (val > mejorValor) {
        mejorValor = val;
        mejoresProf = [movIdx];
      } else if (val === mejorValor) {
        mejoresProf.push(movIdx);
      }

      if (val > alpha) alpha = val;
    }

    if (!completo) break;

    if (mejoresProf.length > 0) {
      mejoresFinales = mejoresProf;
      const primerNumerico = mejoresProf.find(m => typeof m === 'number');
      pvPad = typeof primerNumerico === 'number' ? IDX_TO_PAD[primerNumerico] : 0;
    }

    if (mejorValor >= WIN_SCORE - 10_000) break;
  }

  return elegirAlAzar(mejoresFinales, rng);
}

/**
 * Elige el siguiente movimiento ('pasar' o índice 0..48) para Puntos Caminantes.
 */
export function elegirMovimiento(
  state: WalkingDotsState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Move {
  if (state.status !== 'playing') return 'pasar';
  if (dificultad === 'facil') return elegirFacil(state, rng);
  if (dificultad === 'medio') return elegirMedio(state, rng);
  return elegirDificil(state, rng);
}
