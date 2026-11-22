import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  OBJETIVO,
  TAMANO,
  TODOS_LOS_CUADRADOS,
  type MetaSquaresState,
  type Move,
  type Player,
} from './engine';

const TOTAL = TAMANO * TAMANO;
const NUM_SQ = TODOS_LOS_CUADRADOS.length;

const SQ_CORNERS = new Uint8Array(NUM_SQ * 4);
const CELL_TO_SQUARES: Uint8Array[] = (() => {
  const listas: number[][] = Array.from({ length: TOTAL }, () => []);
  for (let sq = 0; sq < NUM_SQ; sq++) {
    const corners = TODOS_LOS_CUADRADOS[sq].corners;
    const base = sq * 4;
    for (let k = 0; k < 4; k++) {
      const c = corners[k];
      SQ_CORNERS[base + k] = c;
      listas[c].push(sq);
    }
  }
  return listas.map(l => Uint8Array.from(l));
})();

const CELL_DEGREE = Uint8Array.from(CELL_TO_SQUARES, sqs => sqs.length);

// Búferes reutilizables para búsqueda síncrona sin asignaciones en nodos internos.
const BOARD_BUF = new Uint8Array(TOTAL);
const C1_BUF = new Uint8Array(NUM_SQ);
const C2_BUF = new Uint8Array(NUM_SQ);
const SCORE_SCRATCH = new Int32Array(TOTAL);

function cargarEstado(state: MetaSquaresState): number {
  C1_BUF.fill(0);
  C2_BUF.fill(0);
  let vacias = 0;
  for (let i = 0; i < TOTAL; i++) {
    const v = state.board[i];
    if (v === null) {
      BOARD_BUF[i] = 0;
      vacias++;
    } else {
      BOARD_BUF[i] = v;
    }
  }
  for (let sq = 0; sq < NUM_SQ; sq++) {
    const base = sq * 4;
    let c1 = 0;
    let c2 = 0;
    for (let k = 0; k < 4; k++) {
      const v = BOARD_BUF[SQ_CORNERS[base + k]];
      if (v === 1) c1++;
      else if (v === 2) c2++;
    }
    C1_BUF[sq] = c1;
    C2_BUF[sq] = c2;
  }
  return vacias;
}

function hacerJugada(cell: number, jugador: Player): number {
  BOARD_BUF[cell] = jugador;
  const sqs = CELL_TO_SQUARES[cell];
  let ganados = 0;
  if (jugador === 1) {
    for (let i = 0; i < sqs.length; i++) {
      const sq = sqs[i];
      const nv = C1_BUF[sq] + 1;
      C1_BUF[sq] = nv;
      if (nv === 4) ganados++;
    }
  } else {
    for (let i = 0; i < sqs.length; i++) {
      const sq = sqs[i];
      const nv = C2_BUF[sq] + 1;
      C2_BUF[sq] = nv;
      if (nv === 4) ganados++;
    }
  }
  return ganados;
}

function deshacerJugada(cell: number, jugador: Player): void {
  BOARD_BUF[cell] = 0;
  const sqs = CELL_TO_SQUARES[cell];
  if (jugador === 1) {
    for (let i = 0; i < sqs.length; i++) {
      C1_BUF[sqs[i]]--;
    }
  } else {
    for (let i = 0; i < sqs.length; i++) {
      C2_BUF[sqs[i]]--;
    }
  }
}

interface AnalisisCelda {
  gana: number;
  bloquea: number;
  potencial: number;
}

function analizarCelda(cell: number, turno: Player): AnalisisCelda {
  const sqs = CELL_TO_SQUARES[cell];
  const own = turno === 1 ? C1_BUF : C2_BUF;
  const opp = turno === 1 ? C2_BUF : C1_BUF;
  let gana = 0;
  let bloquea = 0;
  let potencial = 0;

  for (let i = 0; i < sqs.length; i++) {
    const sq = sqs[i];
    const co = own[sq];
    const cp = opp[sq];
    if (cp === 0) {
      if (co === 3) gana++;
      else if (co === 2) potencial += 260;
      else if (co === 1) potencial += 38;
      else potencial += 6;
    } else if (co === 0) {
      if (cp === 3) bloquea++;
      else if (cp === 2) potencial += 170;
      else if (cp === 1) potencial += 20;
    }
  }

  return { gana, bloquea, potencial };
}

function puntuarCandidata(
  cell: number,
  turno: Player,
  myScore: number,
  opScore: number,
): number {
  const { gana, bloquea, potencial } = analizarCelda(cell, turno);
  if (myScore + gana >= OBJETIVO) return 1_000_000 + gana * 100;
  let score = potencial + CELL_DEGREE[cell] * 3;
  score += gana * 4_000;
  if (bloquea > 0) {
    score += opScore + bloquea >= OBJETIVO ? 250_000 + bloquea * 100 : bloquea * 2_600;
  }
  return score;
}

