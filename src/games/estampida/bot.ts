import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  TAMANO,
  celdasQueCopian,
  contar,
  playMove,
  type Cell,
  type Direccion,
  type EstampidaState,
  type Move,
  type Player,
} from './engine';

const TOTAL = TAMANO * TAMANO;
const DIRECCIONES: readonly Direccion[] = ['arriba', 'abajo', 'izquierda', 'derecha'];

const MASK_NOT_COL7 = 0x7f7f7f7f | 0;
const MASK_NOT_COL0 = 0xfefefefe | 0;

// Pesos de interioridad para cada casilla (1 en borde, 4 en centro).
const INTERIOR_WEIGHT = new Int8Array(TOTAL);
const DIST_BORDE = new Int8Array(TOTAL);
for (let i = 0; i < TOTAL; i++) {
  const f = i >> 3;
  const c = i & 7;
  const db = Math.min(f, 7 - f, c, 7 - c);
  DIST_BORDE[i] = db;
  INTERIOR_WEIGHT[i] = 1 + db;
}

// Buffers preasignados para BFS Voronoi en setup (cero asignaciones en bucle caliente).
const DIST_YO = new Int8Array(TOTAL);
const DIST_RIVAL = new Int8Array(TOTAL);
const BFS_QUEUE = new Uint8Array(TOTAL);

// Pilas preasignadas por profundidad para generación de movimientos sin GC en alfa-beta.
const MAX_PLY = 24;
const STACK_DIRS = Array.from({ length: MAX_PLY }, () => new Int8Array(4));
const STACK_CLO = Array.from({ length: MAX_PLY }, () => new Int32Array(4));
const STACK_CHI = Array.from({ length: MAX_PLY }, () => new Int32Array(4));
const STACK_PRI = Array.from({ length: MAX_PLY }, () => new Int32Array(4));

// Tabla de transposición fija para la búsqueda en bitboards (32 768 entradas).
const TT_SIZE = 1 << 15;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const ttGen = new Uint8Array(TT_SIZE);
const ttP1Lo = new Int32Array(TT_SIZE);
const ttP1Hi = new Int32Array(TT_SIZE);
const ttP2Lo = new Int32Array(TT_SIZE);
const ttP2Hi = new Int32Array(TT_SIZE);
const ttTurno = new Uint8Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttVal = new Int32Array(TT_SIZE);
const ttBestDir = new Int8Array(TT_SIZE);

let currentGen = 0;
const MAX_NODES = 22_000;
let nodesEvaluated = 0;
let searchAborted = false;

const WIN_BASE = 100_000;

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function celdasVacias(board: readonly Cell[]): number[] {
  const vacias: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === null) vacias.push(i);
  }
  return vacias;
}

function direccionesLegales(board: Cell[], player: Player): Direccion[] {
  const legales: Direccion[] = [];
  for (let i = 0; i < 4; i++) {
    const dir = DIRECCIONES[i];
    if (celdasQueCopian(board, player, dir).length > 0) {
      legales.push(dir);
    }
  }
  return legales;
}

function elegirSetupMedio(state: EstampidaState, rng: Rng): Move {
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const propias: number[] = [];
  const rivales: number[] = [];
  const vacias: number[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const v = state.board[i];
    if (v === yo) propias.push(i);
    else if (v === rival) rivales.push(i);
    else vacias.push(i);
  }

  if (vacias.length === 0) return { tipo: 'colocar', celda: 0 };

  const evaluadas: { cel: number; s: number }[] = new Array(vacias.length);

  for (let idxV = 0; idxV < vacias.length; idxV++) {
    const cel = vacias[idxV];
    const f = cel >> 3;
    const c = cel & 7;
    const db = DIST_BORDE[cel];

    let s = 0;
    if (db === 0) {
      s -= (f === 0 || f === 7) && (c === 0 || c === 7) ? 45 : 30;
    } else if (db === 1) {
      s += 12;
    } else {
      s += 20;
    }

    if (propias.length > 0) {
      let minDistOwn = 99;
      for (let k = 0; k < propias.length; k++) {
        const p = propias[k];
        const fp = p >> 3;
        const cp = p & 7;
        const md = Math.abs(f - fp) + Math.abs(c - cp);
        if (md < minDistOwn) minDistOwn = md;
        if (f === fp || c === cp) s -= 4;
      }
      if (minDistOwn === 1) s -= 30;
      else if (minDistOwn === 2) s -= 4;
      else s += Math.min(minDistOwn, 4) * 5;
    }

    if (rivales.length > 0) {
      let minDistRiv = 99;
      for (let k = 0; k < rivales.length; k++) {
        const p = rivales[k];
        const md = Math.abs(f - (p >> 3)) + Math.abs(c - (p & 7));
        if (md < minDistRiv) minDistRiv = md;
      }
      if (minDistRiv === 1) s -= 8;
      else s += Math.min(minDistRiv, 3) * 2;
    }

    evaluadas[idxV] = { cel, s };
  }

  evaluadas.sort((a, b) => b.s - a.s);
  const mejorS = evaluadas[0].s;
  const top: number[] = [];
  const limite = Math.min(6, evaluadas.length);
  for (let i = 0; i < limite; i++) {
    if (evaluadas[i].s >= mejorS - 6) top.push(evaluadas[i].cel);
  }

  return { tipo: 'colocar', celda: elegirAlAzar(top, rng) };
}

