import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, TOTAL, type KropkiState, type Player } from './engine';

const EMPTY = 0;
const TERR_1 = 1;
const TERR_2 = 2;
const LIVE_1 = 3;
const LIVE_2 = 4;
const CAP_1 = 5;
const CAP_2 = 6;

const CENTROS = [27, 28, 35, 36] as const;

const IS_BORDER = new Uint8Array(TOTAL);
const CENTER_SCORE = new Int8Array(TOTAL);
const VECINOS_4: Uint8Array[] = Array.from({ length: TOTAL }, () => new Uint8Array(0));
const VECINOS_8: Uint8Array[] = Array.from({ length: TOTAL }, () => new Uint8Array(0));
const VECINOS_CHEB2: Uint8Array[] = Array.from({ length: TOTAL }, () => new Uint8Array(0));

for (let f = 0; f < TAMANO; f++) {
  for (let c = 0; c < TAMANO; c++) {
    const i = f * TAMANO + c;
    IS_BORDER[i] = f === 0 || c === 0 || f === TAMANO - 1 || c === TAMANO - 1 ? 1 : 0;
    CENTER_SCORE[i] = Math.round(6 - (Math.abs(f - 3.5) + Math.abs(c - 3.5)));

    const v4: number[] = [];
    if (f > 0) v4.push(i - TAMANO);
    if (c > 0) v4.push(i - 1);
    if (c < TAMANO - 1) v4.push(i + 1);
    if (f < TAMANO - 1) v4.push(i + TAMANO);
    VECINOS_4[i] = Uint8Array.from(v4);

    const v8: number[] = [];
    for (let df = -1; df <= 1; df++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (df === 0 && dc === 0) continue;
        const ff = f + df;
        const cc = c + dc;
        if (ff >= 0 && ff < TAMANO && cc >= 0 && cc < TAMANO) {
          v8.push(ff * TAMANO + cc);
        }
      }
    }
    VECINOS_8[i] = Uint8Array.from(v8);

    const v2: number[] = [];
    for (let df = -2; df <= 2; df++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (df === 0 && dc === 0) continue;
        const ff = f + df;
        const cc = c + dc;
        if (ff >= 0 && ff < TAMANO && cc >= 0 && cc < TAMANO) {
          v2.push(ff * TAMANO + cc);
        }
      }
    }
    VECINOS_CHEB2[i] = Uint8Array.from(v2);
  }
}

// Buffers reutilizables para flood-fill ligero sin asignaciones en el árbol de búsqueda.
const VISTO = new Int32Array(TOTAL);
const CLOSED_MARK = new Int32Array(TOTAL);
let visitGen = 1;
let closedGen = 1;
const QUEUE = new Uint8Array(TOTAL);
const CAND_MARK = new Uint8Array(TOTAL);
const SCORE_SCRATCH = new Int32Array(TOTAL);

function cargarTablero(state: KropkiState): Uint8Array {
  const b = new Uint8Array(TOTAL);
  for (let i = 0; i < TOTAL; i++) {
    const p = state.board[i];
    if (p === null) {
      const t = state.territorio[i];
      b[i] = t === 1 ? TERR_1 : t === 2 ? TERR_2 : EMPTY;
    } else if (state.capturado[i]) {
      b[i] = p === 1 ? CAP_1 : CAP_2;
    } else {
      b[i] = p === 1 ? LIVE_1 : LIVE_2;
    }
  }
  return b;
}

/**
 * Simula o aplica una jugada en `idx` sobre `board` (Uint8Array(64)) mediante
 * BFS ligero con corte temprano al tocar el borde desde las vecinas ortogonales.
 * Devuelve `(capturas << 7) | territorioGanado`.
 */