function evaluarHoja(turno: Player, s1: number, s2: number): number {
  const myScore = turno === 1 ? s1 : s2;
  const opScore = turno === 1 ? s2 : s1;

  let p1_3 = 0;
  let p1_2 = 0;
  let p1_1 = 0;
  let p2_3 = 0;
  let p2_2 = 0;
  let p2_1 = 0;

  for (let sq = 0; sq < NUM_SQ; sq++) {
    const a = C1_BUF[sq];
    const b = C2_BUF[sq];
    if (b === 0) {
      if (a === 3) p1_3++;
      else if (a === 2) p1_2++;
      else if (a === 1) p1_1++;
    } else if (a === 0) {
      if (b === 3) p2_3++;
      else if (b === 2) p2_2++;
      else if (b === 1) p2_1++;
    }
  }

  const my3 = turno === 1 ? p1_3 : p2_3;
  const my2 = turno === 1 ? p1_2 : p2_2;
  const my1 = turno === 1 ? p1_1 : p2_1;
  const op3 = turno === 1 ? p2_3 : p1_3;
  const op2 = turno === 1 ? p2_2 : p1_2;
  const op1 = turno === 1 ? p2_1 : p1_1;

  // Si el jugador en turno ya tiene 3/4 y está a 1 punto de 5, gana en su siguiente turno.
  if (myScore >= OBJETIVO - 1 && my3 > 0) {
    return 90_000;
  }

  return (
    (myScore - opScore) * 1_400 +
    my3 * 520 -
    op3 * 380 +
    my2 * 75 -
    op2 * 65 +
    my1 * 10 -
    op1 * 9
  );
}

function seleccionarTopCandidatas(
  turno: Player,
  s1: number,
  s2: number,
  limiteMax: number,
): { jugadas: number[]; victoriaInmediata: boolean } {
  const myScore = turno === 1 ? s1 : s2;
  const opScore = turno === 1 ? s2 : s1;
  const vacias: number[] = [];

  for (let c = 0; c < TOTAL; c++) {
    if (BOARD_BUF[c] !== 0) continue;
    const sc = puntuarCandidata(c, turno, myScore, opScore);
    if (sc >= 1_000_000) {
      return { jugadas: [c], victoriaInmediata: true };
    }
    SCORE_SCRATCH[c] = sc;
    vacias.push(c);
  }

  const limite = Math.min(limiteMax, vacias.length);
  const jugadas: number[] = [];
  for (let k = 0; k < limite; k++) {
    let bestPos = k;
    let bestVal = SCORE_SCRATCH[vacias[k]];
    for (let j = k + 1; j < vacias.length; j++) {
      const val = SCORE_SCRATCH[vacias[j]];
      if (val > bestVal) {
        bestVal = val;
        bestPos = j;
      }
    }
    const chosen = vacias[bestPos];
    vacias[bestPos] = vacias[k];
    jugadas.push(chosen);
  }

  return { jugadas, victoriaInmediata: false };
}

function negamax(
  profundidad: number,
  alpha: number,
  beta: number,
  turno: Player,
  emptyCount: number,
  s1: number,
  s2: number,
): number {
  const myScore = turno === 1 ? s1 : s2;
  const opScore = turno === 1 ? s2 : s1;

  if (myScore >= OBJETIVO) return 100_000 + profundidad;
  if (opScore >= OBJETIVO) return -(100_000 + profundidad);
  if (emptyCount === 0) {
    if (myScore > opScore) return 50_000 + (myScore - opScore) * 100;
    if (myScore < opScore) return -50_000 + (myScore - opScore) * 100;
    return 0;
  }
  if (profundidad === 0) {
    return evaluarHoja(turno, s1, s2);
  }

  const limiteMax = profundidad >= 2 ? 10 : 8;
  const { jugadas, victoriaInmediata } = seleccionarTopCandidatas(
    turno,
    s1,
    s2,
    limiteMax,
  );
  if (victoriaInmediata) {
    return 100_000 + profundidad;
  }

  const rival: Player = turno === 1 ? 2 : 1;
  let mejor = -Infinity;

  for (let i = 0; i < jugadas.length; i++) {
    const cell = jugadas[i];
    const ganados = hacerJugada(cell, turno);
    const ns1 = turno === 1 ? s1 + ganados : s1;
    const ns2 = turno === 2 ? s2 + ganados : s2;
    const valor =
      (turno === 1 ? ns1 : ns2) >= OBJETIVO
        ? 100_000 + profundidad
        : -negamax(profundidad - 1, -beta, -alpha, rival, emptyCount - 1, ns1, ns2);
    deshacerJugada(cell, turno);

    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }

  return mejor;
}

