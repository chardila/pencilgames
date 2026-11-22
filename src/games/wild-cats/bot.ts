import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  CELDAS,
  LINEAS,
  MAX_RONDAS,
  celdasElegibles,
  type Celda,
  type Move,
  type Player,
  type WildCatsState,
} from './engine';

const NUM_LINEAS = LINEAS.length;
const LINEAS_PLANAS = new Uint8Array(NUM_LINEAS * 4);
const LINEAS_POR_CELDA: Uint8Array[] = Array.from({ length: CELDAS }, () => new Uint8Array(0));

{
  const porCelda: number[][] = Array.from({ length: CELDAS }, () => []);
  for (let l = 0; l < NUM_LINEAS; l++) {
    const linea = LINEAS[l];
    for (let k = 0; k < 4; k++) {
      const c = linea[k];
      LINEAS_PLANAS[l * 4 + k] = c;
      porCelda[c].push(l);
    }
  }
  for (let c = 0; c < CELDAS; c++) {
    LINEAS_POR_CELDA[c] = Uint8Array.from(porCelda[c]);
  }
}

const WIN_SCORE = 100_000;
const ITERACIONES_RM = 70;
const MAX_CANDIDATAS_RM = 9;

// Scratches reutilizables (sin recursión, uso secuencial dentro de elegirMovimiento).
const BOARD_SCRATCH = new Uint8Array(CELDAS);
const THREAT3_YO = new Uint8Array(CELDAS);
const THREAT3_RIVAL = new Uint8Array(CELDAS);
const FORK2_YO = new Uint8Array(CELDAS);
const FORK2_RIVAL = new Uint8Array(CELDAS);

const PAYOFF_MATRIX = new Float64Array(MAX_CANDIDATAS_RM * MAX_CANDIDATAS_RM);
const REGRET_YO = new Float64Array(MAX_CANDIDATAS_RM);
const REGRET_RIVAL = new Float64Array(MAX_CANDIDATAS_RM);
const PROB_YO = new Float64Array(MAX_CANDIDATAS_RM);
const PROB_RIVAL = new Float64Array(MAX_CANDIDATAS_RM);
const SUM_PROB_YO = new Float64Array(MAX_CANDIDATAS_RM);
const UTIL_YO = new Float64Array(MAX_CANDIDATAS_RM);
const UTIL_RIVAL = new Float64Array(MAX_CANDIDATAS_RM);

function cargarTablero(tablero: readonly Celda[]): number {
  let vacias = 0;
  for (let i = 0; i < CELDAS; i++) {
    const v = tablero[i];
    if (v === null) {
      BOARD_SCRATCH[i] = 0;
      vacias++;
    } else {
      BOARD_SCRATCH[i] = v;
    }
  }
  return vacias;
}

function completaLineaEn(board: Uint8Array, celda: number, player: Player): boolean {
  const lineas = LINEAS_POR_CELDA[celda];
  for (let idx = 0; idx < lineas.length; idx++) {
    const base = lineas[idx] * 4;
    let propias = 0;
    for (let k = 0; k < 4; k++) {
      const c = LINEAS_PLANAS[base + k];
      if (c === celda || board[c] === player) {
        propias++;
      } else {
        break;
      }
    }
    if (propias === 4) return true;
  }
  return false;
}

function tieneLinea4En(board: Uint8Array, celda: number, player: Player): boolean {
  const lineas = LINEAS_POR_CELDA[celda];
  for (let idx = 0; idx < lineas.length; idx++) {
    const base = lineas[idx] * 4;
    if (
      board[LINEAS_PLANAS[base]] === player &&
      board[LINEAS_PLANAS[base + 1]] === player &&
      board[LINEAS_PLANAS[base + 2]] === player &&
      board[LINEAS_PLANAS[base + 3]] === player
    ) {
      return true;
    }
  }
  return false;
}

function puntuarCasilla1Ply(board: Uint8Array, celda: number, yo: Player): number {
  const rival: Player = yo === 1 ? 2 : 1;
  const lineas = LINEAS_POR_CELDA[celda];
  let ofensiva = 0;
  let defensiva = 0;

  for (let idx = 0; idx < lineas.length; idx++) {
    const base = lineas[idx] * 4;
    let cYo = 0;
    let cRival = 0;
    for (let k = 0; k < 4; k++) {
      const v = board[LINEAS_PLANAS[base + k]];
      if (v === yo) cYo++;
      else if (v === rival) cRival++;
    }
    if (cRival === 0) {
      if (cYo === 3) ofensiva += 50_000;
      else if (cYo === 2) ofensiva += 420;
      else if (cYo === 1) ofensiva += 55;
      else ofensiva += 10;
    } else if (cYo === 0) {
      if (cRival === 3) defensiva += 24_000;
      else if (cRival === 2) defensiva += 210;
      else if (cRival === 1) defensiva += 24;
    }
  }

  return ofensiva + defensiva + lineas.length * 4;
}