function bfsDistancias(
  board: readonly Cell[],
  bloqueador: Player,
  fuentes: number[],
  extraFuente: number,
  outDist: Int8Array,
): void {
  outDist.fill(127);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < fuentes.length; i++) {
    const f = fuentes[i];
    outDist[f] = 0;
    BFS_QUEUE[tail++] = f;
  }
  if (extraFuente >= 0) {
    outDist[extraFuente] = 0;
    BFS_QUEUE[tail++] = extraFuente;
  }

  while (head < tail) {
    const cur = BFS_QUEUE[head++];
    const nextD = outDist[cur] + 1;
    const f = cur >> 3;
    const c = cur & 7;

    if (f > 0) {
      const n = cur - 8;
      if (outDist[n] === 127 && board[n] !== bloqueador && n !== extraFuente) {
        outDist[n] = nextD;
        BFS_QUEUE[tail++] = n;
      }
    }
    if (f < 7) {
      const n = cur + 8;
      if (outDist[n] === 127 && board[n] !== bloqueador && n !== extraFuente) {
        outDist[n] = nextD;
        BFS_QUEUE[tail++] = n;
      }
    }
    if (c > 0) {
      const n = cur - 1;
      if (outDist[n] === 127 && board[n] !== bloqueador && n !== extraFuente) {
        outDist[n] = nextD;
        BFS_QUEUE[tail++] = n;
      }
    }
    if (c < 7) {
      const n = cur + 1;
      if (outDist[n] === 127 && board[n] !== bloqueador && n !== extraFuente) {
        outDist[n] = nextD;
        BFS_QUEUE[tail++] = n;
      }
    }
  }
}

