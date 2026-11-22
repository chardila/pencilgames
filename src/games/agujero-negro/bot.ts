import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { getNeighbors, TOTAL_POSITIONS, type AgujeroNegroState } from './engine';

const NEIGHBORS: readonly Uint8Array[] = Array.from({ length: TOTAL_POSITIONS }, (_, id) =>
  Uint8Array.from(getNeighbors(id))
);

const DEGREE = Uint8Array.from(NEIGHBORS, n => n.length);

// Órbitas bajo simetría D3 del triángulo de 21 casillas cuando el tablero está vacío.
const ORBITAS_INICIALES: readonly (readonly number[])[] = [
  [0, 15, 20],
  [1, 2, 10, 14, 16, 19],
  [3, 5, 6, 9, 17, 18],
  [4, 11, 13],
  [7, 8, 12],
];

const BOARD_SCRATCH = new Int8Array(TOTAL_POSITIONS);
const EMP_DEG = new Uint8Array(TOTAL_POSITIONS);
const MOVES_BUF = Array.from({ length: TOTAL_POSITIONS + 1 }, () => new Int32Array(TOTAL_POSITIONS));
const SCORES_BUF = Array.from({ length: TOTAL_POSITIONS + 1 }, () => new Int32Array(TOTAL_POSITIONS));
const KILLER = new Int8Array(TOTAL_POSITIONS + 1);

function cargarTablero(state: AgujeroNegroState): number {
  BOARD_SCRATCH.fill(0);
  let emptyCount = 0;
  for (let i = 0; i < state.cells.length; i++) {
    const c = state.cells[i];
    if (c.value !== null && c.player !== null) {
      BOARD_SCRATCH[c.id] = c.player === 1 ? c.value : -c.value;
    } else {
      emptyCount++;
    }
  }
  for (let i = 0; i < TOTAL_POSITIONS; i++) {
    const ns = NEIGHBORS[i];
    let deg = 0;
    for (let j = 0; j < ns.length; j++) {
      if (BOARD_SCRATCH[ns[j]] === 0) deg++;
    }
    EMP_DEG[i] = deg;
  }
  return emptyCount;
}

function colocarEnScratch(pos: number, signedVal: number): void {
  BOARD_SCRATCH[pos] = signedVal;
  const ns = NEIGHBORS[pos];
  for (let i = 0; i < ns.length; i++) {
    EMP_DEG[ns[i]]--;
  }
}

function quitarDeScratch(pos: number): void {
  BOARD_SCRATCH[pos] = 0;
  const ns = NEIGHBORS[pos];
  for (let i = 0; i < ns.length; i++) {
    EMP_DEG[ns[i]]++;
  }
}

/**
 * Puntuación terminal exacta (en milésimas) cuando `bh` es la única casilla vacía.
 * Como ambos jugadores colocan 1..10 (suma 55 cada uno), la diferencia total previa
 * es siempre 0 y el resultado depende únicamente de las fichas adyacentes a `bh`.
 */
function evaluarAgujeroEn(bh: number, turno: 1 | 2): number {
  const ns = NEIGHBORS[bh];
  let danoP1 = 0;
  for (let i = 0; i < ns.length; i++) {
    danoP1 += BOARD_SCRATCH[ns[i]];
  }
  // Si J1 pierde `danoP1`, la diferencia P1 - P2 es `-danoP1`.
  return (turno === 1 ? -danoP1 : danoP1) * 1000;
}

/** Puntuación terminal exacta para `evaluarTerminal` general (ej. medio con 2 vacías). */
function evaluarTerminalGeneral(bh: number, turno: 1 | 2): number {
  let scoreP1 = 0;
  for (let i = 0; i < TOTAL_POSITIONS; i++) {
    scoreP1 += BOARD_SCRATCH[i];
  }
  const ns = NEIGHBORS[bh];
  for (let i = 0; i < ns.length; i++) {
    scoreP1 -= BOARD_SCRATCH[ns[i]];
  }
  return (turno === 1 ? scoreP1 : -scoreP1) * 1000;
}

