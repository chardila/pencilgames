import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { PARA_GANAR, TAMANO, type CellValue, type GomokuState, type Player } from './engine';

const TOTAL = TAMANO * TAMANO;
const MITAD = Math.floor(TAMANO / 2);
const CENTRO = MITAD * TAMANO + MITAD;

// Tablero con borde centinela (WALL = 3) para evitar comprobaciones de límites en bucles calientes.
const STRIDE = TAMANO + 2;
const PAD_TOTAL = STRIDE * STRIDE;
const WALL = 3;
const STEPS = [1, STRIDE, STRIDE + 1, STRIDE - 1] as const;

const IDX_TO_PAD = new Uint8Array(TOTAL);
const PAD_TO_IDX = new Int8Array(PAD_TOTAL).fill(-1);
const DIST_CENTRO_PAD = new Int8Array(PAD_TOTAL);

for (let r = 0; r < TAMANO; r++) {
  for (let c = 0; c < TAMANO; c++) {
    const idx = r * TAMANO + c;
    const pad = (r + 1) * STRIDE + (c + 1);
    IDX_TO_PAD[idx] = pad;
    PAD_TO_IDX[pad] = idx;
    DIST_CENTRO_PAD[pad] = Math.abs(r - MITAD) + Math.abs(c - MITAD);
  }
}

const PAD_CENTRO = IDX_TO_PAD[CENTRO];

// Vecinos dentro de radio Chebyshev <= 2 en coordenadas del tablero con borde.
const PAD_VECINOS_2: Uint8Array[] = Array.from({ length: PAD_TOTAL }, (_, pad) => {
  const idx = PAD_TO_IDX[pad];
  if (idx < 0) return new Uint8Array(0);
  const f0 = Math.floor(idx / TAMANO);
  const c0 = idx % TAMANO;
  const vecinos: number[] = [];
  for (let df = -2; df <= 2; df++) {
    const f = f0 + df;
    if (f < 0 || f >= TAMANO) continue;
    for (let dc = -2; dc <= 2; dc++) {
      if (df === 0 && dc === 0) continue;
      const c = c0 + dc;
      if (c < 0 || c >= TAMANO) continue;
      vecinos.push(IDX_TO_PAD[f * TAMANO + c]);
    }
  }
  return Uint8Array.from(vecinos);
});

const VECINDAD_CENTRO = [-TAMANO - 1, -TAMANO, -TAMANO + 1, -1, 0, 1, TAMANO - 1, TAMANO, TAMANO + 1].map(
  d => CENTRO + d
);

// Scratches reutilizables: se rellenan y leen por completo antes de cualquier recursión.
const MARCADAS_SCRATCH = new Uint8Array(PAD_TOTAL);
const SCORE_SCRATCH = new Int32Array(PAD_TOTAL);
const PAD_BOARD = new Uint8Array(PAD_TOTAL);

function cargarTablero(board: readonly CellValue[]): void {
  PAD_BOARD.fill(WALL);
  for (let i = 0; i < TOTAL; i++) {
    const v = board[i];
    PAD_BOARD[IDX_TO_PAD[i]] = v === null ? 0 : v;
  }
}

// Precomputar las 36 líneas de longitud >= 5 en coordenadas con borde.
const PAD_LINEAS: Uint8Array[] = (() => {
  const res: Uint8Array[] = [];
  const toPad = (arr: number[]) => Uint8Array.from(arr, idx => IDX_TO_PAD[idx]);
  // Filas y columnas
  for (let i = 0; i < TAMANO; i++) {
    res.push(toPad(Array.from({ length: TAMANO }, (_, c) => i * TAMANO + c)));
    res.push(toPad(Array.from({ length: TAMANO }, (_, f) => f * TAMANO + i)));
  }
  // Diagonales ↘
  for (let start = 0; start <= TAMANO - PARA_GANAR; start++) {
    const d1: number[] = [];
    for (let k = 0; start + k < TAMANO; k++) d1.push(k * TAMANO + (start + k));
    res.push(toPad(d1));
    if (start > 0) {
      const d2: number[] = [];
      for (let k = 0; start + k < TAMANO; k++) d2.push((start + k) * TAMANO + k);
      res.push(toPad(d2));
    }
  }
  // Diagonales ↗
  for (let start = PARA_GANAR - 1; start < TAMANO; start++) {
    const d1: number[] = [];
    for (let k = 0; start - k >= 0; k++) d1.push(k * TAMANO + (start - k));
    res.push(toPad(d1));
    if (start < TAMANO - 1) {
      const baseF = TAMANO - 1 - start;
      const d2: number[] = [];
      for (let k = 0; baseF + k < TAMANO; k++) {
        d2.push((baseF + k) * TAMANO + (TAMANO - 1 - k));
      }
      res.push(toPad(d2));
    }
  }
  return res;
})();