function elegirSetupDificil(state: EstampidaState, rng: Rng): Move {
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const propias: number[] = [];
  const rivales: number[] = [];
  const vacias: number[] = [];

  for (let i = 0; i < TOTAL; i++) {
    const v = state.board[i];
    if (v === yo) propias.push(i);
    else if (v === rival) rivales.push(i);
    else vacias.push(i);
  }

  if (vacias.length === 0) return { tipo: 'colocar', celda: 0 };

  let mejorScore = -Infinity;
  let mejores: number[] = [];

  for (let idxV = 0; idxV < vacias.length; idxV++) {
    const cel = vacias[idxV];
    const f = cel >> 3;
    const c = cel & 7;

    bfsDistancias(state.board, rival, propias, cel, DIST_YO);
    if (rivales.length > 0) {
      DIST_RIVAL.fill(127);
      let head = 0;
      let tail = 0;
      for (let i = 0; i < rivales.length; i++) {
        const rv = rivales[i];
        DIST_RIVAL[rv] = 0;
        BFS_QUEUE[tail++] = rv;
      }
      while (head < tail) {
        const cur = BFS_QUEUE[head++];
        const nextD = DIST_RIVAL[cur] + 1;
        const rf = cur >> 3;
        const rc = cur & 7;
        if (rf > 0) {
          const n = cur - 8;
          if (DIST_RIVAL[n] === 127 && state.board[n] !== yo && n !== cel) {
            DIST_RIVAL[n] = nextD;
            BFS_QUEUE[tail++] = n;
          }
        }
        if (rf < 7) {
          const n = cur + 8;
          if (DIST_RIVAL[n] === 127 && state.board[n] !== yo && n !== cel) {
            DIST_RIVAL[n] = nextD;
            BFS_QUEUE[tail++] = n;
          }
        }
        if (rc > 0) {
          const n = cur - 1;
          if (DIST_RIVAL[n] === 127 && state.board[n] !== yo && n !== cel) {
            DIST_RIVAL[n] = nextD;
            BFS_QUEUE[tail++] = n;
          }
        }
        if (rc < 7) {
          const n = cur + 1;
          if (DIST_RIVAL[n] === 127 && state.board[n] !== yo && n !== cel) {
            DIST_RIVAL[n] = nextD;
            BFS_QUEUE[tail++] = n;
          }
        }
      }
    }

    let vorScore = 0;
    if (rivales.length > 0) {
      for (let x = 0; x < TOTAL; x++) {
        if (state.board[x] !== null || x === cel) continue;
        const dy = DIST_YO[x];
        const dr = DIST_RIVAL[x];
        const w = 10 + INTERIOR_WEIGHT[x] * 2;
        if (dy < dr) {
          vorScore += w + Math.max(0, 8 - dy);
          if (dr === 127) vorScore += 6;
        } else if (dr < dy) {
          vorScore -= w + Math.max(0, 8 - dr);
          if (dy === 127) vorScore -= 6;
        } else if (dy < 127) {
          vorScore += 2;
        }
      }
    } else {
      for (let x = 0; x < TOTAL; x++) {
        if (state.board[x] !== null || x === cel) continue;
        const dy = DIST_YO[x];
        if (dy < 127) {
          vorScore += Math.max(0, 10 - dy) * (4 + INTERIOR_WEIGHT[x]);
        }
      }
    }

    const db = DIST_BORDE[cel];
    let structScore = 0;
    if (db === 0) {
      structScore -= (f === 0 || f === 7) && (c === 0 || c === 7) ? 160 : 120;
    } else if (db === 1) {
      structScore += 16;
    } else if (db === 2) {
      structScore += 34;
    } else {
      structScore += 40;
    }

    let libresAdj = 0;
    if (f > 0 && state.board[cel - 8] === null) libresAdj++;
    if (f < 7 && state.board[cel + 8] === null) libresAdj++;
    if (c > 0 && state.board[cel - 1] === null) libresAdj++;
    if (c < 7 && state.board[cel + 1] === null) libresAdj++;
    structScore += libresAdj * 10;

    for (let k = 0; k < propias.length; k++) {
      const p = propias[k];
      const fp = p >> 3;
      const cp = p & 7;
      const md = Math.abs(f - fp) + Math.abs(c - cp);
      if (md === 1) structScore -= 90;
      else if (md === 2) structScore -= 20;
      if (f === fp || c === cp) structScore -= 10;
    }

    // No pegarse innecesariamente al rival perdiendo una dirección propia.
    for (let k = 0; k < rivales.length; k++) {
      const p = rivales[k];
      const md = Math.abs(f - (p >> 3)) + Math.abs(c - (p & 7));
      if (md === 1) structScore -= 18;
    }

    const total = vorScore + structScore;
    if (total > mejorScore) {
      mejorScore = total;
      mejores = [cel];
    } else if (total === mejorScore) {
      mejores.push(cel);
    }
  }

  return { tipo: 'colocar', celda: elegirAlAzar(mejores, rng) };
}