function evaluarTablero(board: Uint8Array, yo: Player, vetada: number | null): number {
  const rival: Player = yo === 1 ? 2 : 1;
  THREAT3_YO.fill(0);
  THREAT3_RIVAL.fill(0);
  FORK2_YO.fill(0);
  FORK2_RIVAL.fill(0);

  let score = 0;

  for (let l = 0; l < NUM_LINEAS; l++) {
    const base = l * 4;
    const c0 = LINEAS_PLANAS[base];
    const c1 = LINEAS_PLANAS[base + 1];
    const c2 = LINEAS_PLANAS[base + 2];
    const c3 = LINEAS_PLANAS[base + 3];

    let cYo = 0;
    let cRival = 0;
    const v0 = board[c0];
    if (v0 === yo) cYo++;
    else if (v0 === rival) cRival++;
    const v1 = board[c1];
    if (v1 === yo) cYo++;
    else if (v1 === rival) cRival++;
    const v2 = board[c2];
    if (v2 === yo) cYo++;
    else if (v2 === rival) cRival++;
    const v3 = board[c3];
    if (v3 === yo) cYo++;
    else if (v3 === rival) cRival++;

    if (cYo > 0 && cRival > 0) continue;

    if (cYo > 0) {
      if (cYo === 3) {
        const e = v0 === 0 ? c0 : v1 === 0 ? c1 : v2 === 0 ? c2 : c3;
        THREAT3_YO[e] = 1;
        score += e === vetada ? 950 : 1_850;
      } else if (cYo === 2) {
        score += 140;
        if (v0 === 0) FORK2_YO[c0]++;
        if (v1 === 0) FORK2_YO[c1]++;
        if (v2 === 0) FORK2_YO[c2]++;
        if (v3 === 0) FORK2_YO[c3]++;
      } else {
        score += 18;
      }
    } else if (cRival > 0) {
      if (cRival === 3) {
        const e = v0 === 0 ? c0 : v1 === 0 ? c1 : v2 === 0 ? c2 : c3;
        THREAT3_RIVAL[e] = 1;
        score -= e === vetada ? 950 : 1_850;
      } else if (cRival === 2) {
        score -= 140;
        if (v0 === 0) FORK2_RIVAL[c0]++;
        if (v1 === 0) FORK2_RIVAL[c1]++;
        if (v2 === 0) FORK2_RIVAL[c2]++;
        if (v3 === 0) FORK2_RIVAL[c3]++;
      } else {
        score -= 18;
      }
    }
  }

  let n3Yo = 0;
  let n3Rival = 0;
  for (let i = 0; i < CELDAS; i++) {
    if (THREAT3_YO[i] === 1) n3Yo++;
    if (THREAT3_RIVAL[i] === 1) n3Rival++;
    if (FORK2_YO[i] >= 2) score += i === vetada ? 60 : 170;
    if (FORK2_RIVAL[i] >= 2) score -= i === vetada ? 60 : 170;
  }

  if (n3Yo >= 2) score += 6_000;
  if (n3Rival >= 2) score -= 6_000;

  return score;
}

function seleccionarTopCandidatas(
  board: Uint8Array,
  elegibles: number[],
  jugador: Player,
  limite: number,
): number[] {
  const evaluadas = elegibles.map((celda) => ({
    celda,
    score: puntuarCasilla1Ply(board, celda, jugador),
  }));
  evaluadas.sort((a, b) => b.score - a.score || a.celda - b.celda);
  return evaluadas.slice(0, Math.min(limite, evaluadas.length)).map((e) => e.celda);
}

function normalizarRegret(regret: Float64Array, prob: Float64Array, n: number): void {
  let suma = 0;
  for (let i = 0; i < n; i++) {
    const r = regret[i];
    if (r > 0) suma += r;
  }
  if (suma > 0) {
    const inv = 1 / suma;
    for (let i = 0; i < n; i++) {
      prob[i] = regret[i] > 0 ? regret[i] * inv : 0;
    }
  } else {
    const unif = 1 / n;
    for (let i = 0; i < n; i++) prob[i] = unif;
  }
}