/**
 * Evaluación heurística rápida usando `EMP_DEG` incremental:
 * diferencia de puntos supervivientes esperados (en milésimas) desde la perspectiva de `turno`.
 */
function evaluarEsperado(
  emptyCount: number,
  nextVal1: number,
  nextVal2: number,
  turno: 1 | 2
): number {
  let scoreP1 = 0;
  let santuarioTurno = 0;
  const valPropio = turno === 1 ? nextVal1 : nextVal2;

  for (let i = 0; i < TOTAL_POSITIONS; i++) {
    const v = BOARD_SCRATCH[i];
    const empDeg = EMP_DEG[i];

    if (v === 0) {
      if (empDeg === 0 && valPropio <= 10) {
        santuarioTurno += valPropio * 220;
      }
      continue;
    }

    if (empDeg === 0) {
      scoreP1 += v * 1000;
    } else {
      const pen = ((empDeg * 1000) / emptyCount) | 0;
      const riesgoExtra = empDeg > 1 ? (empDeg - 1) * 65 : 0;
      const peso = 1000 - pen - riesgoExtra;
      scoreP1 += v * (peso > 120 ? peso : 120);
    }
  }

  return (turno === 1 ? scoreP1 : -scoreP1) + santuarioTurno;
}

function prioridadMovimiento(pos: number, turno: 1 | 2, val: number): number {
  const signo = turno === 1 ? 1 : -1;
  const ns = NEIGHBORS[pos];
  let adjOwnHigh = 0;
  let adjRivalHigh = 0;

  for (let i = 0; i < ns.length; i++) {
    const nv = BOARD_SCRATCH[ns[i]];
    if (nv === 0) continue;
    const prod = nv * signo;
    if (prod > 0) {
      if (prod >= 5) adjOwnHigh += prod;
    } else {
      const av = -prod;
      if (av >= 5) adjRivalHigh += av;
    }
  }

  const empDeg = EMP_DEG[pos];
  if (val >= 5) {
    return (empDeg === 0 ? 500 : -empDeg * val * 12) + adjOwnHigh * 8 - adjRivalHigh * 4;
  }
  return adjRivalHigh * 10 + adjOwnHigh * 5 + empDeg * 4;
}

function negamax(
  depth: number,
  emptyCount: number,
  alpha: number,
  beta: number,
  turno: 1 | 2,
  nextVal1: number,
  nextVal2: number,
  ply: number
): number {
  // Con 2 casillas vacías solo queda 1 jugada (poner 10): el otro hueco es el agujero negro.
  if (emptyCount === 2) {
    let a = -1;
    let b = -1;
    for (let i = 0; i < TOTAL_POSITIONS; i++) {
      if (BOARD_SCRATCH[i] === 0) {
        if (a < 0) a = i;
        else {
          b = i;
          break;
        }
      }
    }
    const val = turno === 1 ? nextVal1 : nextVal2;
    const signedVal = turno === 1 ? val : -val;

    BOARD_SCRATCH[a] = signedVal;
    const scA = evaluarAgujeroEn(b, turno);
    BOARD_SCRATCH[a] = 0;

    BOARD_SCRATCH[b] = signedVal;
    const scB = evaluarAgujeroEn(a, turno);
    BOARD_SCRATCH[b] = 0;

    return scA > scB ? scA : scB;
  }

  if (depth === 0) {
    return evaluarEsperado(emptyCount, nextVal1, nextVal2, turno);
  }

  const moves = MOVES_BUF[ply];
  const scores = SCORES_BUF[ply];
  const val = turno === 1 ? nextVal1 : nextVal2;
  const killerPos = KILLER[ply];

  let n = 0;
  for (let i = 0; i < TOTAL_POSITIONS; i++) {
    if (BOARD_SCRATCH[i] === 0) {
      moves[n] = i;
      scores[n] = i === killerPos ? 1_000_000 : prioridadMovimiento(i, turno, val);
      n++;
    }
  }

  // En el tramo exacto (<= 8 vacías, y en general n <= 8) se exploran todas las jugadas.
  // En apertura/medio juego (> 8 vacías) acotamos ramificación en plies profundos para garantizar < 15 ms.
  const maxRamas = emptyCount <= 8 ? n : depth === 3 ? 12 : depth === 2 ? 10 : 8;
  const limit = n > maxRamas ? maxRamas : n;
  for (let i = 0; i < limit && i < n - 1; i++) {
    let bestIdx = i;
    let bestScore = scores[i];
    for (let j = i + 1; j < n; j++) {
      if (scores[j] > bestScore) {
        bestScore = scores[j];
        bestIdx = j;
      }
    }
    if (bestIdx !== i) {
      const tm = moves[i];
      moves[i] = moves[bestIdx];
      moves[bestIdx] = tm;
      scores[bestIdx] = scores[i];
      scores[i] = bestScore;
    }
  }

  const nextTurno: 1 | 2 = turno === 1 ? 2 : 1;
  const nv1 = turno === 1 ? nextVal1 + 1 : nextVal1;
  const nv2 = turno === 2 ? nextVal2 + 1 : nextVal2;
  const signedVal = turno === 1 ? val : -val;

  let mejor = -Infinity;
  for (let i = 0; i < limit; i++) {
    const pos = moves[i];
    colocarEnScratch(pos, signedVal);
    const valor = -negamax(
      depth - 1,
      emptyCount - 1,
      -beta,
      -alpha,
      nextTurno,
      nv1,
      nv2,
      ply + 1
    );
    quitarDeScratch(pos);

    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) {
      KILLER[ply] = pos;
      break;
    }
  }

  return mejor;
}