function elegirPlayingMedio(state: EstampidaState, rng: Rng): Move {
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const legales = direccionesLegales(state.board, yo);
  if (legales.length === 0) return { tipo: 'estampida', dir: 'arriba' };
  if (legales.length === 1) return { tipo: 'estampida', dir: legales[0] };

  const cnt0 = contar(state.board)[yo];
  const evaluadas: { dir: Direccion; score: number }[] = new Array(legales.length);

  for (let i = 0; i < legales.length; i++) {
    const dir = legales[i];
    const s1 = playMove(state, { tipo: 'estampida', dir });
    let score = 0;

    if (s1.fase === 'finished') {
      const c1 = contar(s1.board);
      const diff = c1[yo] - c1[rival];
      score = diff > 0 ? 10_000 + diff * 100 : diff < 0 ? -10_000 + diff * 100 : 0;
    } else if (s1.currentPlayer === yo) {
      // El rival quedó sin jugadas y se le saltó el turno.
      const gain1 = contar(s1.board)[yo] - cnt0;
      score = gain1 * 10 + 80;
    } else {
      const gain1 = contar(s1.board)[yo] - cnt0;
      score = gain1 * 10;
      // Evitar perder el turno inmediatamente si existe alternativa.
      const legRival = direccionesLegales(s1.board, rival);
      let rivalSalta = false;
      for (let j = 0; j < legRival.length; j++) {
        const s2 = playMove(s1, { tipo: 'estampida', dir: legRival[j] });
        if (s2.fase === 'playing' && s2.currentPlayer === rival) {
          rivalSalta = true;
          break;
        }
      }
      if (rivalSalta) score -= 25;
    }

    evaluadas[i] = { dir, score };
  }

  evaluadas.sort((a, b) => b.score - a.score);
  const mejorScore = evaluadas[0].score;
  // Si hay una ganancia claramente superior (> 10 pts, es decir > 1 ficha de ventaja), la toma siempre;
  // en empates o márgenes mínimos de 1 ficha elige al azar entre ellas.
  const candidatas = evaluadas.filter(e => e.score >= mejorScore - 10).map(e => e.dir);
  return { tipo: 'estampida', dir: elegirAlAzar(candidatas, rng) };
}

// --- Motor bitboard de alta velocidad para Difícil en fase 'playing' ---

let tmpLo = 0;
let tmpHi = 0;

function copiarBitboard(
  pLo: number,
  pHi: number,
  eLo: number,
  eHi: number,
  dirIdx: number,
): void {
  if (dirIdx === 0) {
    tmpLo = ((pLo >>> 8) | ((pHi & 0xff) << 24)) & eLo;
    tmpHi = (pHi >>> 8) & eHi;
  } else if (dirIdx === 1) {
    tmpLo = (pLo << 8) & eLo;
    tmpHi = ((pHi << 8) | (pLo >>> 24)) & eHi;
  } else if (dirIdx === 2) {
    tmpLo = ((pLo & MASK_NOT_COL0) >>> 1) & eLo;
    tmpHi = ((pHi & MASK_NOT_COL0) >>> 1) & eHi;
  } else {
    tmpLo = ((pLo & MASK_NOT_COL7) << 1) & eLo;
    tmpHi = ((pHi & MASK_NOT_COL7) << 1) & eHi;
  }
}

function expandir4Dir(
  pLo: number,
  pHi: number,
  eLo: number,
  eHi: number,
): void {
  tmpLo =
    (((pLo >>> 8) | ((pHi & 0xff) << 24)) |
      (pLo << 8) |
      ((pLo & MASK_NOT_COL0) >>> 1) |
      ((pLo & MASK_NOT_COL7) << 1)) &
    eLo;
  tmpHi =
    ((pHi >>> 8) |
      ((pHi << 8) | (pLo >>> 24)) |
      ((pHi & MASK_NOT_COL0) >>> 1) |
      ((pHi & MASK_NOT_COL7) << 1)) &
    eHi;
}

function hayMovBitboard(pLo: number, pHi: number, eLo: number, eHi: number): boolean {
  expandir4Dir(pLo, pHi, eLo, eHi);
  return (tmpLo | tmpHi) !== 0;
}

function contarDirsYMax(
  pLo: number,
  pHi: number,
  eLo: number,
  eHi: number,
): number {
  let dirs = 0;
  let maxG = 0;
  for (let d = 0; d < 4; d++) {
    copiarBitboard(pLo, pHi, eLo, eHi, d);
    if ((tmpLo | tmpHi) !== 0) {
      dirs++;
      const g = popcount32(tmpLo) + popcount32(tmpHi);
      if (g > maxG) maxG = g;
    }
  }
  return (dirs << 8) | maxG;
}

