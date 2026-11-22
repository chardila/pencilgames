import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import type { Move, SOSState } from './engine';

const EMPTY = 0;
const CHAR_S = 1;
const CHAR_O = 2;

const MAX_ALPHA_BETA_NODES = 5_000;
const TT_SIZE = 1 << 15; // 32,768 entradas
const TT_MASK = TT_SIZE - 1;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

interface Geometria {
  size: number;
  total: number;
  endPairs: Uint16Array[];
  midPairs: Uint16Array[];
  zobristHi: Uint32Array;
  zobristLo: Uint32Array;
  turnHi: number;
  turnLo: number;
  distCentro: Uint8Array;
}

const GEOMETRIA_CACHE = new Map<number, Geometria>();

function xorshift32(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return x >>> 0;
  };
}

function obtenerGeometria(size: number): Geometria {
  const cached = GEOMETRIA_CACHE.get(size);
  if (cached) return cached;

  const total = size * size;
  const endLists: number[][] = Array.from({ length: total }, () => []);
  const midLists: number[][] = Array.from({ length: total }, () => []);

  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of dirs) {
        const r1 = r + dr;
        const c1 = c + dc;
        const r2 = r + 2 * dr;
        const c2 = c + 2 * dc;
        if (r2 < 0 || r2 >= size || c2 < 0 || c2 >= size) continue;
        if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;

        const a = r * size + c;
        const b = r1 * size + c1;
        const cIdx = r2 * size + c2;

        endLists[a].push(b, cIdx);
        endLists[cIdx].push(b, a);
        midLists[b].push(a, cIdx);
      }
    }
  }

  const nextRand = xorshift32(0x9e3779b9 ^ size);
  const zobristHi = new Uint32Array(total * 3);
  const zobristLo = new Uint32Array(total * 3);
  for (let i = 0; i < total * 3; i++) {
    zobristHi[i] = nextRand();
    zobristLo[i] = nextRand();
  }

  const distCentro = new Uint8Array(total);
  const mitad = (size - 1) / 2;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      distCentro[r * size + c] = Math.round(Math.abs(r - mitad) + Math.abs(c - mitad));
    }
  }

  const geo: Geometria = {
    size,
    total,
    endPairs: endLists.map(l => Uint16Array.from(l)),
    midPairs: midLists.map(l => Uint16Array.from(l)),
    zobristHi,
    zobristLo,
    turnHi: nextRand(),
    turnLo: nextRand(),
    distCentro,
  };

  GEOMETRIA_CACHE.set(size, geo);
  return geo;
}

function cargarTablero(state: SOSState, geo: Geometria): {
  board: Uint8Array;
  emptyCount: number;
  keyHi: number;
  keyLo: number;
} {
  const board = new Uint8Array(geo.total);
  let emptyCount = 0;
  let keyHi = 0;
  let keyLo = 0;

  for (let r = 0; r < geo.size; r++) {
    for (let c = 0; c < geo.size; c++) {
      const idx = r * geo.size + c;
      const val = state.board[r][c];
      if (val === 'S') {
        board[idx] = CHAR_S;
        keyHi ^= geo.zobristHi[idx * 3 + CHAR_S];
        keyLo ^= geo.zobristLo[idx * 3 + CHAR_S];
      } else if (val === 'O') {
        board[idx] = CHAR_O;
        keyHi ^= geo.zobristHi[idx * 3 + CHAR_O];
        keyLo ^= geo.zobristLo[idx * 3 + CHAR_O];
      } else {
        emptyCount++;
      }
    }
  }

  return { board, emptyCount, keyHi, keyLo };
}

function aMove(idx: number, letterCode: number, size: number): Move {
  return {
    row: Math.floor(idx / size),
    col: idx % size,
    letter: letterCode === CHAR_S ? 'S' : 'O',
  };
}