function elegirMedio(state: AgujeroNegroState, emptyCount: number, rng: Rng): number {
  const board = BOARD_SCRATCH;
  const yo = state.currentPlayer;
  const val = state.nextValue[yo];
  const signo = yo === 1 ? 1 : -1;

  if (emptyCount === 2) {
    let a = -1;
    let b = -1;
    for (let i = 0; i < TOTAL_POSITIONS; i++) {
      if (board[i] === 0) {
        if (a < 0) a = i;
        else {
          b = i;
          break;
        }
      }
    }
    const signedVal = signo * val;
    board[a] = signedVal;
    const scA = evaluarTerminalGeneral(b, yo);
    board[a] = 0;

    board[b] = signedVal;
    const scB = evaluarTerminalGeneral(a, yo);
    board[b] = 0;

    if (scA > scB) return a;
    if (scB > scA) return b;
    return elegirAlAzar([a, b], rng);
  }

  let mejorScore = -Infinity;
  let mejores: number[] = [];

  for (let pos = 0; pos < TOTAL_POSITIONS; pos++) {
    if (board[pos] !== 0) continue;
    const empDeg = EMP_DEG[pos];
    const ns = NEIGHBORS[pos];

    let ownProtect = 0;
    let rivalHelp = 0;
    let rivalHighAdj = 0;

    for (let j = 0; j < ns.length; j++) {
      const nv = board[ns[j]];
      if (nv === 0) continue;
      if (nv * signo > 0) {
        const av = Math.abs(nv);
        ownProtect += av >= 5 ? av * 2.0 : av * 0.5;
      } else {
        const av = Math.abs(nv);
        rivalHelp += av * 0.8;
        if (av >= 5) rivalHighAdj += av;
      }
    }

    let score: number;
    if (val <= 4) {
      const seguroPenalty = empDeg === 0 ? -8 : 0;
      score = rivalHighAdj * 2.6 + ownProtect * 0.8 + empDeg * 0.4 + seguroPenalty;
    } else {
      const safetySelf = empDeg === 0 ? val * 4.5 : -val * empDeg * 3.2;
      score = safetySelf + ownProtect - rivalHelp - DEGREE[pos] * 0.2;
    }

    if (score > mejorScore + 1e-9) {
      mejorScore = score;
      mejores = [pos];
    } else if (Math.abs(score - mejorScore) <= 1e-9) {
      mejores.push(pos);
    }
  }

  return elegirAlAzar(mejores, rng);
}