function evaluarHojaBitboard(
  p1Lo: number,
  p1Hi: number,
  p2Lo: number,
  p2Hi: number,
  turno: Player,
): number {
  const myLo = turno === 1 ? p1Lo : p2Lo;
  const myHi = turno === 1 ? p1Hi : p2Hi;
  const oppLo = turno === 1 ? p2Lo : p1Lo;
  const oppHi = turno === 1 ? p2Hi : p1Hi;

  const myCount = popcount32(myLo) + popcount32(myHi);
  const oppCount = popcount32(oppLo) + popcount32(oppHi);

  let remLo = ~(myLo | oppLo);
  let remHi = ~(myHi | oppHi);

  const myInfo = contarDirsYMax(myLo, myHi, remLo, remHi);
  const oppInfo = contarDirsYMax(oppLo, oppHi, remLo, remHi);
  const myDirs = myInfo >> 8;
  const maxMyGain = myInfo & 0xff;
  const oppDirs = oppInfo >> 8;
  const maxOppGain = oppInfo & 0xff;

  let mFrontLo = myLo;
  let mFrontHi = myHi;
  let oFrontLo = oppLo;
  let oFrontHi = oppHi;
  let myVor = 0;
  let oppVor = 0;

  for (let step = 0; step < 5; step++) {
    if ((remLo | remHi) === 0) break;
    expandir4Dir(mFrontLo, mFrontHi, remLo, remHi);
    const nmLo = tmpLo;
    const nmHi = tmpHi;

    expandir4Dir(oFrontLo, oFrontHi, remLo, remHi);
    const noLo = tmpLo;
    const noHi = tmpHi;

    if ((nmLo | nmHi | noLo | noHi) === 0) break;

    const bothLo = nmLo & noLo;
    const bothHi = nmHi & noHi;
    const onlyMyLo = nmLo & ~noLo;
    const onlyMyHi = nmHi & ~noHi;
    const onlyOppLo = noLo & ~nmLo;
    const onlyOppHi = noHi & ~nmHi;

    const w = step === 0 ? 10 : step === 1 ? 8 : 7;
    myVor += (popcount32(onlyMyLo) + popcount32(onlyMyHi)) * w;
    oppVor += (popcount32(onlyOppLo) + popcount32(onlyOppHi)) * w;

    remLo &= ~(nmLo | noLo);
    remHi &= ~(nmHi | noHi);
    mFrontLo = onlyMyLo | bothLo;
    mFrontHi = onlyMyHi | bothHi;
    oFrontLo = onlyOppLo | bothLo;
    oFrontHi = onlyOppHi | bothHi;
    if ((mFrontLo | mFrontHi | oFrontLo | oFrontHi) === 0) break;
  }

  return (
    (myCount - oppCount) * 100 +
    (myVor - oppVor) * 9 +
    (myDirs - oppDirs) * 18 +
    (maxMyGain - maxOppGain) * 8 +
    15
  );
}

function hashBitboard(
  p1Lo: number,
  p1Hi: number,
  p2Lo: number,
  p2Hi: number,
  turno: Player,
): number {
  let h = Math.imul(p1Lo ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ p1Hi, 0xc2b2ae35);
  h = Math.imul(h ^ p2Lo, 0x27d4eb2f);
  h = Math.imul(h ^ p2Hi, 0x165667b1);
  h ^= turno;
  h ^= h >>> 15;
  return h & TT_MASK;
}

