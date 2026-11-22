import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import type { CellValue, Move, NotaktoState } from './engine';

const NUM_BOARDS = 3;
const NUM_CELLS = 9;
const NUM_MASKS = 1 << NUM_CELLS; // 512

const LINE_MASKS = [
  0b000000111, // fila 0: 0,1,2
  0b000111000, // fila 1: 3,4,5
  0b111000000, // fila 2: 6,7,8
  0b001001001, // col 0: 0,3,6
  0b010010010, // col 1: 1,4,7
  0b100100100, // col 2: 2,5,8
  0b100010001, // diag principal: 0,4,8
  0b001010100, // diag inversa: 2,4,6
] as const;

// 8 simetrías del grupo diedral D4 sobre un tablero 3×3 (índices 0..8).
const D4_SYMS: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
  [6, 3, 0, 7, 4, 1, 8, 5, 2],
  [8, 7, 6, 5, 4, 3, 2, 1, 0],
  [2, 5, 8, 1, 4, 7, 0, 3, 6],
  [2, 1, 0, 5, 4, 3, 8, 7, 6],
  [6, 7, 8, 3, 4, 5, 0, 1, 2],
  [0, 3, 6, 1, 4, 7, 2, 5, 8],
  [8, 5, 2, 7, 4, 1, 6, 3, 0],
];

const IS_DEAD_MASK = new Uint8Array(NUM_MASKS);
const POPCOUNT = new Uint8Array(NUM_MASKS);
const SAFE_CELL_COUNT = new Uint8Array(NUM_MASKS);
const THREAT_COUNT = new Uint8Array(NUM_MASKS);

for (let m = 0; m < NUM_MASKS; m++) {
  let pop = 0;
  for (let i = 0; i < NUM_CELLS; i++) {
    if (m & (1 << i)) pop++;
  }
  POPCOUNT[m] = pop;

  let dead = false;
  for (let l = 0; l < LINE_MASKS.length; l++) {
    if ((m & LINE_MASKS[l]) === LINE_MASKS[l]) {
      dead = true;
      break;
    }
  }
  IS_DEAD_MASK[m] = dead ? 1 : 0;
}

for (let m = 0; m < NUM_MASKS; m++) {
  if (IS_DEAD_MASK[m]) continue;
  let safe = 0;
  let threats = 0;
  for (let i = 0; i < NUM_CELLS; i++) {
    if (m & (1 << i)) continue;
    if (IS_DEAD_MASK[m | (1 << i)]) {
      threats++;
    } else {
      safe++;
    }
  }
  SAFE_CELL_COUNT[m] = safe;
  THREAT_COUNT[m] = threats;
}

// Tabla lazy del solver exacto en misère sobre formas canónicas D4.
let dpInicializada = false;
let numCanonIds = 0;
let maskToCanonId: Uint8Array;
let dpWin: Uint8Array;

function canonizarMascara(m: number): number {
  let mejor = NUM_MASKS;
  for (let s = 0; s < D4_SYMS.length; s++) {
    const sym = D4_SYMS[s];
    let r = 0;
    for (let i = 0; i < NUM_CELLS; i++) {
      if (m & (1 << i)) r |= 1 << sym[i];
    }
    if (r < mejor) mejor = r;
  }
  return mejor;
}

function indiceTriple(a: number, b: number, c: number, n: number): number {
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  if (b > c) {
    const t = b;
    b = c;
    c = t;
  }
  if (a > b) {
    const t = a;
    a = b;
    b = t;
  }
  // Almacenar indexado por (c * n + b) * n + a con a <= b <= c
  return (c * n + b) * n + a;
}