function obtenerCandidatas(board: Uint8Array): number[] {
  MARCADAS_SCRATCH.fill(0);
  let hayFichas = false;

  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (board[pad] === 0) continue;
    hayFichas = true;
    const vecinos = PAD_VECINOS_2[pad];
    for (let k = 0; k < vecinos.length; k++) {
      const vPad = vecinos[k];
      if (board[vPad] === 0) MARCADAS_SCRATCH[vPad] = 1;
    }
  }

  if (!hayFichas) return [PAD_CENTRO];

  const candidatas: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (MARCADAS_SCRATCH[pad] === 1) candidatas.push(pad);
  }
  if (candidatas.length > 0) return candidatas;

  for (let i = 0; i < TOTAL; i++) {
    const pad = IDX_TO_PAD[i];
    if (board[pad] === 0) candidatas.push(pad);
  }
  return candidatas;
}

function esVictoriaEn(board: Uint8Array, padIdx: number, player: Player): boolean {
  for (let d = 0; d < 4; d++) {
    const step = STEPS[d];
    let cuenta = 1;
    let p = padIdx - step;
    while (board[p] === player) {
      cuenta++;
      p -= step;
    }
    p = padIdx + step;
    while (board[p] === player) {
      cuenta++;
      p += step;
    }
    if (cuenta >= PARA_GANAR) return true;
  }
  return false;
}

function puntuarRacha(largo: number, abiertos: number): number {
  if (largo >= 5) return 100_000;
  if (abiertos === 0) return 0;
  if (largo === 4) return abiertos === 2 ? 15_000 : 2_500;
  if (largo === 3) return abiertos === 2 ? 1_200 : 180;
  if (largo === 2) return abiertos === 2 ? 90 : 18;
  return abiertos === 2 ? 6 : 1;
}

/**
 * Evalúa el tablero por rachas en las 36 líneas, diferenciando extremos abiertos
 * y detectando victoria inmediata en turno si el jugador activo ya tiene 4 abiertos.
 */
function evaluarTablero(board: Uint8Array, jugadorTurno: Player): number {
  let score = 0;

  for (let l = 0; l < PAD_LINEAS.length; l++) {
    const linea = PAD_LINEAS[l];
    let i = 0;
    const n = linea.length;
    while (i < n) {
      const ficha = board[linea[i]];
      if (ficha === 0) {
        i++;
        continue;
      }
      const izqLibre = i > 0 && board[linea[i - 1]] === 0;
      let j = i + 1;
      while (j < n && board[linea[j]] === ficha) j++;
      const derLibre = j < n && board[linea[j]] === 0;
      const abiertos = (izqLibre ? 1 : 0) + (derLibre ? 1 : 0);
      const largo = j - i;
      if (ficha === jugadorTurno && largo >= 4 && abiertos >= 1) {
        return 90_000;
      }
      const pts = puntuarRacha(largo, abiertos);
      if (ficha === jugadorTurno) {
        score += pts;
      } else {
        // Ponderar ligeramente al rival en amenazas altas porque ya le toca pronto.
        score -= pts >= 1_200 ? Math.round(pts * 1.15) : pts;
      }
      i = j;
    }
  }

  return score;
}

/**
 * Puntúa localmente el impacto de colocar una ficha de `player` en `padIdx`,
 * inspeccionando solo las 4 direcciones que cruzan la casilla.
 */
function puntuarCasillaLocal(board: Uint8Array, padIdx: number, player: Player): number {
  let total = 0;

  for (let d = 0; d < 4; d++) {
    const step = STEPS[d];
    let cuenta = 1;

    let p1 = padIdx - step;
    while (board[p1] === player) {
      cuenta++;
      p1 -= step;
    }
    const izqLibre = board[p1] === 0;

    let p2 = padIdx + step;
    while (board[p2] === player) {
      cuenta++;
      p2 += step;
    }
    const derLibre = board[p2] === 0;

    if (cuenta >= PARA_GANAR) {
      total += 100_000;
    } else if (cuenta === 1) {
      if (izqLibre || derLibre) {
        total += izqLibre && derLibre ? 6 : 1;
      }
    } else {
      let espacio = cuenta;
      while ((board[p1] === 0 || board[p1] === player) && espacio < PARA_GANAR) {
        espacio++;
        p1 -= step;
      }
      while ((board[p2] === 0 || board[p2] === player) && espacio < PARA_GANAR) {
        espacio++;
        p2 += step;
      }
      if (espacio >= PARA_GANAR) {
        total += puntuarRacha(cuenta, (izqLibre ? 1 : 0) + (derLibre ? 1 : 0));
      }
    }
  }

  return total;
}

interface CandidataEvaluada {
  pad: number;
  score: number;
}