function elegirDificil(state: AgujeroNegroState, emptyCount: number, rng: Rng): number {
  const yo = state.currentPlayer;
  const rival: 1 | 2 = yo === 1 ? 2 : 1;
  const val = state.nextValue[yo];
  const signedVal = yo === 1 ? val : -val;
  const nv1 = yo === 1 ? state.nextValue[1] + 1 : state.nextValue[1];
  const nv2 = yo === 2 ? state.nextValue[2] + 1 : state.nextValue[2];

  // Si quedan exactamente 2 vacías, resolver en 1 paso.
  if (emptyCount === 2) {
    let a = -1;
    let b = -1;
    for (let i = 0; i < TOTAL_POSITIONS; i++) {
      if (BOARD_SCRATCH[i] === 0) {
        if (a < 0) a = i;
        else {
          b = i;
          break;
        }
      }
    }
    BOARD_SCRATCH[a] = signedVal;
    const scA = evaluarAgujeroEn(b, yo);
    BOARD_SCRATCH[a] = 0;

    BOARD_SCRATCH[b] = signedVal;
    const scB = evaluarAgujeroEn(a, yo);
    BOARD_SCRATCH[b] = 0;

    if (scA > scB) return a;
    if (scB > scA) return b;
    return elegirAlAzar([a, b], rng);
  }

  KILLER.fill(-1);

  // Profundidad 4 al inicio; resolución exacta cuando quedan <= 8 casillas vacías.
  const depth = emptyCount <= 8 ? emptyCount - 1 : 4;

  // En tablero completamente vacío, aprovechar simetría D3 evaluando solo 5 órbitas.
  if (emptyCount === TOTAL_POSITIONS) {
    let mejor = -Infinity;
    let mejores: number[] = [];
    for (const orbita of ORBITAS_INICIALES) {
      const rep = orbita[0];
      colocarEnScratch(rep, signedVal);
      const valor = -negamax(
        depth - 1,
        emptyCount - 1,
        -Infinity,
        Infinity,
        rival,
        nv1,
        nv2,
        1
      );
      quitarDeScratch(rep);

      if (valor > mejor) {
        mejor = valor;
        mejores = [...orbita];
      } else if (valor === mejor) {
        mejores.push(...orbita);
      }
    }
    return elegirAlAzar(mejores, rng);
  }

  const candidatas: Array<{ pos: number; prio: number }> = [];
  for (let i = 0; i < TOTAL_POSITIONS; i++) {
    if (BOARD_SCRATCH[i] === 0) {
      candidatas.push({ pos: i, prio: prioridadMovimiento(i, yo, val) });
    }
  }
  candidatas.sort((a, b) => b.prio - a.prio);

  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < candidatas.length; i++) {
    const pos = candidatas[i].pos;
    colocarEnScratch(pos, signedVal);
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(
      depth - 1,
      emptyCount - 1,
      -Infinity,
      beta,
      rival,
      nv1,
      nv2,
      1
    );
    quitarDeScratch(pos);

    if (valor > mejor) {
      mejor = valor;
      mejores = [pos];
    } else if (valor === mejor) {
      mejores.push(pos);
    }
  }

  return elegirAlAzar(mejores, rng);
}

/**
 * Elige la siguiente posición (0..20) para el bot de Agujero Negro según la dificultad.
 */
export function elegirMovimiento(
  state: AgujeroNegroState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const emptyCount = cargarTablero(state);
  if (emptyCount === 0) return 0;

  if (dificultad === 'facil') {
    const vacias: number[] = [];
    for (let i = 0; i < TOTAL_POSITIONS; i++) {
      if (BOARD_SCRATCH[i] === 0) vacias.push(i);
    }
    return elegirAlAzar(vacias, rng);
  }

  if (dificultad === 'medio') {
    return elegirMedio(state, emptyCount, rng);
  }

  return elegirDificil(state, emptyCount, rng);
}