function negamaxBitboard(
  p1Lo: number,
  p1Hi: number,
  p2Lo: number,
  p2Hi: number,
  turno: Player,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
): number {
  if (++nodesEvaluated >= MAX_NODES) {
    searchAborted = true;
    return 0;
  }

  const alphaOrig = alpha;
  const slot = hashBitboard(p1Lo, p1Hi, p2Lo, p2Hi, turno);
  let ttMove = -1;

  if (
    ttGen[slot] === currentGen &&
    ttP1Lo[slot] === p1Lo &&
    ttP1Hi[slot] === p1Hi &&
    ttP2Lo[slot] === p2Lo &&
    ttP2Hi[slot] === p2Hi &&
    ttTurno[slot] === turno
  ) {
    ttMove = ttBestDir[slot];
    if (ttDepth[slot] >= depth) {
      const flag = ttFlag[slot];
      const val = ttVal[slot];
      if (flag === TT_EXACT) return val;
      if (flag === TT_LOWER && val > alpha) alpha = val;
      else if (flag === TT_UPPER && val < beta) beta = val;
      if (alpha >= beta) return val;
    }
  }

  const occLo = p1Lo | p2Lo;
  const occHi = p1Hi | p2Hi;
  if (occLo === -1 && occHi === -1) {
    const c1 = popcount32(p1Lo) + popcount32(p1Hi);
    const c2 = 64 - c1;
    const diff = turno === 1 ? c1 - c2 : c2 - c1;
    if (diff > 0) return WIN_BASE + diff * 100 + depth;
    if (diff < 0) return -WIN_BASE + diff * 100 - depth;
    return 0;
  }

  if (depth <= 0 || ply >= MAX_PLY) {
    return evaluarHojaBitboard(p1Lo, p1Hi, p2Lo, p2Hi, turno);
  }

  const eLo = ~occLo;
  const eHi = ~occHi;
  const myLo = turno === 1 ? p1Lo : p2Lo;
  const myHi = turno === 1 ? p1Hi : p2Hi;
  const rival: Player = turno === 1 ? 2 : 1;
  const oppLo = rival === 1 ? p1Lo : p2Lo;
  const oppHi = rival === 1 ? p1Hi : p2Hi;

  const sDirs = STACK_DIRS[ply];
  const sCLo = STACK_CLO[ply];
  const sCHi = STACK_CHI[ply];
  const sPri = STACK_PRI[ply];
  let n = 0;

  for (let d = 0; d < 4; d++) {
    copiarBitboard(myLo, myHi, eLo, eHi, d);
    if ((tmpLo | tmpHi) !== 0) {
      sDirs[n] = d;
      sCLo[n] = tmpLo;
      sCHi[n] = tmpHi;
      const gain = popcount32(tmpLo) + popcount32(tmpHi);
      sPri[n] = (d === ttMove ? 1000 : 0) + gain;
      n++;
    }
  }

  if (n === 0) {
    if (hayMovBitboard(oppLo, oppHi, eLo, eHi)) {
      return -negamaxBitboard(p1Lo, p1Hi, p2Lo, p2Hi, rival, depth - 1, -beta, -alpha, ply + 1);
    }
    const c1 = popcount32(p1Lo) + popcount32(p1Hi);
    const c2 = popcount32(p2Lo) + popcount32(p2Hi);
    const diff = turno === 1 ? c1 - c2 : c2 - c1;
    if (diff > 0) return WIN_BASE + diff * 100 + depth;
    if (diff < 0) return -WIN_BASE + diff * 100 - depth;
    return 0;
  }

  for (let i = 0; i < n - 1; i++) {
    let bestI = i;
    for (let j = i + 1; j < n; j++) {
      if (sPri[j] > sPri[bestI]) bestI = j;
    }
    if (bestI !== i) {
      const td = sDirs[i]; sDirs[i] = sDirs[bestI]; sDirs[bestI] = td;
      const tl = sCLo[i]; sCLo[i] = sCLo[bestI]; sCLo[bestI] = tl;
      const th = sCHi[i]; sCHi[i] = sCHi[bestI]; sCHi[bestI] = th;
      const tp = sPri[i]; sPri[i] = sPri[bestI]; sPri[bestI] = tp;
    }
  }

  let bestVal = -Infinity;
  let bestDir = sDirs[0];

  for (let i = 0; i < n; i++) {
    const d = sDirs[i];
    const nMyLo = myLo | sCLo[i];
    const nMyHi = myHi | sCHi[i];
    const np1Lo = turno === 1 ? nMyLo : p1Lo;
    const np1Hi = turno === 1 ? nMyHi : p1Hi;
    const np2Lo = turno === 2 ? nMyLo : p2Lo;
    const np2Hi = turno === 2 ? nMyHi : p2Hi;

    const nOccLo = np1Lo | np2Lo;
    const nOccHi = np1Hi | np2Hi;
    let val: number;

    if (nOccLo === -1 && nOccHi === -1) {
      const c1 = popcount32(np1Lo) + popcount32(np1Hi);
      const c2 = 64 - c1;
      const diff = turno === 1 ? c1 - c2 : c2 - c1;
      val = diff > 0 ? WIN_BASE + diff * 100 + (depth - 1) : diff < 0 ? -WIN_BASE + diff * 100 - (depth - 1) : 0;
    } else {
      const neLo = ~nOccLo;
      const neHi = ~nOccHi;
      if (hayMovBitboard(oppLo, oppHi, neLo, neHi)) {
        val = -negamaxBitboard(np1Lo, np1Hi, np2Lo, np2Hi, rival, depth - 1, -beta, -alpha, ply + 1);
      } else if (hayMovBitboard(nMyLo, nMyHi, neLo, neHi)) {
        // Salto de turno: el rival no puede mover y `turno` repite!
        val = negamaxBitboard(np1Lo, np1Hi, np2Lo, np2Hi, turno, depth - 1, alpha, beta, ply + 1);
      } else {
        const c1 = popcount32(np1Lo) + popcount32(np1Hi);
        const c2 = popcount32(np2Lo) + popcount32(np2Hi);
        const diff = turno === 1 ? c1 - c2 : c2 - c1;
        val = diff > 0 ? WIN_BASE + diff * 100 + (depth - 1) : diff < 0 ? -WIN_BASE + diff * 100 - (depth - 1) : 0;
      }
    }

    if (searchAborted) return 0;

    if (val > bestVal) {
      bestVal = val;
      bestDir = d;
    }
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }

  if (ttGen[slot] !== currentGen || ttDepth[slot] <= depth) {
    ttGen[slot] = currentGen;
    ttP1Lo[slot] = p1Lo;
    ttP1Hi[slot] = p1Hi;
    ttP2Lo[slot] = p2Lo;
    ttP2Hi[slot] = p2Hi;
    ttTurno[slot] = turno;
    ttDepth[slot] = depth;
    ttVal[slot] = bestVal;
    ttBestDir[slot] = bestDir;
    ttFlag[slot] = bestVal <= alphaOrig ? TT_UPPER : bestVal >= beta ? TT_LOWER : TT_EXACT;
  }

  return bestVal;
}