function asegurarTablaDP(): void {
  if (dpInicializada) return;

  const repToRawMask: number[] = [];
  const rawMaskToGroup = new Int16Array(NUM_MASKS).fill(-1);

  for (let m = 0; m < NUM_MASKS; m++) {
    if (IS_DEAD_MASK[m]) continue;
    const minM = canonizarMascara(m);
    if (minM === m) {
      rawMaskToGroup[m] = repToRawMask.length;
      repToRawMask.push(m);
    } else {
      rawMaskToGroup[m] = rawMaskToGroup[minM];
    }
  }

  // Ordenar los IDs canónicos vivos por popcount DESCENDENTE (id 0 reservado para tablero muerto).
  // Así toda transición id -> nextId cumple estrictamente nextId < id.
  const indicesOrdenados = repToRawMask
    .map((_, idx) => idx)
    .sort((i, j) => POPCOUNT[repToRawMask[j]] - POPCOUNT[repToRawMask[i]] || i - j);

  const groupToId = new Uint8Array(repToRawMask.length);
  const idToMask = new Uint16Array(repToRawMask.length + 1);
  for (let pos = 0; pos < indicesOrdenados.length; pos++) {
    const id = pos + 1;
    const group = indicesOrdenados[pos];
    groupToId[group] = id;
    idToMask[id] = repToRawMask[group];
  }

  const n = repToRawMask.length + 1;
  numCanonIds = n;
  maskToCanonId = new Uint8Array(NUM_MASKS);
  for (let m = 0; m < NUM_MASKS; m++) {
    maskToCanonId[m] = IS_DEAD_MASK[m] ? 0 : groupToId[rawMaskToGroup[m]];
  }

  // Transiciones únicas desde cada id canónico (máximo 9)
  const transData = new Uint8Array(n * NUM_CELLS);
  const transLen = new Uint8Array(n);
  const vista = new Uint8Array(n);
  let marca = 1;

  for (let id = 1; id < n; id++) {
    const m = idToMask[id];
    const base = id * NUM_CELLS;
    let count = 0;
    marca++;
    for (let i = 0; i < NUM_CELLS; i++) {
      if (m & (1 << i)) continue;
      const nid = maskToCanonId[m | (1 << i)];
      if (vista[nid] !== marca) {
        vista[nid] = marca;
        transData[base + count++] = nid;
      }
    }
    transLen[id] = count;
  }

  const win = new Uint8Array(n * n * n);
  const n2 = n * n;
  // (0, 0, 0): quien tiene el turno ya vio morir el último tablero en la jugada rival -> GANA.
  win[0] = 1;

  // Orden topológico: como nextId < id siempre, iterar c >= b >= a garantiza
  // que cualquier sucesor ordenado (a', b', c') ya fue calculado antes que (a, b, c).
  for (let c = 1; c < n; c++) {
    const baseC = c * n2;
    const lenC = transLen[c];
    const tBaseC = c * NUM_CELLS;

    for (let b = 0; b <= c; b++) {
      const baseCB = baseC + b * n;
      const lenB = transLen[b];
      const tBaseB = b * NUM_CELLS;

      for (let a = 0; a <= b; a++) {
        let gana = 0;

        const lenA = transLen[a];
        const tBaseA = a * NUM_CELLS;
        for (let k = 0; k < lenA; k++) {
          if (!win[indiceTriple(transData[tBaseA + k], b, c, n)]) {
            gana = 1;
            break;
          }
        }

        if (!gana && lenB > 0) {
          for (let k = 0; k < lenB; k++) {
            if (!win[indiceTriple(a, transData[tBaseB + k], c, n)]) {
              gana = 1;
              break;
            }
          }
        }

        if (!gana && lenC > 0) {
          for (let k = 0; k < lenC; k++) {
            if (!win[indiceTriple(a, b, transData[tBaseC + k], n)]) {
              gana = 1;
              break;
            }
          }
        }

        win[baseCB + a] = gana;
      }
    }
  }

  dpWin = win;
  dpInicializada = true;
}

function boardToMask(board: readonly CellValue[]): number {
  let mask = 0;
  for (let i = 0; i < NUM_CELLS; i++) {
    if (board[i] === 'X') mask |= 1 << i;
  }
  return mask;
}

function extraerEstado(state: NotaktoState): {
  masks: [number, number, number];
  dead: [boolean, boolean, boolean];
  liveCount: number;
} {
  const masks: [number, number, number] = [
    boardToMask(state.boards[0]),
    boardToMask(state.boards[1]),
    boardToMask(state.boards[2]),
  ];
  const dead: [boolean, boolean, boolean] = [
    state.deadBoards[0] || IS_DEAD_MASK[masks[0]] === 1,
    state.deadBoards[1] || IS_DEAD_MASK[masks[1]] === 1,
    state.deadBoards[2] || IS_DEAD_MASK[masks[2]] === 1,
  ];
  const liveCount = (dead[0] ? 0 : 1) + (dead[1] ? 0 : 1) + (dead[2] ? 0 : 1);
  return { masks, dead, liveCount };
}