function aplicarJugada(
  board: Uint8Array,
  idx: number,
  jugador: Player,
  mutar: boolean
): number {
  const ownWall = jugador === 1 ? LIVE_1 : LIVE_2;
  const rivalWall = jugador === 1 ? LIVE_2 : LIVE_1;
  const ownTerr = jugador === 1 ? TERR_1 : TERR_2;
  const rivalCap = jugador === 1 ? CAP_2 : CAP_1;

  // Sin >= 2 muros propios en vecindad 8 es imposible cerrar una zona nueva.
  const v8 = VECINOS_8[idx];
  let walls8 = 0;
  for (let k = 0; k < v8.length; k++) {
    if (board[v8[k]] === ownWall) {
      walls8++;
      if (walls8 === 2) break;
    }
  }
  if (walls8 < 2) {
    if (mutar) board[idx] = ownWall;
    return 0;
  }

  board[idx] = ownWall;

  if (++closedGen >= 2_000_000_000) {
    CLOSED_MARK.fill(0);
    closedGen = 1;
  }
  const cGen = closedGen;

  let capCount = 0;
  let terrCount = 0;

  const v4 = VECINOS_4[idx];
  for (let k = 0; k < v4.length; k++) {
    const inicio = v4[k];
    if (board[inicio] === ownWall || CLOSED_MARK[inicio] === cGen || IS_BORDER[inicio]) {
      continue;
    }

    if (++visitGen >= 2_000_000_000) {
      VISTO.fill(0);
      visitGen = 1;
    }
    const vGen = visitGen;

    VISTO[inicio] = vGen;
    QUEUE[0] = inicio;
    let head = 0;
    let tail = 1;
    let abierta = false;

    while (head < tail && !abierta) {
      const cur = QUEUE[head++];
      const nbs = VECINOS_4[cur];
      for (let j = 0; j < nbs.length; j++) {
        const nb = nbs[j];
        if (VISTO[nb] === vGen || board[nb] === ownWall) continue;
        if (IS_BORDER[nb]) {
          abierta = true;
          break;
        }
        VISTO[nb] = vGen;
        QUEUE[tail++] = nb;
      }
    }

    if (!abierta) {
      for (let z = 0; z < tail; z++) {
        const cell = QUEUE[z];
        CLOSED_MARK[cell] = cGen;
        const val = board[cell];
        if (val === rivalWall) {
          capCount++;
          if (mutar) board[cell] = rivalCap;
        } else if (val === EMPTY) {
          terrCount++;
          if (mutar) board[cell] = ownTerr;
        }
      }
    }
  }

  if (!mutar) board[idx] = EMPTY;
  return (capCount << 7) | terrCount;
}

function listarLegales(board: Uint8Array): number[] {
  const res: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === EMPTY) res.push(i);
  }
  return res;
}

function obtenerCandidatas(board: Uint8Array): number[] {
  let emptyCount = 0;
  CAND_MARK.fill(0);
  let hayVecinos = false;

  for (let i = 0; i < TOTAL; i++) {
    const v = board[i];
    if (v === EMPTY) {
      emptyCount++;
    } else if (v === LIVE_1 || v === LIVE_2) {
      const nbs = VECINOS_CHEB2[i];
      for (let k = 0; k < nbs.length; k++) {
        const nb = nbs[k];
        if (board[nb] === EMPTY) {
          CAND_MARK[nb] = 1;
          hayVecinos = true;
        }
      }
    }
  }

  if (emptyCount === 0) return [];
  if (emptyCount <= 12 || !hayVecinos) return listarLegales(board);

  const candidatas: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (CAND_MARK[i] === 1) candidatas.push(i);
  }
  return candidatas.length > 0 ? candidatas : listarLegales(board);
}