function countImmediateSOS(
  board: Uint8Array,
  geo: Geometria,
  cell: number,
  letterCode: number
): number {
  let count = 0;
  if (letterCode === CHAR_O) {
    const pairs = geo.midPairs[cell];
    for (let i = 0; i < pairs.length; i += 2) {
      if (board[pairs[i]] === CHAR_S && board[pairs[i + 1]] === CHAR_S) {
        count++;
      }
    }
  } else {
    const pairs = geo.endPairs[cell];
    for (let i = 0; i < pairs.length; i += 2) {
      if (board[pairs[i]] === CHAR_O && board[pairs[i + 1]] === CHAR_S) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Cuenta cuántas amenazas directas de 1 jugada (S_S o SO_) abre esta colocación.
 */
function countThreatsCreated(
  board: Uint8Array,
  geo: Geometria,
  cell: number,
  letterCode: number
): number {
  let threats = 0;
  if (letterCode === CHAR_O) {
    const pairs = geo.midPairs[cell];
    for (let i = 0; i < pairs.length; i += 2) {
      const a = board[pairs[i]];
      const b = board[pairs[i + 1]];
      if ((a === CHAR_S && b === EMPTY) || (a === EMPTY && b === CHAR_S)) {
        threats++;
      }
    }
  } else {
    const pairs = geo.endPairs[cell];
    for (let i = 0; i < pairs.length; i += 2) {
      const mid = board[pairs[i]];
      const far = board[pairs[i + 1]];
      if ((mid === CHAR_O && far === EMPTY) || (mid === EMPTY && far === CHAR_S)) {
        threats++;
      }
    }
  }
  return threats;
}

/**
 * Cuenta cuántos pares de casillas envenenadas o restricciones tácticas genera colocar `letterCode`:
 * por ejemplo colocar 'S' a distancia 3 de otra 'S' (`S..S`) envenena ambas casillas intermedias.
 */
function contarEnvenenamientoPotencial(
  board: Uint8Array,
  geo: Geometria,
  cell: number,
  letterCode: number
): number {
  let score = 0;
  if (letterCode === CHAR_S) {
    // Buscar S a distancia 3 (crea S..S con 2 casillas intermedias envenenadas)
    const size = geo.size;
    const r = Math.floor(cell / size);
    const c = cell % size;
    const dirs = [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];
    for (const [dr, dc] of dirs) {
      const r3 = r + 3 * dr;
      const c3 = c + 3 * dc;
      if (r3 < 0 || r3 >= size || c3 < 0 || c3 >= size) continue;
      const idx1 = (r + dr) * size + (c + dc);
      const idx2 = (r + 2 * dr) * size + (c + 2 * dc);
      const idx3 = r3 * size + c3;
      if (board[idx1] === EMPTY && board[idx2] === EMPTY) {
        if (board[idx3] === CHAR_S) {
          score += 24; // Crea trampa S..S directa
        } else if (board[idx3] === EMPTY) {
          score += 4; // Prepara posible S..S y restringe vecinas
        }
      }
    }
  } else {
    // 'O' bloquea amenazas abiertas cuando hay O adyacente o S a distancia 2
    const pairs = geo.endPairs[cell];
    for (let i = 0; i < pairs.length; i += 2) {
      if (board[pairs[i]] === CHAR_O && board[pairs[i + 1]] === EMPTY) {
        score += 3;
      }
    }
  }
  return score;
}

function hasAnySafeMove(board: Uint8Array, geo: Geometria): boolean {
  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    if (
      countImmediateSOS(board, geo, idx, CHAR_S) === 0 &&
      countThreatsCreated(board, geo, idx, CHAR_S) === 0
    ) {
      return true;
    }
    if (
      countImmediateSOS(board, geo, idx, CHAR_O) === 0 &&
      countThreatsCreated(board, geo, idx, CHAR_O) === 0
    ) {
      return true;
    }
  }
  return false;
}

function countSafeCellsAndMoves(
  board: Uint8Array,
  geo: Geometria
): { safeCells: number; safeMoves: number; poisonedCells: number } {
  let safeCells = 0;
  let safeMoves = 0;
  let poisonedCells = 0;
  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    let cellSafe = 0;
    if (
      countImmediateSOS(board, geo, idx, CHAR_S) === 0 &&
      countThreatsCreated(board, geo, idx, CHAR_S) === 0
    ) {
      cellSafe++;
    }
    if (
      countImmediateSOS(board, geo, idx, CHAR_O) === 0 &&
      countThreatsCreated(board, geo, idx, CHAR_O) === 0
    ) {
      cellSafe++;
    }
    if (cellSafe > 0) {
      safeCells++;
      safeMoves += cellSafe;
    } else {
      poisonedCells++;
    }
  }
  return { safeCells, safeMoves, poisonedCells };
}

/**
 * Simula la cadena máxima de SOS consecutivos que puede cobrar el jugador en turno.
 */
function simularCadenaMaxima(
  board: Uint8Array,
  geo: Geometria,
  emptyCount: number,
  budget: { nodes: number }
): number {
  if (emptyCount === 0 || budget.nodes <= 0) return 0;
  budget.nodes--;

  let count = 0;
  let bestIdx = -1;
  let bestLetter = CHAR_S;
  let bestPts = 0;
  const cands: number[] = [];

  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    const ptsS = countImmediateSOS(board, geo, idx, CHAR_S);
    if (ptsS > 0) {
      count++;
      cands.push((ptsS << 10) | (idx << 1));
      if (ptsS > bestPts) {
        bestPts = ptsS;
        bestIdx = idx;
        bestLetter = CHAR_S;
      }
    }
    const ptsO = countImmediateSOS(board, geo, idx, CHAR_O);
    if (ptsO > 0) {
      count++;
      cands.push((ptsO << 10) | (idx << 1) | 1);
      if (ptsO > bestPts) {
        bestPts = ptsO;
        bestIdx = idx;
        bestLetter = CHAR_O;
      }
    }
  }

  if (count === 0) return 0;

  if (count === 1) {
    board[bestIdx] = bestLetter;
    const rest = simularCadenaMaxima(board, geo, emptyCount - 1, budget);
    board[bestIdx] = EMPTY;
    return bestPts + rest;
  }

  cands.sort((a, b) => b - a);
  const limit = Math.min(3, count);
  let best = 0;
  for (let i = 0; i < limit; i++) {
    const c = cands[i];
    const pts = c >> 10;
    const idx = (c >> 1) & 0x1ff;
    const letter = (c & 1) === 0 ? CHAR_S : CHAR_O;
    board[idx] = letter;
    const total = pts + simularCadenaMaxima(board, geo, emptyCount - 1, budget);
    board[idx] = EMPTY;
    if (total > best) best = total;
  }
  return best;
}