function listarLegales(
  masks: readonly [number, number, number],
  dead: readonly [boolean, boolean, boolean]
): Move[] {
  const moves: Move[] = [];
  for (let board = 0; board < NUM_BOARDS; board++) {
    if (dead[board]) continue;
    const m = masks[board];
    for (let cell = 0; cell < NUM_CELLS; cell++) {
      if ((m & (1 << cell)) === 0) {
        moves.push({ board, cell });
      }
    }
  }
  return moves;
}

function esSuicida(
  move: Move,
  masks: readonly [number, number, number],
  liveCount: number
): boolean {
  if (liveCount !== 1) return false;
  return IS_DEAD_MASK[masks[move.board] | (1 << move.cell)] === 1;
}

function contarJugadasSeguras(
  m0: number,
  d0: boolean,
  m1: number,
  d1: boolean,
  m2: number,
  d2: boolean
): number {
  const live = (d0 ? 0 : 1) + (d1 ? 0 : 1) + (d2 ? 0 : 1);
  if (live === 0) return 0;
  if (live > 1) {
    return (
      (d0 ? 0 : NUM_CELLS - POPCOUNT[m0]) +
      (d1 ? 0 : NUM_CELLS - POPCOUNT[m1]) +
      (d2 ? 0 : NUM_CELLS - POPCOUNT[m2])
    );
  }
  if (!d0) return SAFE_CELL_COUNT[m0];
  if (!d1) return SAFE_CELL_COUNT[m1];
  return SAFE_CELL_COUNT[m2];
}

function evaluarHeuristica(
  m0: number,
  d0: boolean,
  m1: number,
  d1: boolean,
  m2: number,
  d2: boolean
): number {
  const live = (d0 ? 0 : 1) + (d1 ? 0 : 1) + (d2 ? 0 : 1);
  if (live === 0) return 100_000;

  const seguras = contarJugadasSeguras(m0, d0, m1, d1, m2, d2);
  if (seguras === 0) return -50_000;

  // En 1 solo tablero vivo con exactamente 1 jugada segura, jugar esa casilla gana en 1 turno.
  if (live === 1 && seguras === 1) return 20_000;

  let score = 0;
  if (live === 1) {
    score += seguras % 2 === 1 ? 30 : -20;
    if (seguras <= 3) score += 10;
  } else if (live === 3) {
    score += 12;
  } else {
    score -= 6;
  }

  let amenazas = 0;
  let centros = 0;
  if (!d0) {
    amenazas += THREAT_COUNT[m0];
    if (m0 & (1 << 4)) centros++;
  }
  if (!d1) {
    amenazas += THREAT_COUNT[m1];
    if (m1 & (1 << 4)) centros++;
  }
  if (!d2) {
    amenazas += THREAT_COUNT[m2];
    if (m2 & (1 << 4)) centros++;
  }

  return score + seguras * 2 + centros * 3 - amenazas * 3;
}

function puntuar2Plies(
  masks: readonly [number, number, number],
  dead: readonly [boolean, boolean, boolean],
  move: Move
): number {
  const n0 = move.board === 0 ? masks[0] | (1 << move.cell) : masks[0];
  const n1 = move.board === 1 ? masks[1] | (1 << move.cell) : masks[1];
  const n2 = move.board === 2 ? masks[2] | (1 << move.cell) : masks[2];
  const nd0 = dead[0] || IS_DEAD_MASK[n0] === 1;
  const nd1 = dead[1] || IS_DEAD_MASK[n1] === 1;
  const nd2 = dead[2] || IS_DEAD_MASK[n2] === 1;

  const live1 = (nd0 ? 0 : 1) + (nd1 ? 0 : 1) + (nd2 ? 0 : 1);
  if (live1 === 0) return -100_000;

  // Si el rival ya no tiene ninguna jugada que no mate el último tablero vivo, victoria forzada.
  if (contarJugadasSeguras(n0, nd0, n1, nd1, n2, nd2) === 0) {
    return 100_000;
  }

  let peorParaMi = Infinity;
  const nMasks: [number, number, number] = [n0, n1, n2];
  const nDead: [boolean, boolean, boolean] = [nd0, nd1, nd2];

  for (let b = 0; b < NUM_BOARDS; b++) {
    if (nDead[b]) continue;
    const m = nMasks[b];
    for (let cell = 0; cell < NUM_CELLS; cell++) {
      if (m & (1 << cell)) continue;
      const nm = m | (1 << cell);
      const mata = IS_DEAD_MASK[nm] === 1;
      if (live1 === 1 && mata) continue;

      const a0 = b === 0 ? nm : n0;
      const a1 = b === 1 ? nm : n1;
      const a2 = b === 2 ? nm : n2;
      const ad0 = nd0 || (b === 0 && mata);
      const ad1 = nd1 || (b === 1 && mata);
      const ad2 = nd2 || (b === 2 && mata);

      const val = evaluarHeuristica(a0, ad0, a1, ad1, a2, ad2);
      if (val < peorParaMi) peorParaMi = val;
    }
  }

  return peorParaMi === Infinity ? 100_000 : peorParaMi;
}