function boardABitboards(board: readonly Cell[]): [number, number, number, number] {
  let p1Lo = 0;
  let p1Hi = 0;
  let p2Lo = 0;
  let p2Hi = 0;
  for (let i = 0; i < 32; i++) {
    const v = board[i];
    if (v === 1) p1Lo |= 1 << i;
    else if (v === 2) p2Lo |= 1 << i;
  }
  for (let i = 32; i < 64; i++) {
    const v = board[i];
    if (v === 1) p1Hi |= 1 << (i - 32);
    else if (v === 2) p2Hi |= 1 << (i - 32);
  }
  return [p1Lo, p1Hi, p2Lo, p2Hi];
}

function elegirPlayingDificil(state: EstampidaState, rng: Rng): Move {
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const [p1Lo, p1Hi, p2Lo, p2Hi] = boardABitboards(state.board);

  const occLo = p1Lo | p2Lo;
  const occHi = p1Hi | p2Hi;
  const eLo = ~occLo;
  const eHi = ~occHi;
  const myLo = yo === 1 ? p1Lo : p2Lo;
  const myHi = yo === 1 ? p1Hi : p2Hi;
  const oppLo = rival === 1 ? p1Lo : p2Lo;
  const oppHi = rival === 1 ? p1Hi : p2Hi;

  const legales: number[] = [];
  const copyLos: number[] = [];
  const copyHis: number[] = [];

  for (let d = 0; d < 4; d++) {
    copiarBitboard(myLo, myHi, eLo, eHi, d);
    if ((tmpLo | tmpHi) !== 0) {
      legales.push(d);
      copyLos.push(tmpLo);
      copyHis.push(tmpHi);
    }
  }

  if (legales.length === 0) return { tipo: 'estampida', dir: 'arriba' };
  if (legales.length === 1) return { tipo: 'estampida', dir: DIRECCIONES[legales[0]] };

  currentGen++;
  if (currentGen >= 255) {
    ttGen.fill(0);
    currentGen = 1;
  }
  nodesEvaluated = 0;
  searchAborted = false;

  const emptyCount = 64 - popcount32(occLo) - popcount32(occHi);
  const maxDepth = emptyCount <= 16 ? emptyCount : 10;

  let mejoresDirs: number[] = [legales[0]];
  let mejorPrevDir = legales[0];

  const profundidades = maxDepth <= 4 ? [maxDepth] : [4, 6, 8, ...(maxDepth > 8 ? [maxDepth] : [])];

  for (let pIdx = 0; pIdx < profundidades.length; pIdx++) {
    const depth = profundidades[pIdx];
    let iterBestVal = -Infinity;
    const iterBestDirs: number[] = [];
    searchAborted = false;

    const orden = [...legales.keys()].sort((a, b) =>
      legales[a] === mejorPrevDir ? -1 : legales[b] === mejorPrevDir ? 1 : 0,
    );

    let alpha = -Infinity;
    const beta = Infinity;

    for (let k = 0; k < orden.length; k++) {
      const idx = orden[k];
      const d = legales[idx];
      const nMyLo = myLo | copyLos[idx];
      const nMyHi = myHi | copyHis[idx];
      const np1Lo = yo === 1 ? nMyLo : p1Lo;
      const np1Hi = yo === 1 ? nMyHi : p1Hi;
      const np2Lo = yo === 2 ? nMyLo : p2Lo;
      const np2Hi = yo === 2 ? nMyHi : p2Hi;

      const nOccLo = np1Lo | np2Lo;
      const nOccHi = np1Hi | np2Hi;
      let val: number;

      if (nOccLo === -1 && nOccHi === -1) {
        const c1 = popcount32(np1Lo) + popcount32(np1Hi);
        const c2 = 64 - c1;
        const diff = yo === 1 ? c1 - c2 : c2 - c1;
        val = diff > 0 ? WIN_BASE + diff * 100 + (depth - 1) : diff < 0 ? -WIN_BASE + diff * 100 - (depth - 1) : 0;
      } else {
        const neLo = ~nOccLo;
        const neHi = ~nOccHi;
        if (hayMovBitboard(oppLo, oppHi, neLo, neHi)) {
          val = -negamaxBitboard(np1Lo, np1Hi, np2Lo, np2Hi, rival, depth - 1, -beta, -alpha, 1);
        } else if (hayMovBitboard(nMyLo, nMyHi, neLo, neHi)) {
          val = negamaxBitboard(np1Lo, np1Hi, np2Lo, np2Hi, yo, depth - 1, alpha, beta, 1);
        } else {
          const c1 = popcount32(np1Lo) + popcount32(np1Hi);
          const c2 = popcount32(np2Lo) + popcount32(np2Hi);
          const diff = yo === 1 ? c1 - c2 : c2 - c1;
          val = diff > 0 ? WIN_BASE + diff * 100 + (depth - 1) : diff < 0 ? -WIN_BASE + diff * 100 - (depth - 1) : 0;
        }
      }

      if (searchAborted) break;

      if (val > iterBestVal) {
        iterBestVal = val;
        iterBestDirs.length = 0;
        iterBestDirs.push(d);
      } else if (val === iterBestVal) {
        iterBestDirs.push(d);
      }
      if (val > alpha) alpha = val;
    }

    if (searchAborted) break;

    if (iterBestDirs.length > 0) {
      mejoresDirs = iterBestDirs;
      mejorPrevDir = iterBestDirs[0];
    }

    if (Math.abs(iterBestVal) >= WIN_BASE - 10_000) break;
  }

  return { tipo: 'estampida', dir: DIRECCIONES[elegirAlAzar(mejoresDirs, rng)] };
}

/**
 * Elige la siguiente jugada del bot de Estampida según la fase y dificultad indicadas.
 */
export function elegirMovimiento(
  state: EstampidaState,
  dificultad: Dificultad,
  rng: Rng = Math.random,
): Move {
  if (state.fase === 'setup') {
    if (dificultad === 'facil') {
      const vacias = celdasVacias(state.board);
      return { tipo: 'colocar', celda: vacias.length > 0 ? elegirAlAzar(vacias, rng) : 0 };
    }
    if (dificultad === 'medio') return elegirSetupMedio(state, rng);
    return elegirSetupDificil(state, rng);
  }

  if (state.fase === 'playing') {
    if (dificultad === 'facil') {
      const legales = direccionesLegales(state.board, state.currentPlayer);
      return {
        tipo: 'estampida',
        dir: legales.length > 0 ? elegirAlAzar(legales, rng) : 'arriba',
      };
    }
    if (dificultad === 'medio') return elegirPlayingMedio(state, rng);
    return elegirPlayingDificil(state, rng);
  }

  return { tipo: 'estampida', dir: 'arriba' };
}