function minSacrificeChain(board: Uint8Array, geo: Geometria, emptyCount: number): number {
  if (emptyCount <= 1) return 0;
  let minOpp = Infinity;
  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    for (const letter of [CHAR_S, CHAR_O]) {
      if (countImmediateSOS(board, geo, idx, letter) > 0) continue;
      board[idx] = letter;
      const oppPts = simularCadenaMaxima(board, geo, emptyCount - 1, { nodes: 32 });
      board[idx] = EMPTY;
      if (oppPts < minOpp) minOpp = oppPts;
      if (minOpp === 0) return 0;
    }
  }
  return minOpp === Infinity ? 0 : minOpp;
}

// Buffers preasignados para cero GC en alfa-beta de finales (profundidad máxima 10)
const MAX_AB_PLY = 12;
const MOVE_CODES = Array.from({ length: MAX_AB_PLY }, () => new Int32Array(24));
const MOVE_PRIOS = Array.from({ length: MAX_AB_PLY }, () => new Int32Array(24));
const MOVE_PTS = Array.from({ length: MAX_AB_PLY }, () => new Int8Array(24));

const ttKeyHi = new Uint32Array(TT_SIZE);
const ttKeyLo = new Uint32Array(TT_SIZE);
const ttVal = new Int32Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttBestMove = new Int16Array(TT_SIZE);

function encodeMove(idx: number, letter: number): number {
  return (idx << 1) | (letter === CHAR_S ? 0 : 1);
}

function decodeCell(code: number): number {
  return code >> 1;
}

function decodeLetter(code: number): number {
  return (code & 1) === 0 ? CHAR_S : CHAR_O;
}