function ordenarCandidatas(
  board: Uint8Array,
  candidatas: number[],
  jugador: Player
): CandidataEvaluada[] {
  const rival: Player = jugador === 1 ? 2 : 1;
  const evaluadas: CandidataEvaluada[] = new Array(candidatas.length);
  for (let i = 0; i < candidatas.length; i++) {
    const pad = candidatas[i];
    const ataque = puntuarCasillaLocal(board, pad, jugador);
    const defensa = puntuarCasillaLocal(board, pad, rival);
    evaluadas[i] = {
      pad,
      score: ataque + Math.round(defensa * 0.9) - DIST_CENTRO_PAD[pad],
    };
  }
  evaluadas.sort((a, b) => b.score - a.score);
  return evaluadas;
}

function negamax(
  board: Uint8Array,
  profundidad: number,
  alpha: number,
  beta: number,
  turno: Player
): number {
  if (profundidad === 0) {
    return evaluarTablero(board, turno);
  }

  const candidatas = obtenerCandidatas(board);
  const n = candidatas.length;
  if (n === 0) return 0;

  const rival: Player = turno === 1 ? 2 : 1;
  let maxScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const pad = candidatas[i];
    const ataque = puntuarCasillaLocal(board, pad, turno);
    if (ataque >= 100_000) return 100_000 + profundidad;
    const defensa = puntuarCasillaLocal(board, pad, rival);
    const score = ataque + Math.round(defensa * 0.9) - DIST_CENTRO_PAD[pad];
    SCORE_SCRATCH[pad] = score;
    if (score > maxScore) maxScore = score;
  }

  const soloUrgentes = maxScore >= 85_000;
  const limite = Math.min(soloUrgentes ? 2 : profundidad >= 2 ? 5 : 4, n);
  const jugadas: number[] = [];

  for (let k = 0; k < limite; k++) {
    let bestPos = k;
    let bestVal = SCORE_SCRATCH[candidatas[k]];
    for (let j = k + 1; j < n; j++) {
      const val = SCORE_SCRATCH[candidatas[j]];
      if (val > bestVal) {
        bestVal = val;
        bestPos = j;
      }
    }
    if (soloUrgentes && bestVal < 85_000) break;
    const pad = candidatas[bestPos];
    candidatas[bestPos] = candidatas[k];
    jugadas.push(pad);
  }

  let mejor = -Infinity;
  for (let i = 0; i < jugadas.length; i++) {
    const pad = jugadas[i];
    board[pad] = turno;
    const valor = -negamax(board, profundidad - 1, -beta, -alpha, rival);
    board[pad] = 0;
    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }
  return mejor;
}

/**
 * Elige la siguiente casilla del bot de Gomoku según la dificultad indicada.
 */
export function elegirMovimiento(
  state: GomokuState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  cargarTablero(state.board);
  const board = PAD_BOARD;
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const candidatas = obtenerCandidatas(board);
  if (candidatas.length === 0) return CENTRO;

  // Tablero vacío: en Fácil variar alrededor del centro; en Medio/Difícil ir al centro.
  if (candidatas.length === 1 && candidatas[0] === PAD_CENTRO && state.board.every(c => c === null)) {
    if (dificultad === 'facil') {
      return elegirAlAzar(VECINDAD_CENTRO, rng);
    }
    return CENTRO;
  }

  const ganadoras = candidatas.filter(p => esVictoriaEn(board, p, yo));

  if (dificultad === 'facil') {
    if (ganadoras.length > 0 && (candidatas.length === ganadoras.length || rng() < 0.35)) {
      return PAD_TO_IDX[elegirAlAzar(ganadoras, rng)];
    }
    const pool =
      ganadoras.length > 0
        ? candidatas.filter(p => !ganadoras.includes(p))
        : candidatas;
    return PAD_TO_IDX[elegirAlAzar(pool, rng)];
  }

  if (ganadoras.length > 0) return PAD_TO_IDX[elegirAlAzar(ganadoras, rng)];

  const bloqueos4 = candidatas.filter(p => esVictoriaEn(board, p, rival));
  if (bloqueos4.length > 0) return PAD_TO_IDX[elegirAlAzar(bloqueos4, rng)];

  const ordenadas = ordenarCandidatas(board, candidatas, yo);

  if (dificultad === 'medio') {
    const top = ordenadas.slice(0, Math.min(3, ordenadas.length)).map(c => PAD_TO_IDX[c.pad]);
    return elegirAlAzar(top, rng);
  }

  const top = ordenadas.slice(0, Math.min(5, ordenadas.length));
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < top.length; i++) {
    const pad = top[i].pad;
    board[pad] = yo;
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(board, 2, -Infinity, beta, rival);
    board[pad] = 0;
    if (valor > mejor) {
      mejor = valor;
      mejores = [PAD_TO_IDX[pad]];
    } else if (valor === mejor) {
      mejores.push(PAD_TO_IDX[pad]);
    }
  }

  return elegirAlAzar(mejores, rng);
}