function elegirFacil(
  masks: readonly [number, number, number],
  liveCount: number,
  legales: readonly Move[],
  rng: Rng
): Move {
  if (liveCount !== 1) return elegirAlAzar(legales, rng);

  const seguras: Move[] = [];
  const suicidas: Move[] = [];
  for (let i = 0; i < legales.length; i++) {
    const mov = legales[i];
    if (esSuicida(mov, masks, liveCount)) {
      suicidas.push(mov);
    } else {
      seguras.push(mov);
    }
  }

  if (seguras.length > 0 && suicidas.length > 0) {
    return rng() < 0.65 ? elegirAlAzar(seguras, rng) : elegirAlAzar(suicidas, rng);
  }
  return elegirAlAzar(legales, rng);
}

function elegirMedio(
  masks: readonly [number, number, number],
  dead: readonly [boolean, boolean, boolean],
  liveCount: number,
  legales: readonly Move[],
  rng: Rng
): Move {
  const candidatas =
    liveCount === 1
      ? legales.filter(mov => !esSuicida(mov, masks, liveCount))
      : legales;

  if (candidatas.length === 0) return elegirAlAzar(legales, rng);
  if (candidatas.length === 1) return candidatas[0];

  let mejorScore = -Infinity;
  let mejores: Move[] = [];

  for (let i = 0; i < candidatas.length; i++) {
    const mov = candidatas[i];
    const score = puntuar2Plies(masks, dead, mov);
    if (score > mejorScore) {
      mejorScore = score;
      mejores = [mov];
    } else if (score === mejorScore) {
      mejores.push(mov);
    }
  }

  return elegirAlAzar(mejores, rng);
}

function elegirDificil(
  masks: readonly [number, number, number],
  dead: readonly [boolean, boolean, boolean],
  liveCount: number,
  legales: readonly Move[],
  rng: Rng
): Move {
  asegurarTablaDP();

  const cid0 = dead[0] ? 0 : maskToCanonId[masks[0]];
  const cid1 = dead[1] ? 0 : maskToCanonId[masks[1]];
  const cid2 = dead[2] ? 0 : maskToCanonId[masks[2]];

  const ganadoras: Move[] = [];
  for (let i = 0; i < legales.length; i++) {
    const mov = legales[i];
    const n0 = mov.board === 0 ? maskToCanonId[masks[0] | (1 << mov.cell)] : cid0;
    const n1 = mov.board === 1 ? maskToCanonId[masks[1] | (1 << mov.cell)] : cid1;
    const n2 = mov.board === 2 ? maskToCanonId[masks[2] | (1 << mov.cell)] : cid2;

    // Gana si el estado resultante es posición P (rival tiene win = 0)
    if (dpWin[indiceTriple(n0, n1, n2, numCanonIds)] === 0) {
      ganadoras.push(mov);
    }
  }

  if (ganadoras.length > 0) {
    return elegirAlAzar(ganadoras, rng);
  }

  // En posición teóricamente perdedora (contra J1 perfecto o estado P), evitar
  // suicidio inmediato y elegir la jugada más resistente a 2 plies para maximizar errores rivales.
  return elegirMedio(masks, dead, liveCount, legales, rng);
}

/**
 * Elige la siguiente jugada del bot de Notakto según la dificultad indicada.
 */
export function elegirMovimiento(
  state: NotaktoState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Move {
  const { masks, dead, liveCount } = extraerEstado(state);
  const legales = listarLegales(masks, dead);
  if (legales.length === 0) return { board: 0, cell: 0 };

  if (dificultad === 'facil') {
    return elegirFacil(masks, liveCount, legales, rng);
  }
  if (dificultad === 'medio') {
    return elegirMedio(masks, dead, liveCount, legales, rng);
  }
  return elegirDificil(masks, dead, liveCount, legales, rng);
}