function quiesceChain(
  board: Uint8Array,
  geo: Geometria,
  emptyCells: number[],
  emptyCount: number,
  plyLeft: number,
  ctx: { nodes: number }
): number {
  if (emptyCount === 0 || plyLeft <= 0) return 0;
  ctx.nodes++;

  let bestIdx = -1;
  let bestLetter = CHAR_S;
  let bestPts = 0;

  for (let i = 0; i < emptyCells.length; i++) {
    const idx = emptyCells[i];
    if (board[idx] !== EMPTY) continue;
    const ptsS = countImmediateSOS(board, geo, idx, CHAR_S);
    if (ptsS > bestPts) {
      bestPts = ptsS;
      bestIdx = idx;
      bestLetter = CHAR_S;
    }
    const ptsO = countImmediateSOS(board, geo, idx, CHAR_O);
    if (ptsO > bestPts) {
      bestPts = ptsO;
      bestIdx = idx;
      bestLetter = CHAR_O;
    }
  }

  if (bestPts === 0) {
    let safeCells = 0;
    let poisonedCells = 0;
    for (let i = 0; i < emptyCells.length; i++) {
      const idx = emptyCells[i];
      if (board[idx] !== EMPTY) continue;
      const safeS = countThreatsCreated(board, geo, idx, CHAR_S) === 0;
      const safeO = countThreatsCreated(board, geo, idx, CHAR_O) === 0;
      if (safeS || safeO) safeCells++;
      else poisonedCells++;
    }
    if (safeCells === 0) return -80 - poisonedCells * 8;
    if (safeCells === 1) return 50;
    return safeCells % 2 === 1 ? 15 : -15;
  }

  board[bestIdx] = bestLetter;
  const sub = quiesceChain(board, geo, emptyCells, emptyCount - 1, plyLeft - 1, ctx);
  board[bestIdx] = EMPTY;
  return bestPts * 100 + sub;
}

function alphaBetaEndgame(
  board: Uint8Array,
  geo: Geometria,
  emptyCells: number[],
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  keyHi: number,
  keyLo: number,
  emptyCount: number,
  ctx: { nodes: number; aborted: boolean }
): number {
  if (emptyCount === 0) return 0;
  if (ctx.nodes >= MAX_ALPHA_BETA_NODES) {
    ctx.aborted = true;
    return 0;
  }
  ctx.nodes++;

  const ttIdx = (keyHi ^ keyLo) & TT_MASK;
  const flag = ttFlag[ttIdx];
  const ttHit = flag !== 0 && ttKeyHi[ttIdx] === keyHi && ttKeyLo[ttIdx] === keyLo;
  let ttMove = -1;

  if (ttHit) {
    ttMove = ttBestMove[ttIdx];
    if (ttDepth[ttIdx] >= depth) {
      const stored = ttVal[ttIdx];
      if (flag === TT_EXACT) return stored;
      if (flag === TT_LOWER && stored > alpha) alpha = stored;
      else if (flag === TT_UPPER && stored < beta) beta = stored;
      if (alpha >= beta) return stored;
    }
  }

  if (depth <= 0) {
    return quiesceChain(board, geo, emptyCells, emptyCount, 6, ctx);
  }

  const codes = MOVE_CODES[ply];
  const prios = MOVE_PRIOS[ply];
  const ptsArr = MOVE_PTS[ply];
  let nMoves = 0;

  for (let i = 0; i < emptyCells.length; i++) {
    const idx = emptyCells[i];
    if (board[idx] !== EMPTY) continue;
    for (const letter of [CHAR_S, CHAR_O]) {
      const code = encodeMove(idx, letter);
      const pts = countImmediateSOS(board, geo, idx, letter);
      let prio: number;
      if (code === ttMove) {
        prio = 100_000;
      } else if (pts > 0) {
        prio = 50_000 + pts * 1_000;
      } else {
        const threats = countThreatsCreated(board, geo, idx, letter);
        prio = threats === 0 ? 10_000 : -threats * 100;
      }
      codes[nMoves] = code;
      prios[nMoves] = prio;
      ptsArr[nMoves] = pts;
      nMoves++;
    }
  }

  const origAlpha = alpha;
  let bestVal = -1_000_000;
  let bestCode = codes[0];

  // Ordenación por selección incremental (evita ordenar jugadas que se podan antes de mirarse)
  for (let i = 0; i < nMoves; i++) {
    let bestJ = i;
    let bestPrio = prios[i];
    for (let j = i + 1; j < nMoves; j++) {
      if (prios[j] > bestPrio) {
        bestPrio = prios[j];
        bestJ = j;
      }
    }
    if (bestJ !== i) {
      const tc = codes[i];
      codes[i] = codes[bestJ];
      codes[bestJ] = tc;
      const tp = prios[i];
      prios[i] = prios[bestJ];
      prios[bestJ] = tp;
      const tpts = ptsArr[i];
      ptsArr[i] = ptsArr[bestJ];
      ptsArr[bestJ] = tpts;
    }

    const code = codes[i];
    const pts = ptsArr[i];
    const idx = decodeCell(code);
    const letter = decodeLetter(code);

    const zIdx = idx * 3 + letter;
    const nextHi = (keyHi ^ geo.zobristHi[zIdx]) >>> 0;
    const nextLo = (keyLo ^ geo.zobristLo[zIdx]) >>> 0;

    board[idx] = letter;
    let val: number;
    if (pts > 0) {
      const gain = pts * 100;
      val =
        gain +
        alphaBetaEndgame(
          board,
          geo,
          emptyCells,
          depth - 1,
          ply + 1,
          alpha - gain,
          beta - gain,
          nextHi,
          nextLo,
          emptyCount - 1,
          ctx
        );
    } else {
      val = -alphaBetaEndgame(
        board,
        geo,
        emptyCells,
        depth - 1,
        ply + 1,
        -beta,
        -alpha,
        (nextHi ^ geo.turnHi) >>> 0,
        (nextLo ^ geo.turnLo) >>> 0,
        emptyCount - 1,
        ctx
      );
    }
    board[idx] = EMPTY;

    if (ctx.aborted) return bestVal;

    if (val > bestVal) {
      bestVal = val;
      bestCode = code;
    }
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }

  ttKeyHi[ttIdx] = keyHi >>> 0;
  ttKeyLo[ttIdx] = keyLo >>> 0;
  ttVal[ttIdx] = bestVal;
  ttDepth[ttIdx] = depth;
  ttBestMove[ttIdx] = bestCode;
  ttFlag[ttIdx] =
    bestVal <= origAlpha ? TT_UPPER : bestVal >= beta ? TT_LOWER : TT_EXACT;

  return bestVal;
}