function puntuarTacticaLocal(
  board: Uint8Array,
  m: number,
  jugador: Player,
  conFlood: boolean
): number {
  const rival: Player = jugador === 1 ? 2 : 1;
  const ownWall = jugador === 1 ? LIVE_1 : LIVE_2;
  const rivalWall = jugador === 1 ? LIVE_2 : LIVE_1;

  let capPropia = 0;
  let terrPropio = 0;
  let capRival = 0;
  if (conFlood) {
    const simPropio = aplicarJugada(board, m, jugador, false);
    capPropia = simPropio >> 7;
    terrPropio = simPropio & 127;
    capRival = aplicarJugada(board, m, rival, false) >> 7;
  }

  let ownAdj4 = 0;
  let rivalAdj4 = 0;
  let emptyAdj4 = 0;
  let presion = 0;

  const v4 = VECINOS_4[m];
  for (let k = 0; k < v4.length; k++) {
    const nb = v4[k];
    const val = board[nb];
    if (val === ownWall) ownAdj4++;
    else if (val === rivalWall) {
      rivalAdj4++;
      if (!IS_BORDER[nb]) {
        const rn4 = VECINOS_4[nb];
        let rodeos = 0;
        for (let r = 0; r < rn4.length; r++) {
          if (board[rn4[r]] === ownWall) rodeos++;
        }
        if (rodeos >= 2) presion += rodeos * 15;
      }
    } else if (val === EMPTY) {
      emptyAdj4++;
    }
  }

  let ownAdj8 = 0;
  let rivalAdj8 = 0;
  const v8 = VECINOS_8[m];
  for (let k = 0; k < v8.length; k++) {
    const val = board[v8[k]];
    if (val === ownWall) ownAdj8++;
    else if (val === rivalWall) rivalAdj8++;
  }

  let score =
    capPropia * 2500 +
    capRival * 1800 +
    terrPropio * 18 +
    (ownAdj8 - ownAdj4) * 20 +
    ownAdj4 * 10 +
    rivalAdj4 * 14 +
    rivalAdj8 * 6 +
    presion +
    CENTER_SCORE[m] * 3;

  if (!IS_BORDER[m] && ownAdj8 === 0) {
    if (rivalAdj4 >= 3 && emptyAdj4 <= 1) score -= 450;
    else if (rivalAdj4 >= 2 && emptyAdj4 <= 1) score -= 140;
  }

  return score;
}

function evaluar(board: Uint8Array, s1: number, s2: number, turno: Player): number {
  const ownWall = turno === 1 ? LIVE_1 : LIVE_2;
  const rivalWall = turno === 1 ? LIVE_2 : LIVE_1;
  const ownTerr = turno === 1 ? TERR_1 : TERR_2;
  const rivalTerr = turno === 1 ? TERR_2 : TERR_1;

  const myScore = turno === 1 ? s1 : s2;
  const opScore = turno === 1 ? s2 : s1;
  let evalScore = (myScore - opScore) * 1000;

  let maxCapYo = 0;
  let countCapYo = 0;

  for (let i = 0; i < TOTAL; i++) {
    const v = board[i];
    if (v === EMPTY) {
      // Comprobar únicamente cierres inmediatos del jugador al turno (quien mueve ahora).
      let ownW = 0;
      const v8 = VECINOS_8[i];
      for (let k = 0; k < v8.length; k++) {
        if (board[v8[k]] === ownWall) {
          ownW++;
          if (ownW === 2) break;
        }
      }
      if (ownW >= 2) {
        const sim = aplicarJugada(board, i, turno, false);
        const cap = sim >> 7;
        const terr = sim & 127;
        if (cap > 0) {
          countCapYo++;
          if (cap > maxCapYo) maxCapYo = cap;
        }
        if (terr > 0) evalScore += Math.min(terr, 4) * 6;
      }
    } else if (v === ownTerr) {
      evalScore += 20;
    } else if (v === rivalTerr) {
      evalScore -= 20;
    } else if (v === ownWall) {
      evalScore += CENTER_SCORE[i] * 2;
      if (!IS_BORDER[i]) {
        let riv4 = 0;
        let emp4 = 0;
        const v4 = VECINOS_4[i];
        for (let k = 0; k < v4.length; k++) {
          const nv = board[v4[k]];
          if (nv === rivalWall) riv4++;
          else if (nv === EMPTY) emp4++;
        }
        if (riv4 === 3 && emp4 === 1) evalScore -= 140;
        else if (riv4 === 2 && emp4 <= 2) evalScore -= 30;

        let own8 = 0;
        const v8 = VECINOS_8[i];
        for (let k = 0; k < v8.length; k++) {
          if (board[v8[k]] === ownWall) own8++;
        }
        if (own8 >= 2) evalScore += 12;
        else if (own8 === 0) evalScore -= 10;
      }
    } else if (v === rivalWall) {
      evalScore -= CENTER_SCORE[i] * 2;
      if (!IS_BORDER[i]) {
        let own4 = 0;
        let emp4 = 0;
        const v4 = VECINOS_4[i];
        for (let k = 0; k < v4.length; k++) {
          const nv = board[v4[k]];
          if (nv === ownWall) own4++;
          else if (nv === EMPTY) emp4++;
        }
        if (own4 === 3 && emp4 === 1) evalScore += 140;
        else if (own4 === 2 && emp4 <= 2) evalScore += 30;

        let riv8 = 0;
        const v8 = VECINOS_8[i];
        for (let k = 0; k < v8.length; k++) {
          if (board[v8[k]] === rivalWall) riv8++;
        }
        if (riv8 >= 2) evalScore -= 12;
        else if (riv8 === 0) evalScore += 10;
      }
    }
  }

  if (maxCapYo > 0) {
    evalScore += maxCapYo * 650 + (countCapYo >= 2 ? 150 : 0);
  }

  return evalScore;
}

