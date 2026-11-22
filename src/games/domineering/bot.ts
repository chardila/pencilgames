import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, type CellValue, type DomineeringState, type Move, type Player } from './engine';

const TOTAL = TAMANO * TAMANO;
const MASK_NOT_COL7 = 0x7f7f7f7f;
const WIN_SCORE = 1_000_000;
const MATE_THRESH = 900_000;
const MAX_SEARCH_PLY = 64;

const MAX_NODES_MIDGAME = 3_500;
const MAX_NODES_EXACT = 12_000;

// Tablas de lookup por byte (0..255) para popcount y empaquetado horizontal máximo sin solapes.
const POP8 = new Uint8Array(256);
const MAX_HORIZ_8 = new Uint8Array(256);
for (let x = 0; x < 256; x++) {
  let pop = 0;
  let pack = 0;
  let prevLibre = false;
  for (let c = 0; c < 8; c++) {
    if ((x & (1 << c)) !== 0) {
      pop++;
      if (prevLibre) {
        pack++;
        prevLibre = false;
      } else {
        prevLibre = true;
      }
    } else {
      prevLibre = false;
    }
  }
  POP8[x] = pop;
  MAX_HORIZ_8[x] = pack;
}

// PRNG determinista de módulo solo para inicializar constantes Zobrist (nunca usado en juego).
const ZOBRIST_CELL_LO = new Int32Array(TOTAL);
const ZOBRIST_CELL_HI = new Int32Array(TOTAL);
let zSeed = 0x9e3779b9;
function nextZobrist32(): number {
  zSeed = (zSeed + 0x9e3779b9) | 0;
  let t = Math.imul(zSeed ^ (zSeed >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return (t ^ (t >>> 16)) | 0;
}
for (let i = 0; i < TOTAL; i++) {
  ZOBRIST_CELL_LO[i] = nextZobrist32();
  ZOBRIST_CELL_HI[i] = nextZobrist32();
}
const ZOBRIST_TURN_LO = nextZobrist32();
const ZOBRIST_TURN_HI = nextZobrist32();

// Máscaras y hashes Zobrist precalculados por casilla ancla (0..63).
const MOVE_V_LO = new Int32Array(TOTAL);
const MOVE_V_HI = new Int32Array(TOTAL);
const MOVE_H_LO = new Int32Array(TOTAL);
const MOVE_H_HI = new Int32Array(TOTAL);
const ZMOVE_V_LO = new Int32Array(TOTAL);
const ZMOVE_V_HI = new Int32Array(TOTAL);
const ZMOVE_H_LO = new Int32Array(TOTAL);
const ZMOVE_H_HI = new Int32Array(TOTAL);
const CENTRALIDAD = new Int8Array(TOTAL);

for (let i = 0; i < TOTAL; i++) {
  const f = Math.floor(i / TAMANO);
  const c = i % TAMANO;
  CENTRALIDAD[i] = 7 - (Math.abs(f - 3.5) + Math.abs(c - 3.5));

  if (f < TAMANO - 1) {
    const b = i + TAMANO;
    if (i < 32) MOVE_V_LO[i] |= 1 << i;
    else MOVE_V_HI[i] |= 1 << (i - 32);
    if (b < 32) MOVE_V_LO[i] |= 1 << b;
    else MOVE_V_HI[i] |= 1 << (b - 32);

    ZMOVE_V_LO[i] = ZOBRIST_CELL_LO[i] ^ ZOBRIST_CELL_LO[b];
    ZMOVE_V_HI[i] = ZOBRIST_CELL_HI[i] ^ ZOBRIST_CELL_HI[b];
  }

  if (c < TAMANO - 1) {
    const b = i + 1;
    if (i < 32) MOVE_H_LO[i] = (1 << i) | (1 << b);
    else MOVE_H_HI[i] = (1 << (i - 32)) | (1 << (b - 32));

    ZMOVE_H_LO[i] = ZOBRIST_CELL_LO[i] ^ ZOBRIST_CELL_LO[b];
    ZMOVE_H_HI[i] = ZOBRIST_CELL_HI[i] ^ ZOBRIST_CELL_HI[b];
  }
}

// Tabla de transposición sin asignaciones durante la búsqueda.
const TT_SIZE = 1 << 16;
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const ttKeyLo = new Int32Array(TT_SIZE);
const ttKeyHi = new Int32Array(TT_SIZE);
const ttStamp = new Uint16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int8Array(TT_SIZE);
let currentStamp = 0;

// Buffers de jugadas y killers por profundidad para evitar GC en recursión.
const PLY_MOVES = Array.from({ length: MAX_SEARCH_PLY }, () => new Int8Array(TOTAL));
const PLY_SCORES = Array.from({ length: MAX_SEARCH_PLY }, () => new Int32Array(TOTAL));
const KILLER_1 = new Int8Array(MAX_SEARCH_PLY).fill(-1);
const KILLER_2 = new Int8Array(MAX_SEARCH_PLY).fill(-1);

function popcount32(x: number): number {
  x = x - ((x >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** Máximo número de dominós verticales disjuntos en las celdas activas de (lo, hi). */
function countVertPacking(lo: number, hi: number): number {
  const r0 = lo & 0xff;
  let r1 = (lo >>> 8) & 0xff;
  let r2 = (lo >>> 16) & 0xff;
  let r3 = lo >>> 24;
  let r4 = hi & 0xff;
  let r5 = (hi >>> 8) & 0xff;
  let r6 = (hi >>> 16) & 0xff;
  const r7 = hi >>> 24;

  let m = r0 & r1;
  let total = POP8[m];
  r1 ^= m;

  m = r1 & r2;
  total += POP8[m];
  r2 ^= m;

  m = r2 & r3;
  total += POP8[m];
  r3 ^= m;

  m = r3 & r4;
  total += POP8[m];
  r4 ^= m;

  m = r4 & r5;
  total += POP8[m];
  r5 ^= m;

  m = r5 & r6;
  total += POP8[m];
  r6 ^= m;

  total += POP8[r6 & r7];
  return total;
}

/** Máximo número de dominós horizontales disjuntos en las celdas activas de (lo, hi). */
function countHorizPacking(lo: number, hi: number): number {
  return (
    MAX_HORIZ_8[lo & 0xff] +
    MAX_HORIZ_8[(lo >>> 8) & 0xff] +
    MAX_HORIZ_8[(lo >>> 16) & 0xff] +
    MAX_HORIZ_8[lo >>> 24] +
    MAX_HORIZ_8[hi & 0xff] +
    MAX_HORIZ_8[(hi >>> 8) & 0xff] +
    MAX_HORIZ_8[(hi >>> 16) & 0xff] +
    MAX_HORIZ_8[hi >>> 24]
  );
}

function cargarTablero(board: readonly CellValue[]): {
  eLo: number;
  eHi: number;
  zhLo: number;
  zhHi: number;
} {
  let eLo = 0;
  let eHi = 0;
  let zhLo = 0;
  let zhHi = 0;
  for (let i = 0; i < 32; i++) {
    if (board[i] === null) {
      eLo |= 1 << i;
      zhLo ^= ZOBRIST_CELL_LO[i];
      zhHi ^= ZOBRIST_CELL_HI[i];
    }
  }
  for (let i = 32; i < TOTAL; i++) {
    if (board[i] === null) {
      eHi |= 1 << (i - 32);
      zhLo ^= ZOBRIST_CELL_LO[i];
      zhHi ^= ZOBRIST_CELL_HI[i];
    }
  }
  return { eLo, eHi, zhLo, zhHi };
}

function moveDesdeAncla(a: number, player: Player): Move {
  return player === 1 ? { a, b: a + TAMANO } : { a, b: a + 1 };
}

function extraerAnclas(mLo: number, mHi: number): number[] {
  const res: number[] = [];
  let lo = mLo;
  while (lo !== 0) {
    const lsb = lo & -lo;
    res.push(31 - Math.clz32(lsb));
    lo ^= lsb;
  }
  let hi = mHi;
  while (hi !== 0) {
    const lsb = hi & -hi;
    res.push(32 + (31 - Math.clz32(lsb)));
    hi ^= lsb;
  }
  return res;
}

function tieneVictoriaEn1(eLo: number, eHi: number, player: Player): boolean {
  if (player === 1) {
    let vLo = eLo & ((eLo >>> 8) | ((eHi & 0xff) << 24));
    while (vLo !== 0) {
      const lsb = vLo & -vLo;
      const a = 31 - Math.clz32(lsb);
      vLo ^= lsb;
      const nLo = eLo ^ MOVE_V_LO[a];
      const nHi = eHi ^ MOVE_V_HI[a];
      if (((nLo & (nLo >>> 1) & MASK_NOT_COL7) | (nHi & (nHi >>> 1) & MASK_NOT_COL7)) === 0) {
        return true;
      }
    }
    let vHi = eHi & (eHi >>> 8);
    while (vHi !== 0) {
      const lsb = vHi & -vHi;
      const a = 32 + (31 - Math.clz32(lsb));
      vHi ^= lsb;
      const nHi = eHi ^ MOVE_V_HI[a];
      if (((eLo & (eLo >>> 1) & MASK_NOT_COL7) | (nHi & (nHi >>> 1) & MASK_NOT_COL7)) === 0) {
        return true;
      }
    }
    return false;
  }

  let hLo = eLo & (eLo >>> 1) & MASK_NOT_COL7;
  while (hLo !== 0) {
    const lsb = hLo & -hLo;
    const a = 31 - Math.clz32(lsb);
    hLo ^= lsb;
    const nLo = eLo ^ MOVE_H_LO[a];
    if (((nLo & ((nLo >>> 8) | ((eHi & 0xff) << 24))) | (eHi & (eHi >>> 8))) === 0) {
      return true;
    }
  }
  let hHi = eHi & (eHi >>> 1) & MASK_NOT_COL7;
  while (hHi !== 0) {
    const lsb = hHi & -hHi;
    const a = 32 + (31 - Math.clz32(lsb));
    hHi ^= lsb;
    const nHi = eHi ^ MOVE_H_HI[a];
    if (((eLo & ((eLo >>> 8) | ((nHi & 0xff) << 24))) | (nHi & (nHi >>> 8))) === 0) {
      return true;
    }
  }
  return false;
}

function elegirFacil(eLo: number, eHi: number, yo: Player, rng: Rng): Move {
  const mLo = yo === 1 ? eLo & ((eLo >>> 8) | ((eHi & 0xff) << 24)) : eLo & (eLo >>> 1) & MASK_NOT_COL7;
  const mHi = yo === 1 ? eHi & (eHi >>> 8) : eHi & (eHi >>> 1) & MASK_NOT_COL7;
  const anclas = extraerAnclas(mLo, mHi);
  const ganadoras: number[] = [];
  const otras: number[] = [];

  for (let i = 0; i < anclas.length; i++) {
    const a = anclas[i];
    const nLo = eLo ^ (yo === 1 ? MOVE_V_LO[a] : MOVE_H_LO[a]);
    const nHi = eHi ^ (yo === 1 ? MOVE_V_HI[a] : MOVE_H_HI[a]);
    const oppLo = yo === 1 ? nLo & (nLo >>> 1) & MASK_NOT_COL7 : nLo & ((nLo >>> 8) | ((nHi & 0xff) << 24));
    const oppHi = yo === 1 ? nHi & (nHi >>> 1) & MASK_NOT_COL7 : nHi & (nHi >>> 8);
    if ((oppLo | oppHi) === 0) {
      ganadoras.push(a);
    } else {
      otras.push(a);
    }
  }

  if (ganadoras.length > 0 && (otras.length === 0 || rng() < 0.4)) {
    return moveDesdeAncla(elegirAlAzar(ganadoras, rng), yo);
  }
  const pool = otras.length > 0 ? otras : ganadoras;
  return moveDesdeAncla(elegirAlAzar(pool, rng), yo);
}

function elegirMedio(eLo: number, eHi: number, yo: Player, rng: Rng): Move {
  const rival: Player = yo === 1 ? 2 : 1;
  const mLo = yo === 1 ? eLo & ((eLo >>> 8) | ((eHi & 0xff) << 24)) : eLo & (eLo >>> 1) & MASK_NOT_COL7;
  const mHi = yo === 1 ? eHi & (eHi >>> 8) : eHi & (eHi >>> 1) & MASK_NOT_COL7;
  const anclas = extraerAnclas(mLo, mHi);

  const ganadoras: number[] = [];
  const seguras: { a: number; diff: number }[] = [];
  const todas: { a: number; diff: number }[] = [];

  for (let i = 0; i < anclas.length; i++) {
    const a = anclas[i];
    const nLo = eLo ^ (yo === 1 ? MOVE_V_LO[a] : MOVE_H_LO[a]);
    const nHi = eHi ^ (yo === 1 ? MOVE_V_HI[a] : MOVE_H_HI[a]);
    const vLo = nLo & ((nLo >>> 8) | ((nHi & 0xff) << 24));
    const vHi = nHi & (nHi >>> 8);
    const hLo = nLo & (nLo >>> 1) & MASK_NOT_COL7;
    const hHi = nHi & (nHi >>> 1) & MASK_NOT_COL7;

    const myCnt = yo === 1 ? popcount32(vLo) + popcount32(vHi) : popcount32(hLo) + popcount32(hHi);
    const oppCnt = yo === 1 ? popcount32(hLo) + popcount32(hHi) : popcount32(vLo) + popcount32(vHi);

    if (oppCnt === 0) {
      ganadoras.push(a);
      continue;
    }

    const diff = myCnt - oppCnt;
    todas.push({ a, diff });
    if (!tieneVictoriaEn1(nLo, nHi, rival)) {
      seguras.push({ a, diff });
    }
  }

  if (ganadoras.length > 0) {
    return moveDesdeAncla(elegirAlAzar(ganadoras, rng), yo);
  }

  const pool = seguras.length > 0 ? seguras : todas;
  let mejorDiff = -Infinity;
  let mejores: number[] = [];
  for (let i = 0; i < pool.length; i++) {
    const item = pool[i];
    if (item.diff > mejorDiff) {
      mejorDiff = item.diff;
      mejores = [item.a];
    } else if (item.diff === mejorDiff) {
      mejores.push(item.a);
    }
  }

  return moveDesdeAncla(elegirAlAzar(mejores, rng), yo);
}

// Estado mutable de búsqueda para una llamada a elegirDificil.
let searchNodes = 0;
let searchNodeLimit = MAX_NODES_MIDGAME;
let searchAborted = false;
let searchExactMode = false;

/**
 * Comprueba si las celdas activas V y H están desacopladas y devuelve su valor exacto.
 */
function evaluarDesacoplado(
  eLo: number,
  eHi: number,
  vLo: number,
  vHi: number,
  hLo: number,
  hHi: number,
  turno: Player,
  ply: number,
): number | null {
  const hCovLo = hLo | (hLo << 1);
  const hCovHi = hHi | (hHi << 1);
  const vCovLo = vLo | (vLo << 8);
  const vCovHi = vHi | (vHi << 8) | (vLo >>> 24);

  if (((vCovLo & hCovLo) | (vCovHi & hCovHi)) !== 0) {
    return null;
  }

  const safeV = countVertPacking(eLo & ~hCovLo, eHi & ~hCovHi);
  const safeH = countHorizPacking(eLo & ~vCovLo, eHi & ~vCovHi);
  const mySafe = turno === 1 ? safeV : safeH;
  const oppSafe = turno === 1 ? safeH : safeV;
  return mySafe > oppSafe ? WIN_SCORE - ply : -WIN_SCORE + ply;
}

/**
 * Evalúa una posición hoja combinando espacios seguros exclusivos,
 * empaquetado máximo disjunto y movilidad bruta.
 */
function evaluarPosicion(
  eLo: number,
  eHi: number,
  vLo: number,
  vHi: number,
  hLo: number,
  hHi: number,
  turno: Player,
  ply: number,
): number {
  const hCovLo = hLo | (hLo << 1);
  const hCovHi = hHi | (hHi << 1);
  const vCovLo = vLo | (vLo << 8);
  const vCovHi = vHi | (vHi << 8) | (vLo >>> 24);

  const safeV = countVertPacking(eLo & ~hCovLo, eHi & ~hCovHi);
  const safeH = countHorizPacking(eLo & ~vCovLo, eHi & ~vCovHi);

  const mySafe = turno === 1 ? safeV : safeH;
  const oppSafe = turno === 1 ? safeH : safeV;

  // Sin celdas compartidas entre dominós V y H: el juego se reduce a pilas independientes.
  if (((vCovLo & hCovLo) | (vCovHi & hCovHi)) === 0) {
    return mySafe > oppSafe ? WIN_SCORE - ply : -WIN_SCORE + ply;
  }

  const packV = countVertPacking(eLo, eHi);
  const packH = countHorizPacking(eLo, eHi);
  const myPack = turno === 1 ? packV : packH;
  const oppPack = turno === 1 ? packH : packV;

  if (mySafe > oppPack) return WIN_SCORE - ply;
  if (myPack <= oppSafe) return -WIN_SCORE + ply;

  const cntV = popcount32(vLo) + popcount32(vHi);
  const cntH = popcount32(hLo) + popcount32(hHi);
  const myCnt = turno === 1 ? cntV : cntH;
  const oppCnt = turno === 1 ? cntH : cntV;

  return (
    60 * (mySafe - oppSafe) +
    44 * (myPack - oppPack) +
    4 * (myCnt - oppCnt) +
    18
  );
}

function generarYOrdenarJugadas(
  ply: number,
  turno: Player,
  vLo: number,
  vHi: number,
  hLo: number,
  hHi: number,
  eLo: number,
  eHi: number,
  ttBest: number,
  podarAisladas: boolean,
): number {
  let mLo = turno === 1 ? vLo : hLo;
  let mHi = turno === 1 ? vHi : hHi;

  // En nodos internos, conservar solo una representante entre dominós 2x1/1x2 exclusivos aislados.
  if (podarAisladas) {
    if (turno === 1) {
      const hCovLo = hLo | (hLo << 1);
      const hCovHi = hHi | (hHi << 1);
      const exclVLo = eLo & ~hCovLo;
      const exclVHi = eHi & ~hCovHi;
      const safeVLo = exclVLo & ((exclVLo >>> 8) | ((exclVHi & 0xff) << 24));
      const safeVHi = exclVHi & (exclVHi >>> 8);
      const vNeighLo = (vLo << 8) | (vLo >>> 8) | ((vHi & 0xff) << 24);
      const vNeighHi = (vHi << 8) | (vHi >>> 8) | (vLo >>> 24);
      const isoLo = safeVLo & ~vNeighLo;
      const isoHi = safeVHi & ~vNeighHi;
      if (isoLo !== 0) {
        const keep = isoLo & -isoLo;
        mLo = (mLo & ~isoLo) | keep;
        mHi &= ~isoHi;
      } else if (isoHi !== 0) {
        const keep = isoHi & -isoHi;
        mHi = (mHi & ~isoHi) | keep;
      }
    } else {
      const vCovLo = vLo | (vLo << 8);
      const vCovHi = vHi | (vHi << 8) | (vLo >>> 24);
      const exclHLo = eLo & ~vCovLo;
      const exclHHi = eHi & ~vCovHi;
      const safeHLo = exclHLo & (exclHLo >>> 1) & MASK_NOT_COL7;
      const safeHHi = exclHHi & (exclHHi >>> 1) & MASK_NOT_COL7;
      const hNeighLo = ((hLo << 1) | (hLo >>> 1)) & MASK_NOT_COL7;
      const hNeighHi = ((hHi << 1) | (hHi >>> 1)) & MASK_NOT_COL7;
      const isoLo = safeHLo & ~hNeighLo;
      const isoHi = safeHHi & ~hNeighHi;
      if (isoLo !== 0) {
        const keep = isoLo & -isoLo;
        mLo = (mLo & ~isoLo) | keep;
        mHi &= ~isoHi;
      } else if (isoHi !== 0) {
        const keep = isoHi & -isoHi;
        mHi = (mHi & ~isoHi) | keep;
      }
    }
  }

  const moves = PLY_MOVES[ply];
  const scores = PLY_SCORES[ply];
  const k1 = KILLER_1[ply];
  const k2 = KILLER_2[ply];
  let count = 0;

  while (mLo !== 0) {
    const lsb = mLo & -mLo;
    const a = 31 - Math.clz32(lsb);
    mLo ^= lsb;
    moves[count] = a;
    if (a === ttBest) {
      scores[count] = 1_000_000;
    } else if (a === k1) {
      scores[count] = 500_000;
    } else if (a === k2) {
      scores[count] = 400_000;
    } else if (turno === 1) {
      const maskLo = MOVE_V_LO[a];
      const maskHi = MOVE_V_HI[a];
      const oppBlocked =
        popcount32(hLo & (maskLo | (maskLo >>> 1))) +
        popcount32(hHi & (maskHi | (maskHi >>> 1)));
      scores[count] = oppBlocked * 32 + CENTRALIDAD[a];
    } else {
      const maskLo = MOVE_H_LO[a];
      const oppBlocked = popcount32(vLo & (maskLo | (maskLo >>> 8)));
      scores[count] = oppBlocked * 32 + CENTRALIDAD[a];
    }
    count++;
  }

  while (mHi !== 0) {
    const lsb = mHi & -mHi;
    const a = 32 + (31 - Math.clz32(lsb));
    mHi ^= lsb;
    moves[count] = a;
    if (a === ttBest) {
      scores[count] = 1_000_000;
    } else if (a === k1) {
      scores[count] = 500_000;
    } else if (a === k2) {
      scores[count] = 400_000;
    } else if (turno === 1) {
      const maskHi = MOVE_V_HI[a];
      const oppBlocked = popcount32(hHi & (maskHi | (maskHi >>> 1)));
      scores[count] = oppBlocked * 32 + CENTRALIDAD[a];
    } else {
      const maskHi = MOVE_H_HI[a];
      const oppBlocked =
        popcount32(vHi & (maskHi | (maskHi >>> 8))) +
        popcount32(vLo & ((maskHi & 0xff) << 24));
      scores[count] = oppBlocked * 32 + CENTRALIDAD[a];
    }
    count++;
  }

  return count;
}

function negamax(
  eLo: number,
  eHi: number,
  zhLo: number,
  zhHi: number,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  turno: Player,
): number {
  if (++searchNodes >= searchNodeLimit) {
    searchAborted = true;
    return 0;
  }

  const vLo = eLo & ((eLo >>> 8) | ((eHi & 0xff) << 24));
  const vHi = eHi & (eHi >>> 8);
  const hLo = eLo & (eLo >>> 1) & MASK_NOT_COL7;
  const hHi = eHi & (eHi >>> 1) & MASK_NOT_COL7;

  if (turno === 1 ? (vLo | vHi) === 0 : (hLo | hHi) === 0) {
    return -WIN_SCORE + ply;
  }

  if (depth <= 0) {
    return evaluarPosicion(eLo, eHi, vLo, vHi, hLo, hHi, turno, ply);
  }

  const exacto = evaluarDesacoplado(eLo, eHi, vLo, vHi, hLo, hHi, turno, ply);
  if (exacto !== null) {
    return exacto;
  }

  const hashLo = turno === 1 ? zhLo : zhLo ^ ZOBRIST_TURN_LO;
  const hashHi = turno === 1 ? zhHi : zhHi ^ ZOBRIST_TURN_HI;
  const ttIdx = hashLo & TT_MASK;
  let ttBest = -1;

  if (
    ttStamp[ttIdx] === currentStamp &&
    ttKeyLo[ttIdx] === hashLo &&
    ttKeyHi[ttIdx] === hashHi
  ) {
    ttBest = ttMove[ttIdx];
    if (ttDepth[ttIdx] >= depth) {
      let stored = ttScore[ttIdx];
      if (stored >= MATE_THRESH) stored -= ply;
      else if (stored <= -MATE_THRESH) stored += ply;

      const flag = ttFlag[ttIdx];
      if (flag === TT_EXACT) return stored;
      if (flag === TT_LOWER && stored > alpha) alpha = stored;
      else if (flag === TT_UPPER && stored < beta) beta = stored;
      if (alpha >= beta) return stored;
    }
  }

  const count = generarYOrdenarJugadas(
    ply,
    turno,
    vLo,
    vHi,
    hLo,
    hHi,
    eLo,
    eHi,
    ttBest,
    ply > 0,
  );

  const moves = PLY_MOVES[ply];
  const scores = PLY_SCORES[ply];
  const rival: Player = turno === 1 ? 2 : 1;
  const alphaOrig = alpha;
  const limit = searchExactMode ? count : Math.min(count, depth >= 3 ? 12 : 8);
  let bestVal = -Infinity;
  let bestMove = -1;

  for (let i = 0; i < limit; i++) {
    // Selección incremental de la mejor jugada restante por ordenación.
    let bestPos = i;
    let bestOrder = scores[i];
    for (let j = i + 1; j < count; j++) {
      if (scores[j] > bestOrder) {
        bestOrder = scores[j];
        bestPos = j;
      }
    }
    if (bestPos !== i) {
      const tmpM = moves[i];
      moves[i] = moves[bestPos];
      moves[bestPos] = tmpM;
      scores[bestPos] = scores[i];
    }

    const a = moves[i];
    const mLo = turno === 1 ? MOVE_V_LO[a] : MOVE_H_LO[a];
    const mHi = turno === 1 ? MOVE_V_HI[a] : MOVE_H_HI[a];
    const zLo = turno === 1 ? ZMOVE_V_LO[a] : ZMOVE_H_LO[a];
    const zHi = turno === 1 ? ZMOVE_V_HI[a] : ZMOVE_H_HI[a];

    const val = -negamax(
      eLo ^ mLo,
      eHi ^ mHi,
      zhLo ^ zLo,
      zhHi ^ zHi,
      depth - 1,
      ply + 1,
      -beta,
      -alpha,
      rival,
    );

    if (searchAborted) return 0;

    if (val > bestVal) {
      bestVal = val;
      bestMove = a;
    }
    if (val > alpha) {
      alpha = val;
      if (alpha >= beta) {
        if (a !== KILLER_1[ply]) {
          KILLER_2[ply] = KILLER_1[ply];
          KILLER_1[ply] = a;
        }
        break;
      }
    }
  }

  let toStore = bestVal;
  if (toStore >= MATE_THRESH) toStore += ply;
  else if (toStore <= -MATE_THRESH) toStore -= ply;

  ttStamp[ttIdx] = currentStamp;
  ttKeyLo[ttIdx] = hashLo;
  ttKeyHi[ttIdx] = hashHi;
  ttDepth[ttIdx] = depth;
  ttScore[ttIdx] = toStore;
  ttMove[ttIdx] = bestMove;
  ttFlag[ttIdx] =
    bestVal <= alphaOrig ? TT_UPPER : bestVal >= beta ? TT_LOWER : TT_EXACT;

  return bestVal;
}

function elegirDificil(
  eLo: number,
  eHi: number,
  zhLo: number,
  zhHi: number,
  yo: Player,
  rng: Rng,
): Move {
  const vLo = eLo & ((eLo >>> 8) | ((eHi & 0xff) << 24));
  const vHi = eHi & (eHi >>> 8);
  const hLo = eLo & (eLo >>> 1) & MASK_NOT_COL7;
  const hHi = eHi & (eHi >>> 1) & MASK_NOT_COL7;

  const myLo = yo === 1 ? vLo : hLo;
  const myHi = yo === 1 ? vHi : hHi;
  const anclas = extraerAnclas(myLo, myHi);
  if (anclas.length === 1) {
    return moveDesdeAncla(anclas[0], yo);
  }

  // Victoria inmediata en 1.
  const ganadoras: number[] = [];
  for (let i = 0; i < anclas.length; i++) {
    const a = anclas[i];
    const nLo = eLo ^ (yo === 1 ? MOVE_V_LO[a] : MOVE_H_LO[a]);
    const nHi = eHi ^ (yo === 1 ? MOVE_V_HI[a] : MOVE_H_HI[a]);
    const oppLo = yo === 1 ? nLo & (nLo >>> 1) & MASK_NOT_COL7 : nLo & ((nLo >>> 8) | ((nHi & 0xff) << 24));
    const oppHi = yo === 1 ? nHi & (nHi >>> 1) & MASK_NOT_COL7 : nHi & (nHi >>> 8);
    if ((oppLo | oppHi) === 0) ganadoras.push(a);
  }
  if (ganadoras.length > 0) {
    return moveDesdeAncla(elegirAlAzar(ganadoras, rng), yo);
  }

  currentStamp = (currentStamp + 1) & 0xffff;
  if (currentStamp === 0) {
    ttStamp.fill(0);
    currentStamp = 1;
  }
  KILLER_1.fill(-1);
  KILLER_2.fill(-1);

  const totalJugadas = popcount32(vLo) + popcount32(vHi) + popcount32(hLo) + popcount32(hHi);
  const esFinalExacto = totalJugadas <= 12;
  const rival: Player = yo === 1 ? 2 : 1;

  // Ordenar jugadas en raíz una vez; se reordena poniendo mejores de iteración previa al frente.
  const rootCount = generarYOrdenarJugadas(0, yo, vLo, vHi, hLo, hHi, eLo, eHi, -1, false);
  const rootPares: { a: number; score: number }[] = [];
  for (let i = 0; i < rootCount; i++) {
    rootPares.push({ a: PLY_MOVES[0][i], score: PLY_SCORES[0][i] });
  }
  rootPares.sort((x, y) => y.score - x.score);
  const rootMoves = rootPares.map(p => p.a);

  let mejoresConfirmadas = [rootMoves[0]];

  searchNodes = 0;
  searchAborted = false;
  searchExactMode = esFinalExacto;
  searchNodeLimit = esFinalExacto ? MAX_NODES_EXACT : MAX_NODES_MIDGAME;

  const minDepth = esFinalExacto ? 36 : 1;
  const maxDepth = esFinalExacto ? 36 : totalJugadas <= 30 ? 6 : 5;
  const rootScores = new Map<number, number>();

  for (let depth = minDepth; depth <= maxDepth; depth++) {
    let bestScore = -Infinity;
    let mejoresIter: number[] = [];
    const rootLimit =
      !esFinalExacto && depth >= 3 ? Math.min(rootMoves.length, 14) : rootMoves.length;

    for (let i = 0; i < rootLimit; i++) {
      const a = rootMoves[i];
      const mLo = yo === 1 ? MOVE_V_LO[a] : MOVE_H_LO[a];
      const mHi = yo === 1 ? MOVE_V_HI[a] : MOVE_H_HI[a];
      const zLo = yo === 1 ? ZMOVE_V_LO[a] : ZMOVE_H_LO[a];
      const zHi = yo === 1 ? ZMOVE_V_HI[a] : ZMOVE_H_HI[a];

      // En profundidad 1 evaluamos todas las jugadas en ventana abierta para ordenar la raíz.
      const beta =
        depth === 1 || bestScore === -Infinity ? Infinity : -(bestScore - 1);
      const val = -negamax(
        eLo ^ mLo,
        eHi ^ mHi,
        zhLo ^ zLo,
        zhHi ^ zHi,
        depth - 1,
        1,
        -Infinity,
        beta,
        rival,
      );

      if (searchAborted) break;

      if (depth === 1) {
        rootScores.set(a, val);
      }

      if (val > bestScore) {
        bestScore = val;
        mejoresIter = [a];
      } else if (val === bestScore) {
        mejoresIter.push(a);
      }
    }

    if (searchAborted) break;

    mejoresConfirmadas = mejoresIter;

    // Si ya se encontró victoria/derrota forzada exacta, no hace falta profundizar más.
    if (Math.abs(bestScore) >= MATE_THRESH) break;

    if (depth === 1) {
      rootMoves.sort((a, b) => (rootScores.get(b) ?? 0) - (rootScores.get(a) ?? 0));
    } else {
      const setMejores = new Set(mejoresIter);
      rootMoves.sort((a, b) => (setMejores.has(b) ? 1 : 0) - (setMejores.has(a) ? 1 : 0));
    }
  }

  return moveDesdeAncla(elegirAlAzar(mejoresConfirmadas, rng), yo);
}

/**
 * Elige la siguiente jugada del bot de Domineering según la dificultad indicada.
 */
export function elegirMovimiento(
  state: DomineeringState,
  dificultad: Dificultad,
  rng: Rng = Math.random,
): Move {
  const { eLo, eHi, zhLo, zhHi } = cargarTablero(state.board);
  const yo = state.currentPlayer;

  if (dificultad === 'facil') {
    return elegirFacil(eLo, eHi, yo, rng);
  }
  if (dificultad === 'medio') {
    return elegirMedio(eLo, eHi, yo, rng);
  }
  return elegirDificil(eLo, eHi, zhLo, zhHi, yo, rng);
}