function elegirEndgameAlfaBeta(
  board: Uint8Array,
  geo: Geometria,
  keyHi: number,
  keyLo: number,
  emptyCount: number,
  rng: Rng
): Move {
  ttFlag.fill(0);

  const emptyCells: number[] = [];
  const rootMoves: { code: number; idx: number; letter: number; pts: number; prio: number }[] = [];
  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    emptyCells.push(idx);
    for (const letter of [CHAR_S, CHAR_O]) {
      const pts = countImmediateSOS(board, geo, idx, letter);
      const threats = pts > 0 ? 0 : countThreatsCreated(board, geo, idx, letter);
      const prio =
        pts > 0
          ? 50_000 + pts * 1_000
          : threats === 0
            ? 10_000 + contarEnvenenamientoPotencial(board, geo, idx, letter)
            : -threats * 100;
      rootMoves.push({ code: encodeMove(idx, letter), idx, letter, pts, prio });
    }
  }
  rootMoves.sort((a, b) => b.prio - a.prio);

  let mejores: number[] = [rootMoves[0].code];
  const ctx = { nodes: 0, aborted: false };
  const startDepth = emptyCount <= 6 ? emptyCount : 4;

  for (let depth = startDepth; depth <= emptyCount; depth += 2) {
    ctx.aborted = false;
    let bestVal = -1_000_000;
    let candMejores: number[] = [];

    for (let i = 0; i < rootMoves.length; i++) {
      const m = rootMoves[i];
      const zIdx = m.idx * 3 + m.letter;
      const nextHi = (keyHi ^ geo.zobristHi[zIdx]) >>> 0;
      const nextLo = (keyLo ^ geo.zobristLo[zIdx]) >>> 0;

      board[m.idx] = m.letter;
      let val: number;
      if (m.pts > 0) {
        const gain = m.pts * 100;
        val =
          gain +
          alphaBetaEndgame(
            board,
            geo,
            emptyCells,
            depth - 1,
            1,
            -1_000_000,
            1_000_000,
            nextHi,
            nextLo,
            emptyCount - 1,
            ctx
          );
      } else {
        val = -alphaBetaEndgame(
          board,
          geo,
          emptyCells,
          depth - 1,
          1,
          -1_000_000,
          1_000_000,
          (nextHi ^ geo.turnHi) >>> 0,
          (nextLo ^ geo.turnLo) >>> 0,
          emptyCount - 1,
          ctx
        );
      }
      board[m.idx] = EMPTY;

      if (ctx.aborted) break;

      if (val > bestVal) {
        bestVal = val;
        candMejores = [m.code];
      } else if (val === bestVal) {
        candMejores.push(m.code);
      }
    }

    if (!ctx.aborted && candMejores.length > 0) {
      mejores = candMejores;
      const topCode = candMejores[0];
      const pos = rootMoves.findIndex(m => m.code === topCode);
      if (pos > 0) {
        const [item] = rootMoves.splice(pos, 1);
        rootMoves.unshift(item);
      }
    }
    if (ctx.aborted || ctx.nodes >= MAX_ALPHA_BETA_NODES) break;
  }

  const chosen = elegirAlAzar(mejores, rng);
  return aMove(decodeCell(chosen), decodeLetter(chosen), geo.size);
}