function elegirDificilRegretMatching(
  state: WildCatsState,
  board: Uint8Array,
  elegibles: number[],
  vacias: number,
  yo: Player,
  rng: Rng,
): number {
  if (elegibles.length === 1) return elegibles[0];

  const rival: Player = yo === 1 ? 2 : 1;
  const candsYo = seleccionarTopCandidatas(board, elegibles, yo, MAX_CANDIDATAS_RM);
  const candsRival = seleccionarTopCandidatas(board, elegibles, rival, MAX_CANDIDATAS_RM);
  const nA = candsYo.length;
  const nB = candsRival.length;
  const esUltimaRonda = state.ronda >= MAX_RONDAS;
  const casiLlenoTrasColocar = vacias - 2 <= 1;

  for (let i = 0; i < nA; i++) {
    const a = candsYo[i];
    const rowOffset = i * nB;
    for (let j = 0; j < nB; j++) {
      const b = candsRival[j];
      if (a === b) {
        PAYOFF_MATRIX[rowOffset + j] = esUltimaRonda ? 0 : evaluarTablero(board, yo, a);
        continue;
      }

      board[a] = yo;
      board[b] = rival;
      const gYo = tieneLinea4En(board, a, yo);
      const gRival = tieneLinea4En(board, b, rival);

      let pago: number;
      if (gYo && !gRival) pago = WIN_SCORE;
      else if (gRival && !gYo) pago = -WIN_SCORE;
      else if (gYo && gRival) pago = 0;
      else if (casiLlenoTrasColocar || esUltimaRonda) pago = 0;
      else pago = evaluarTablero(board, yo, null);

      board[a] = 0;
      board[b] = 0;
      PAYOFF_MATRIX[rowOffset + j] = pago;
    }
  }

  REGRET_YO.fill(0, 0, nA);
  REGRET_RIVAL.fill(0, 0, nB);
  SUM_PROB_YO.fill(0, 0, nA);

  for (let t = 0; t < ITERACIONES_RM; t++) {
    normalizarRegret(REGRET_YO, PROB_YO, nA);
    normalizarRegret(REGRET_RIVAL, PROB_RIVAL, nB);

    let valYo = 0;
    for (let i = 0; i < nA; i++) {
      let u = 0;
      const rowOffset = i * nB;
      for (let j = 0; j < nB; j++) {
        u += PROB_RIVAL[j] * PAYOFF_MATRIX[rowOffset + j];
      }
      UTIL_YO[i] = u;
      valYo += PROB_YO[i] * u;
    }

    let valRival = 0;
    for (let j = 0; j < nB; j++) {
      let u = 0;
      for (let i = 0; i < nA; i++) {
        u -= PROB_YO[i] * PAYOFF_MATRIX[i * nB + j];
      }
      UTIL_RIVAL[j] = u;
      valRival += PROB_RIVAL[j] * u;
    }

    for (let i = 0; i < nA; i++) {
      const next = REGRET_YO[i] + UTIL_YO[i] - valYo;
      REGRET_YO[i] = next > 0 ? next : 0;
    }
    for (let j = 0; j < nB; j++) {
      const next = REGRET_RIVAL[j] + UTIL_RIVAL[j] - valRival;
      REGRET_RIVAL[j] = next > 0 ? next : 0;
    }

    if (t >= 5) {
      const peso = t - 4;
      for (let i = 0; i < nA; i++) {
        SUM_PROB_YO[i] += peso * PROB_YO[i];
      }
    }
  }

  let totalPeso = 0;
  for (let i = 0; i < nA; i++) totalPeso += SUM_PROB_YO[i];
  if (totalPeso <= 0) return candsYo[0];

  const objetivo = rng() * totalPeso;
  let acum = 0;
  for (let i = 0; i < nA; i++) {
    acum += SUM_PROB_YO[i];
    if (acum >= objetivo) return candsYo[i];
  }
  return candsYo[nA - 1];
}

/**
 * Elige la siguiente casilla del bot de Gatos Salvajes usando únicamente
 * información pública (`tablero`, `vetada`, `ronda`, `fase`, `currentPlayer`).
 */
export function elegirMovimiento(
  state: WildCatsState,
  dificultad: Dificultad,
  rng: Rng = Math.random,
): Move {
  const elegibles = celdasElegibles(state);
  if (elegibles.length === 0) return { celda: 0 };

  const vacias = cargarTablero(state.tablero);
  const board = BOARD_SCRATCH;
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;

  const ganadoras = elegibles.filter((c) => completaLineaEn(board, c, yo));

  if (dificultad === 'facil') {
    if (ganadoras.length > 0 && (elegibles.length === ganadoras.length || rng() < 0.35)) {
      return { celda: elegirAlAzar(ganadoras, rng) };
    }
    const pool =
      ganadoras.length > 0 ? elegibles.filter((c) => !ganadoras.includes(c)) : elegibles;
    return { celda: elegirAlAzar(pool, rng) };
  }

  if (dificultad === 'medio') {
    if (ganadoras.length > 0) {
      return { celda: elegirAlAzar(ganadoras, rng) };
    }
    const top = seleccionarTopCandidatas(board, elegibles, yo, 3);
    return { celda: elegirAlAzar(top, rng) };
  }

  return {
    celda: elegirDificilRegretMatching(state, board, elegibles, vacias, yo, rng),
  };
}