function elegirFacil(vacias: number[], yo: Player, rng: Rng): Move {
  const completadoras: number[] = [];
  const noCompletadoras: number[] = [];

  for (let i = 0; i < vacias.length; i++) {
    const c = vacias[i];
    if (analizarCelda(c, yo).gana > 0) completadoras.push(c);
    else noCompletadoras.push(c);
  }

  if (completadoras.length > 0) {
    if (noCompletadoras.length === 0 || rng() < 0.4) {
      return { celda: elegirAlAzar(completadoras, rng) };
    }
    return { celda: elegirAlAzar(noCompletadoras, rng) };
  }

  return { celda: elegirAlAzar(vacias, rng) };
}

function elegirMedio(
  state: MetaSquaresState,
  vacias: number[],
  yo: Player,
  rival: Player,
  rng: Rng,
): Move {
  const myScore = state.scores[yo];
  const opScore = state.scores[rival];

  const victorias: number[] = [];
  const bloqueosCriticos: number[] = [];
  const completadoras: { cell: number; score: number }[] = [];
  const bloqueadoras: { cell: number; score: number }[] = [];
  const posicionales: { cell: number; score: number }[] = [];

  for (let i = 0; i < vacias.length; i++) {
    const c = vacias[i];
    const { gana, bloquea, potencial } = analizarCelda(c, yo);

    if (myScore + gana >= OBJETIVO) {
      victorias.push(c);
    }
    if (bloquea > 0 && opScore + bloquea >= OBJETIVO) {
      bloqueosCriticos.push(c);
    }
    if (gana > 0) {
      completadoras.push({ cell: c, score: gana * 100 + bloquea * 30 + potencial * 0.01 });
    }
    if (bloquea > 0) {
      bloqueadoras.push({ cell: c, score: bloquea * 100 + potencial * 0.01 });
    }
    posicionales.push({ cell: c, score: potencial + CELL_DEGREE[c] * 3 });
  }

  if (victorias.length > 0) {
    return { celda: elegirAlAzar(victorias, rng) };
  }
  if (bloqueosCriticos.length > 0) {
    return { celda: elegirAlAzar(bloqueosCriticos, rng) };
  }
  if (completadoras.length > 0) {
    completadoras.sort((a, b) => b.score - a.score);
    const mejor = completadoras[0].score;
    const empates = completadoras
      .filter(x => x.score >= mejor - 1e-6)
      .map(x => x.cell);
    return { celda: elegirAlAzar(empates, rng) };
  }
  if (bloqueadoras.length > 0) {
    bloqueadoras.sort((a, b) => b.score - a.score);
    const mejor = bloqueadoras[0].score;
    const empates = bloqueadoras
      .filter(x => x.score >= mejor - 1e-6)
      .map(x => x.cell);
    return { celda: elegirAlAzar(empates, rng) };
  }

  posicionales.sort((a, b) => b.score - a.score);
  const top = posicionales
    .slice(0, Math.min(4, posicionales.length))
    .map(x => x.cell);
  return { celda: elegirAlAzar(top, rng) };
}

function elegirDificil(
  state: MetaSquaresState,
  emptyCount: number,
  yo: Player,
  rival: Player,
  rng: Rng,
): Move {
  const s1 = state.scores[1];
  const s2 = state.scores[2];
  const { jugadas, victoriaInmediata } = seleccionarTopCandidatas(yo, s1, s2, 10);
  if (victoriaInmediata) {
    return { celda: jugadas[0] };
  }

  const profRestante = emptyCount <= 8 ? 4 : emptyCount <= 14 ? 3 : 2;
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < jugadas.length; i++) {
    const cell = jugadas[i];
    const ganados = hacerJugada(cell, yo);
    const ns1 = yo === 1 ? s1 + ganados : s1;
    const ns2 = yo === 2 ? s2 + ganados : s2;
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(
      profRestante,
      -Infinity,
      beta,
      rival,
      emptyCount - 1,
      ns1,
      ns2,
    );
    deshacerJugada(cell, yo);

    if (valor > mejor) {
      mejor = valor;
      mejores = [cell];
    } else if (valor === mejor) {
      mejores.push(cell);
    }
  }

  return { celda: elegirAlAzar(mejores, rng) };
}

/**
 * Elige la siguiente jugada del bot de MetaSquares según la dificultad indicada.
 */
export function elegirMovimiento(
  state: MetaSquaresState,
  dificultad: Dificultad,
  rng: Rng = Math.random,
): Move {
  const emptyCount = cargarEstado(state);
  if (emptyCount === 0) return { celda: 0 };

  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;

  if (dificultad === 'dificil') {
    return elegirDificil(state, emptyCount, yo, rival, rng);
  }

  const vacias: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (BOARD_BUF[i] === 0) vacias.push(i);
  }

  if (dificultad === 'facil') {
    return elegirFacil(vacias, yo, rng);
  }

  return elegirMedio(state, vacias, yo, rival, rng);
}