function evalPostCadena(board: Uint8Array, geo: Geometria, emptyCount: number): number {
  if (emptyCount === 0) return 0;
  const { safeCells, safeMoves, poisonedCells } = countSafeCellsAndMoves(board, geo);
  if (safeCells === 0) {
    return -minSacrificeChain(board, geo, emptyCount) * 1_000 - 200;
  }
  return 250 + poisonedCells * 5 + (safeCells % 2 === 1 ? 30 : 0) + Math.min(safeMoves, 20);
}

function buscarCadenaOptima(
  board: Uint8Array,
  geo: Geometria,
  emptyCount: number,
  budget: { nodes: number }
): number {
  if (emptyCount === 0 || budget.nodes <= 0) return 0;
  budget.nodes--;

  const sosMoves: { idx: number; letter: number; pts: number }[] = [];
  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    const ptsS = countImmediateSOS(board, geo, idx, CHAR_S);
    if (ptsS > 0) sosMoves.push({ idx, letter: CHAR_S, pts: ptsS });
    const ptsO = countImmediateSOS(board, geo, idx, CHAR_O);
    if (ptsO > 0) sosMoves.push({ idx, letter: CHAR_O, pts: ptsO });
  }

  if (sosMoves.length === 0) {
    return evalPostCadena(board, geo, emptyCount);
  }

  sosMoves.sort((a, b) => b.pts - a.pts);
  const limit = Math.min(4, sosMoves.length);
  let best = -Infinity;

  for (let i = 0; i < limit; i++) {
    const m = sosMoves[i];
    board[m.idx] = m.letter;
    const val = m.pts * 1_000 + buscarCadenaOptima(board, geo, emptyCount - 1, budget);
    board[m.idx] = EMPTY;
    if (val > best) best = val;
  }
  return best;
}

function evaluarMedioJuegoQuieto(board: Uint8Array, geo: Geometria): number {
  const { safeCells, poisonedCells } = countSafeCellsAndMoves(board, geo);
  if (safeCells === 0) {
    return -600 - poisonedCells * 10;
  }
  if (safeCells === 1) {
    return 450;
  }
  const parityBonus = safeCells <= 10 ? (safeCells % 2 === 1 ? 50 : -50) : 0;
  // Más casillas envenenadas => juego más agudo con cadenas en lugar de empate 0-0
  return poisonedCells * 12 + parityBonus;
}

function alphaBetaMedioJuego(
  board: Uint8Array,
  geo: Geometria,
  depth: number,
  alpha: number,
  beta: number,
  emptyCount: number
): number {
  if (emptyCount === 0) return 0;
  if (depth === 0) return evaluarMedioJuegoQuieto(board, geo);

  const cand: { idx: number; letter: number; score: number }[] = [];
  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    for (const letter of [CHAR_S, CHAR_O]) {
      if (countImmediateSOS(board, geo, idx, letter) > 0) continue;
      if (countThreatsCreated(board, geo, idx, letter) === 0) {
        const poison = contarEnvenenamientoPotencial(board, geo, idx, letter);
        cand.push({ idx, letter, score: poison - geo.distCentro[idx] });
      }
    }
  }

  if (cand.length === 0) {
    return -600;
  }

  cand.sort((a, b) => b.score - a.score);
  const limit = Math.min(6, cand.length);
  let best = -Infinity;

  for (let i = 0; i < limit; i++) {
    const m = cand[i];
    board[m.idx] = m.letter;
    const val = -alphaBetaMedioJuego(board, geo, depth - 1, -beta, -alpha, emptyCount - 1);
    board[m.idx] = EMPTY;
    if (val > best) best = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break;
  }
  return best;
}