function seleccionarTop(
  board: Uint8Array,
  candidatas: number[],
  turno: Player,
  limite: number,
  conFlood: boolean
): number[] {
  const n = candidatas.length;
  for (let i = 0; i < n; i++) {
    const m = candidatas[i];
    SCORE_SCRATCH[m] = puntuarTacticaLocal(board, m, turno, conFlood);
  }
  const kMax = Math.min(limite, n);
  const top: number[] = new Array(kMax);
  for (let k = 0; k < kMax; k++) {
    let bestPos = k;
    let bestVal = SCORE_SCRATCH[candidatas[k]];
    for (let j = k + 1; j < n; j++) {
      const val = SCORE_SCRATCH[candidatas[j]];
      if (val > bestVal) {
        bestVal = val;
        bestPos = j;
      }
    }
    const chosen = candidatas[bestPos];
    candidatas[bestPos] = candidatas[k];
    top[k] = chosen;
  }
  return top;
}

function negamax(
  board: Uint8Array,
  s1: number,
  s2: number,
  profundidad: number,
  alpha: number,
  beta: number,
  turno: Player
): number {
  const candidatas = obtenerCandidatas(board);
  if (candidatas.length === 0) {
    const diff = turno === 1 ? s1 - s2 : s2 - s1;
    if (diff > 0) return 100_000 + diff * 1000;
    if (diff < 0) return -100_000 + diff * 1000;
    return 0;
  }

  if (profundidad === 0) {
    return evaluar(board, s1, s2, turno);
  }

  const limite = profundidad >= 2 ? 6 : 5;
  const jugadas = seleccionarTop(board, candidatas, turno, limite, true);
  const rival: Player = turno === 1 ? 2 : 1;

  let mejor = -Infinity;
  for (let i = 0; i < jugadas.length; i++) {
    const m = jugadas[i];
    const copia = board.slice();
    const res = aplicarJugada(copia, m, turno, true);
    const cap = res >> 7;
    const ns1 = turno === 1 ? s1 + cap : s1;
    const ns2 = turno === 2 ? s2 + cap : s2;
    const valor = -negamax(copia, ns1, ns2, profundidad - 1, -beta, -alpha, rival);
    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }
  return mejor;
}