function elegirDificil(state: SOSState, rng: Rng): Move {
  const geo = obtenerGeometria(state.size);
  const { board, emptyCount, keyHi, keyLo } = cargarTablero(state, geo);

  if (emptyCount === 0) {
    return { row: 0, col: 0, letter: 'S' };
  }

  if (emptyCount <= 10) {
    return elegirEndgameAlfaBeta(board, geo, keyHi, keyLo, emptyCount, rng);
  }

  // 1. Cadenas completas cuando hay SOS inmediatos
  const sosMoves: { idx: number; letter: number; pts: number }[] = [];
  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    const ptsS = countImmediateSOS(board, geo, idx, CHAR_S);
    if (ptsS > 0) sosMoves.push({ idx, letter: CHAR_S, pts: ptsS });
    const ptsO = countImmediateSOS(board, geo, idx, CHAR_O);
    if (ptsO > 0) sosMoves.push({ idx, letter: CHAR_O, pts: ptsO });
  }

  if (sosMoves.length > 0) {
    sosMoves.sort((a, b) => b.pts - a.pts);
    const limit = Math.min(6, sosMoves.length);
    let bestScore = -Infinity;
    let mejores: Move[] = [];
    const budget = { nodes: 240 };

    for (let i = 0; i < limit; i++) {
      const m = sosMoves[i];
      board[m.idx] = m.letter;
      const total = m.pts * 1_000 + buscarCadenaOptima(board, geo, emptyCount - 1, budget);
      board[m.idx] = EMPTY;
      if (total > bestScore) {
        bestScore = total;
        mejores = [aMove(m.idx, m.letter, geo.size)];
      } else if (total === bestScore) {
        mejores.push(aMove(m.idx, m.letter, geo.size));
      }
    }
    return elegirAlAzar(mejores, rng);
  }

  // 2. Sin SOS inmediatos: jugadas seguras que creen trampas/envenenen espacio y controlen paridad
  const safeMoves: { idx: number; letter: number; heuristic: number }[] = [];
  const allMoves: { idx: number; letter: number }[] = [];

  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    for (const letter of [CHAR_S, CHAR_O]) {
      allMoves.push({ idx, letter });
      if (countThreatsCreated(board, geo, idx, letter) === 0) {
        const poison = contarEnvenenamientoPotencial(board, geo, idx, letter);
        safeMoves.push({
          idx,
          letter,
          heuristic: poison * 3 - geo.distCentro[idx],
        });
      }
    }
  }

  if (safeMoves.length > 0) {
    // Si alguna jugada segura fuerza al rival a sacrificar de inmediato, tomarla maximizando el botín
    let bestForceVal = -Infinity;
    let forceMoves: Move[] = [];

    for (let i = 0; i < safeMoves.length; i++) {
      const m = safeMoves[i];
      board[m.idx] = m.letter;
      if (!hasAnySafeMove(board, geo)) {
        const oppSac = minSacrificeChain(board, geo, emptyCount - 1);
        if (oppSac > bestForceVal) {
          bestForceVal = oppSac;
          forceMoves = [aMove(m.idx, m.letter, geo.size)];
        } else if (oppSac === bestForceVal) {
          forceMoves.push(aMove(m.idx, m.letter, geo.size));
        }
      }
      board[m.idx] = EMPTY;
    }

    if (forceMoves.length > 0) {
      return elegirAlAzar(forceMoves, rng);
    }

    safeMoves.sort((a, b) => b.heuristic - a.heuristic);
    const topN = Math.min(8, safeMoves.length);
    const searchDepth = emptyCount <= 16 ? 3 : 2;
    let bestScore = -Infinity;
    let mejores: Move[] = [];

    for (let i = 0; i < topN; i++) {
      const m = safeMoves[i];
      board[m.idx] = m.letter;
      const ab = -alphaBetaMedioJuego(board, geo, searchDepth, -1_000_000, 1_000_000, emptyCount - 1);
      board[m.idx] = EMPTY;
      const val = ab * 10 + m.heuristic;

      if (val > bestScore) {
        bestScore = val;
        mejores = [aMove(m.idx, m.letter, geo.size)];
      } else if (val === bestScore) {
        mejores.push(aMove(m.idx, m.letter, geo.size));
      }
    }
    return elegirAlAzar(mejores, rng);
  }

  // 3. Solo quedan sacrificios: simular la cadena mínima entregada al rival
  let minOppChain = Infinity;
  let mejoresSac: Move[] = [];

  for (let i = 0; i < allMoves.length; i++) {
    const m = allMoves[i];
    board[m.idx] = m.letter;
    const oppChain = simularCadenaMaxima(board, geo, emptyCount - 1, { nodes: 60 });
    board[m.idx] = EMPTY;

    if (oppChain < minOppChain) {
      minOppChain = oppChain;
      mejoresSac = [aMove(m.idx, m.letter, geo.size)];
    } else if (oppChain === minOppChain) {
      mejoresSac.push(aMove(m.idx, m.letter, geo.size));
    }
  }

  return elegirAlAzar(mejoresSac, rng);
}

/**
 * Elige la siguiente jugada del bot de SOS según la dificultad indicada.
 */
export function elegirMovimiento(
  state: SOSState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Move {
  if (dificultad === 'dificil') {
    return elegirDificil(state, rng);
  }

  const geo = obtenerGeometria(state.size);
  const { board } = cargarTablero(state, geo);

  const sosMoves: { idx: number; letter: number; pts: number }[] = [];
  const nonSosMoves: { idx: number; letter: number }[] = [];

  for (let idx = 0; idx < geo.total; idx++) {
    if (board[idx] !== EMPTY) continue;
    for (const letter of [CHAR_S, CHAR_O]) {
      const pts = countImmediateSOS(board, geo, idx, letter);
      if (pts > 0) {
        sosMoves.push({ idx, letter, pts });
      } else {
        nonSosMoves.push({ idx, letter });
      }
    }
  }

  if (sosMoves.length === 0 && nonSosMoves.length === 0) {
    return { row: 0, col: 0, letter: 'S' };
  }

  if (dificultad === 'facil') {
    if (sosMoves.length > 0 && (nonSosMoves.length === 0 || rng() < 0.45)) {
      const chosen = elegirAlAzar(sosMoves, rng);
      return aMove(chosen.idx, chosen.letter, geo.size);
    }
    const chosen = elegirAlAzar(nonSosMoves.length > 0 ? nonSosMoves : sosMoves, rng);
    return aMove(chosen.idx, chosen.letter, geo.size);
  }

  // Medio:
  if (sosMoves.length > 0) {
    let maxPts = 0;
    for (const m of sosMoves) {
      if (m.pts > maxPts) maxPts = m.pts;
    }
    const mejores = sosMoves.filter(m => m.pts === maxPts);
    const chosen = elegirAlAzar(mejores, rng);
    return aMove(chosen.idx, chosen.letter, geo.size);
  }

  const safeMoves = nonSosMoves.filter(
    m => countThreatsCreated(board, geo, m.idx, m.letter) === 0
  );
  if (safeMoves.length > 0) {
    const chosen = elegirAlAzar(safeMoves, rng);
    return aMove(chosen.idx, chosen.letter, geo.size);
  }

  let minMaxOpp = Infinity;
  let minOppThreats = Infinity;
  let mejoresSac: { idx: number; letter: number }[] = [];

  for (const m of nonSosMoves) {
    board[m.idx] = m.letter;
    let maxOpp = 0;
    let oppCount = 0;
    for (let idx = 0; idx < geo.total; idx++) {
      if (board[idx] !== EMPTY) continue;
      const pS = countImmediateSOS(board, geo, idx, CHAR_S);
      if (pS > 0) {
        oppCount++;
        if (pS > maxOpp) maxOpp = pS;
      }
      const pO = countImmediateSOS(board, geo, idx, CHAR_O);
      if (pO > 0) {
        oppCount++;
        if (pO > maxOpp) maxOpp = pO;
      }
    }
    board[m.idx] = EMPTY;

    if (
      maxOpp < minMaxOpp ||
      (maxOpp === minMaxOpp && oppCount < minOppThreats)
    ) {
      minMaxOpp = maxOpp;
      minOppThreats = oppCount;
      mejoresSac = [m];
    } else if (maxOpp === minMaxOpp && oppCount === minOppThreats) {
      mejoresSac.push(m);
    }
  }

  const chosen = elegirAlAzar(mejoresSac, rng);
  return aMove(chosen.idx, chosen.letter, geo.size);
}