function elegirFacil(board: Uint8Array, yo: Player, rng: Rng): number {
  const legales = listarLegales(board);
  if (legales.length === 0) return 0;

  const capturas: number[] = [];
  for (let i = 0; i < legales.length; i++) {
    const m = legales[i];
    if ((aplicarJugada(board, m, yo, false) >> 7) > 0) {
      capturas.push(m);
    }
  }

  if (capturas.length > 0) {
    if (capturas.length === legales.length || rng() < 0.45) {
      return elegirAlAzar(capturas, rng);
    }
    const capSet = new Set(capturas);
    const otras = legales.filter(m => !capSet.has(m));
    return elegirAlAzar(otras, rng);
  }

  return elegirAlAzar(legales, rng);
}

function elegirMedio(board: Uint8Array, yo: Player, rng: Rng): number {
  const legales = listarLegales(board);
  if (legales.length === 0) return 0;
  if (legales.length === TOTAL) return elegirAlAzar(CENTROS, rng);

  // 1. Captura inmediata en 1 turno (priorizando la mayor captura).
  let maxCap = 0;
  let mejoresCap: number[] = [];
  for (let i = 0; i < legales.length; i++) {
    const m = legales[i];
    const cap = aplicarJugada(board, m, yo, false) >> 7;
    if (cap > maxCap) {
      maxCap = cap;
      mejoresCap = [m];
    } else if (cap > 0 && cap === maxCap) {
      mejoresCap.push(m);
    }
  }
  if (mejoresCap.length > 0) return elegirAlAzar(mejoresCap, rng);

  // 2. Escape / bloqueo si el rival puede capturar en 1 turno.
  const rival: Player = yo === 1 ? 2 : 1;
  let maxAmenaza = 0;
  let bloqueos: number[] = [];
  for (let i = 0; i < legales.length; i++) {
    const m = legales[i];
    const amenaza = aplicarJugada(board, m, rival, false) >> 7;
    if (amenaza > maxAmenaza) {
      maxAmenaza = amenaza;
      bloqueos = [m];
    } else if (amenaza > 0 && amenaza === maxAmenaza) {
      bloqueos.push(m);
    }
  }
  if (bloqueos.length > 0) return elegirAlAzar(bloqueos, rng);

  // 3. Top 3-4 candidatas por cercanía y táctica local.
  const candidatas = obtenerCandidatas(board);
  const top = seleccionarTop(board, candidatas, yo, Math.min(3, candidatas.length), false);
  return elegirAlAzar(top, rng);
}

function elegirDificil(state: KropkiState, board: Uint8Array, rng: Rng): number {
  const legales = listarLegales(board);
  if (legales.length === 0) return 0;
  if (legales.length === 1) return legales[0];
  if (legales.length === TOTAL) return elegirAlAzar(CENTROS, rng);

  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const candidatas = obtenerCandidatas(board);
  const top = seleccionarTop(board, candidatas, yo, Math.min(9, candidatas.length), true);

  const profundidadRestante = legales.length <= 10 ? 3 : 2;
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < top.length; i++) {
    const m = top[i];
    const copia = board.slice();
    const res = aplicarJugada(copia, m, yo, true);
    const cap = res >> 7;
    const ns1 = yo === 1 ? state.scores[1] + cap : state.scores[1];
    const ns2 = yo === 2 ? state.scores[2] + cap : state.scores[2];
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(copia, ns1, ns2, profundidadRestante, -Infinity, beta, rival);
    if (valor > mejor) {
      mejor = valor;
      mejores = [m];
    } else if (valor === mejor) {
      mejores.push(m);
    }
  }

  return elegirAlAzar(mejores, rng);
}

/**
 * Elige la siguiente intersección del bot de Kropki según la dificultad indicada.
 */
export function elegirMovimiento(
  state: KropkiState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const board = cargarTablero(state);
  if (dificultad === 'facil') return elegirFacil(board, state.currentPlayer, rng);
  if (dificultad === 'medio') return elegirMedio(board, state.currentPlayer, rng);
  return elegirDificil(state, board, rng);
}
