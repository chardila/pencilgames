import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, vecinas, type Player, type SnortState } from './engine';

const TOTAL = TAMANO * TAMANO;
const HALF_MASK = (1 << 18) - 1;

const POPCOUNT_9 = new Uint8Array(512);
for (let i = 1; i < 512; i++) {
  POPCOUNT_9[i] = POPCOUNT_9[i >> 1] + (i & 1);
}

const VECINOS: readonly Uint8Array[] = Array.from({ length: TOTAL }, (_, idx) =>
  Uint8Array.from(vecinas(idx))
);

const NEIGH_LO = new Int32Array(TOTAL);
const NEIGH_HI = new Int32Array(TOTAL);
const CLR_SELF_LO = new Int32Array(TOTAL);
const CLR_SELF_HI = new Int32Array(TOTAL);
const CLR_CLOSED_LO = new Int32Array(TOTAL);
const CLR_CLOSED_HI = new Int32Array(TOTAL);

for (let idx = 0; idx < TOTAL; idx++) {
  const selfLo = idx < 18 ? 1 << idx : 0;
  const selfHi = idx >= 18 ? 1 << (idx - 18) : 0;
  let nLo = 0;
  let nHi = 0;
  const vs = VECINOS[idx];
  for (let k = 0; k < vs.length; k++) {
    const v = vs[k];
    if (v < 18) nLo |= 1 << v;
    else nHi |= 1 << (v - 18);
  }
  NEIGH_LO[idx] = nLo;
  NEIGH_HI[idx] = nHi;
  CLR_SELF_LO[idx] = HALF_MASK ^ selfLo;
  CLR_SELF_HI[idx] = HALF_MASK ^ selfHi;
  CLR_CLOSED_LO[idx] = HALF_MASK ^ (selfLo | nLo);
  CLR_CLOSED_HI[idx] = HALF_MASK ^ (selfHi | nHi);
}

const CENTRO_PESO = Int8Array.from({ length: TOTAL }, (_, idx) => {
  const fila = Math.floor(idx / TAMANO);
  const col = idx % TAMANO;
  const dist = Math.abs(fila - 2.5) + Math.abs(col - 2.5);
  return Math.round((5 - dist) * 2);
});

// Scratches reutilizables sobre Uint8Array(36) sin asignaciones en hojas ni nodos.
const BOARD_U8 = new Uint8Array(TOTAL);
const VISITED_U8 = new Uint8Array(TOTAL);
const COMP_QUEUE = new Uint8Array(TOTAL);
const MOVE_SCORE_SCRATCH = new Int32Array(TOTAL);

function popcount18(mask: number): number {
  return POPCOUNT_9[mask & 0x1ff] + POPCOUNT_9[(mask >> 9) & 0x1ff];
}

function popcount36(lo: number, hi: number): number {
  return popcount18(lo) + popcount18(hi);
}

function tieneBit(lo: number, hi: number, idx: number): boolean {
  return idx < 18 ? (lo & (1 << idx)) !== 0 : (hi & (1 << (idx - 18))) !== 0;
}

function listarIndices(lo: number, hi: number): number[] {
  const res: number[] = [];
  let b = lo;
  while (b !== 0) {
    const lsb = b & -b;
    res.push(31 - Math.clz32(lsb));
    b ^= lsb;
  }
  b = hi;
  while (b !== 0) {
    const lsb = b & -b;
    res.push(49 - Math.clz32(lsb));
    b ^= lsb;
  }
  return res;
}

function extraerMascaras(state: SnortState): {
  l1Lo: number;
  l1Hi: number;
  l2Lo: number;
  l2Hi: number;
} {
  let l1Lo = HALF_MASK;
  let l1Hi = HALF_MASK;
  let l2Lo = HALF_MASK;
  let l2Hi = HALF_MASK;

  for (let i = 0; i < TOTAL; i++) {
    const c = state.board[i];
    if (c === null) {
      BOARD_U8[i] = 0;
    } else if (c === 1) {
      BOARD_U8[i] = 1;
      l1Lo &= CLR_SELF_LO[i];
      l1Hi &= CLR_SELF_HI[i];
      l2Lo &= CLR_CLOSED_LO[i];
      l2Hi &= CLR_CLOSED_HI[i];
    } else {
      BOARD_U8[i] = 2;
      l2Lo &= CLR_SELF_LO[i];
      l2Hi &= CLR_SELF_HI[i];
      l1Lo &= CLR_CLOSED_LO[i];
      l1Hi &= CLR_CLOSED_HI[i];
    }
  }

  return { l1Lo, l1Hi, l2Lo, l2Hi };
}

function tieneVictoriaEn1(
  yoLo: number,
  yoHi: number,
  riLo: number,
  riHi: number
): boolean {
  let b = yoLo;
  while (b !== 0) {
    const lsb = b & -b;
    const m = 31 - Math.clz32(lsb);
    if ((riLo & CLR_CLOSED_LO[m]) === 0 && (riHi & CLR_CLOSED_HI[m]) === 0) {
      return true;
    }
    b ^= lsb;
  }
  b = yoHi;
  while (b !== 0) {
    const lsb = b & -b;
    const m = 49 - Math.clz32(lsb);
    if ((riLo & CLR_CLOSED_LO[m]) === 0 && (riHi & CLR_CLOSED_HI[m]) === 0) {
      return true;
    }
    b ^= lsb;
  }
  return false;
}

function esSeguraContraExcl(
  idx: number,
  riLo: number,
  riHi: number
): boolean {
  return (NEIGH_LO[idx] & riLo) === 0 && (NEIGH_HI[idx] & riHi) === 0;
}

function contarSegurasYContendidas(
  exclLo: number,
  exclHi: number,
  riLo: number,
  riHi: number
): { seguras: number; contendidas: number; seguridadLocal: number } {
  let seguras = 0;
  let contendidas = 0;
  let seguridadLocal = 0;

  let b = exclLo;
  while (b !== 0) {
    const lsb = b & -b;
    const c = 31 - Math.clz32(lsb);
    const amenazas = popcount36(NEIGH_LO[c] & riLo, NEIGH_HI[c] & riHi);
    if (amenazas === 0) {
      seguras++;
    } else {
      contendidas++;
      seguridadLocal += 4 - amenazas;
    }
    b ^= lsb;
  }

  b = exclHi;
  while (b !== 0) {
    const lsb = b & -b;
    const c = 49 - Math.clz32(lsb);
    const amenazas = popcount36(NEIGH_LO[c] & riLo, NEIGH_HI[c] & riHi);
    if (amenazas === 0) {
      seguras++;
    } else {
      contendidas++;
      seguridadLocal += 4 - amenazas;
    }
    b ^= lsb;
  }

  return { seguras, contendidas, seguridadLocal };
}

/**
 * Evaluación heurística de 1 ply para Medio:
 * diferencia de casillas exclusivas (priorizando las seguras) y movilidad.
 */
function puntuarMedio1Ply(
  nYoLo: number,
  nYoHi: number,
  nRiLo: number,
  nRiHi: number
): number {
  const exclYoLo = nYoLo & ~nRiLo;
  const exclYoHi = nYoHi & ~nRiHi;
  const exclRiLo = nRiLo & ~nYoLo;
  const exclRiHi = nRiHi & ~nYoHi;

  const infoYo = contarSegurasYContendidas(exclYoLo, exclYoHi, nRiLo, nRiHi);
  const infoRi = contarSegurasYContendidas(exclRiLo, exclRiHi, nYoLo, nYoHi);

  const movYo = popcount36(nYoLo, nYoHi);
  const movRi = popcount36(nRiLo, nRiHi);

  return (
    (infoYo.seguras - infoRi.seguras) * 4 +
    (infoYo.contendidas - infoRi.contendidas) * 2 +
    (movYo - movRi)
  );
}

/**
 * Evaluación estática para Difícil:
 * casillas exclusivas seguras/contendidas + paridad de componentes compartidos.
 */
function evaluarTablero(
  yoLo: number,
  yoHi: number,
  riLo: number,
  riHi: number
): number {
  if (yoLo === 0 && yoHi === 0) return -100_000;
  if (riLo === 0 && riHi === 0) return 100_000;

  const exclYoLo = yoLo & ~riLo;
  const exclYoHi = yoHi & ~riHi;
  const exclRiLo = riLo & ~yoLo;
  const exclRiHi = riHi & ~yoHi;

  const infoYo = contarSegurasYContendidas(exclYoLo, exclYoHi, riLo, riHi);
  const infoRi = contarSegurasYContendidas(exclRiLo, exclRiHi, yoLo, yoHi);

  const sharedLo = yoLo & riLo;
  const sharedHi = yoHi & riHi;
  const sharedCount = popcount36(sharedLo, sharedHi);

  // Sin territorio disputado: el ganador queda determinado por casillas seguras.
  if (
    sharedCount === 0 &&
    infoYo.contendidas === 0 &&
    infoRi.contendidas === 0
  ) {
    const diff = infoYo.seguras - infoRi.seguras;
    return diff > 0 ? 90_000 + diff : -90_000 + diff;
  }

  // Analizar componentes conexos de casillas compartidas sobre scratch Uint8Array(36).
  let pureStars = 0;
  let comp2Count = 0;
  let sharedCompParity = 0;

  if (sharedCount > 0) {
    VISITED_U8.fill(0);
    for (let i = 0; i < TOTAL; i++) {
      if (VISITED_U8[i] !== 0 || !tieneBit(sharedLo, sharedHi, i)) continue;
      let head = 0;
      let tail = 0;
      COMP_QUEUE[tail++] = i;
      VISITED_U8[i] = 1;
      let touchesExcl = false;

      while (head < tail) {
        const cur = COMP_QUEUE[head++];
        const nLo = NEIGH_LO[cur];
        const nHi = NEIGH_HI[cur];
        if (
          (nLo & (exclYoLo | exclRiLo)) !== 0 ||
          (nHi & (exclYoHi | exclRiHi)) !== 0
        ) {
          touchesExcl = true;
        }
        const vs = VECINOS[cur];
        for (let k = 0; k < vs.length; k++) {
          const v = vs[k];
          if (VISITED_U8[v] === 0 && tieneBit(sharedLo, sharedHi, v)) {
            VISITED_U8[v] = 1;
            COMP_QUEUE[tail++] = v;
          }
        }
      }

      if (tail === 1 && !touchesExcl) {
        pureStars++;
      } else if (tail === 2 && !touchesExcl) {
        comp2Count++;
      } else if ((tail & 1) === 1) {
        sharedCompParity ^= 1;
      }
    }
  }

  let score =
    (infoYo.seguras - infoRi.seguras) * 120 +
    (infoYo.contendidas - infoRi.contendidas) * 45 +
    (infoYo.seguridadLocal - infoRi.seguridadLocal) * 5;

  if (pureStars > 0) {
    score += (pureStars & 1) === 1 ? 32 : -18;
  }
  if (comp2Count > 0) {
    score += (comp2Count & 1) === 1 ? 55 : 14;
  }
  if (sharedCompParity !== 0) {
    score += 16;
  }
  if (sharedCount > 0) {
    score += 12;
  }

  return score;
}

function claveEstado(
  yoLo: number,
  yoHi: number,
  riLo: number,
  riHi: number
): bigint {
  return (
    BigInt(yoLo) |
    (BigInt(yoHi) << 18n) |
    (BigInt(riLo) << 36n) |
    (BigInt(riHi) << 54n)
  );
}

function obtenerMovimientosOrdenados(
  yoLo: number,
  yoHi: number,
  riLo: number,
  riHi: number,
  dedupSeguras: boolean
): number[] {
  const exclYoLo = yoLo & ~riLo;
  const exclYoHi = yoHi & ~riHi;
  const movs: number[] = [];
  let seguraAgregada = false;

  let b = yoLo;
  while (b !== 0) {
    const lsb = b & -b;
    const m = 31 - Math.clz32(lsb);
    b ^= lsb;

    const esSegura =
      tieneBit(exclYoLo, exclYoHi, m) && esSeguraContraExcl(m, riLo, riHi);
    if (dedupSeguras && esSegura) {
      if (seguraAgregada) continue;
      seguraAgregada = true;
    }

    const kills = popcount36(NEIGH_LO[m] & riLo, NEIGH_HI[m] & riHi);
    const shared = tieneBit(riLo, riHi, m) ? 2 : 0;
    MOVE_SCORE_SCRATCH[m] = esSegura
      ? -100 + CENTRO_PESO[m]
      : (kills + shared) * 16 + CENTRO_PESO[m];
    movs.push(m);
  }

  b = yoHi;
  while (b !== 0) {
    const lsb = b & -b;
    const m = 49 - Math.clz32(lsb);
    b ^= lsb;

    const esSegura =
      tieneBit(exclYoLo, exclYoHi, m) && esSeguraContraExcl(m, riLo, riHi);
    if (dedupSeguras && esSegura) {
      if (seguraAgregada) continue;
      seguraAgregada = true;
    }

    const kills = popcount36(NEIGH_LO[m] & riLo, NEIGH_HI[m] & riHi);
    const shared = tieneBit(riLo, riHi, m) ? 2 : 0;
    MOVE_SCORE_SCRATCH[m] = esSegura
      ? -100 + CENTRO_PESO[m]
      : (kills + shared) * 16 + CENTRO_PESO[m];
    movs.push(m);
  }

  movs.sort((a, bIdx) => MOVE_SCORE_SCRATCH[bIdx] - MOVE_SCORE_SCRATCH[a]);
  return movs;
}

/**
 * Solver exacto para finales con <= 12 casillas jugables.
 * Colapsa todas las casillas seguras en una única jugada representativa.
 */
function esGanadoraExacta(
  yoLo: number,
  yoHi: number,
  riLo: number,
  riHi: number,
  memoExacto: Map<bigint, boolean>
): boolean {
  if (yoLo === 0 && yoHi === 0) return false;
  if (riLo === 0 && riHi === 0) return true;

  if (tieneVictoriaEn1(yoLo, yoHi, riLo, riHi)) return true;

  const exclYoLo = yoLo & ~riLo;
  const exclYoHi = yoHi & ~riHi;
  const exclRiLo = riLo & ~yoLo;
  const exclRiHi = riHi & ~yoHi;

  const infoYo = contarSegurasYContendidas(exclYoLo, exclYoHi, riLo, riHi);
  const infoRi = contarSegurasYContendidas(exclRiLo, exclRiHi, yoLo, yoHi);

  // Si no quedan casillas disputadas, el resultado es exacto por conteo de seguras.
  if (
    (yoLo & riLo) === 0 &&
    (yoHi & riHi) === 0 &&
    infoYo.contendidas === 0 &&
    infoRi.contendidas === 0
  ) {
    return infoYo.seguras > infoRi.seguras;
  }

  const key = claveEstado(yoLo, yoHi, riLo, riHi);
  const cacheado = memoExacto.get(key);
  if (cacheado !== undefined) return cacheado;

  const movs = obtenerMovimientosOrdenados(yoLo, yoHi, riLo, riHi, true);
  for (let i = 0; i < movs.length; i++) {
    const m = movs[i];
    const nYoLo = yoLo & CLR_SELF_LO[m];
    const nYoHi = yoHi & CLR_SELF_HI[m];
    const nRiLo = riLo & CLR_CLOSED_LO[m];
    const nRiHi = riHi & CLR_CLOSED_HI[m];
    if (!esGanadoraExacta(nRiLo, nRiHi, nYoLo, nYoHi, memoExacto)) {
      memoExacto.set(key, true);
      return true;
    }
  }

  memoExacto.set(key, false);
  return false;
}

interface EntradaTT {
  depth: number;
  score: number;
  flag: 0 | 1 | 2; // 0: exacto, 1: cota inferior, 2: cota superior
}

function negamax(
  yoLo: number,
  yoHi: number,
  riLo: number,
  riHi: number,
  profundidad: number,
  alpha: number,
  beta: number,
  memoExacto: Map<bigint, boolean>,
  tt: Map<bigint, EntradaTT>
): number {
  if (yoLo === 0 && yoHi === 0) return -100_000 - profundidad;
  if (riLo === 0 && riHi === 0) return 100_000 + profundidad;

  const unionCount = popcount36(yoLo | riLo, yoHi | riHi);
  if (unionCount <= 12) {
    return esGanadoraExacta(yoLo, yoHi, riLo, riHi, memoExacto)
      ? 95_000 + profundidad
      : -95_000 - profundidad;
  }

  if (profundidad === 0) {
    return evaluarTablero(yoLo, yoHi, riLo, riHi);
  }

  if (tieneVictoriaEn1(yoLo, yoHi, riLo, riHi)) {
    return 100_000 + profundidad;
  }

  const key = claveEstado(yoLo, yoHi, riLo, riHi);
  const alphaOrig = alpha;
  const cached = tt.get(key);
  if (cached !== undefined && cached.depth >= profundidad) {
    if (cached.flag === 0) return cached.score;
    if (cached.flag === 1 && cached.score > alpha) alpha = cached.score;
    else if (cached.flag === 2 && cached.score < beta) beta = cached.score;
    if (alpha >= beta) return cached.score;
  }

  const movs = obtenerMovimientosOrdenados(yoLo, yoHi, riLo, riHi, true);
  const limite = Math.min(profundidad >= 3 ? 6 : 5, movs.length);
  let mejor = -Infinity;

  for (let i = 0; i < limite; i++) {
    const m = movs[i];
    const nYoLo = yoLo & CLR_SELF_LO[m];
    const nYoHi = yoHi & CLR_SELF_HI[m];
    const nRiLo = riLo & CLR_CLOSED_LO[m];
    const nRiHi = riHi & CLR_CLOSED_HI[m];

    const valor = -negamax(
      nRiLo,
      nRiHi,
      nYoLo,
      nYoHi,
      profundidad - 1,
      -beta,
      -alpha,
      memoExacto,
      tt
    );

    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }

  let flag: 0 | 1 | 2 = 0;
  if (mejor <= alphaOrig) flag = 2;
  else if (mejor >= beta) flag = 1;
  tt.set(key, { depth: profundidad, score: mejor, flag });

  return mejor;
}

/**
 * Elige la casilla (0..35) para el turno actual en Snort según la dificultad.
 */
export function elegirMovimiento(
  state: SnortState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const { l1Lo, l1Hi, l2Lo, l2Hi } = extraerMascaras(state);
  const yo: Player = state.currentPlayer;
  const yoLo = yo === 1 ? l1Lo : l2Lo;
  const yoHi = yo === 1 ? l1Hi : l2Hi;
  const riLo = yo === 1 ? l2Lo : l1Lo;
  const riHi = yo === 1 ? l2Hi : l1Hi;

  const legales = listarIndices(yoLo, yoHi);
  if (legales.length === 0) return 0;

  const ganadoras = legales.filter(
    m => (riLo & CLR_CLOSED_LO[m]) === 0 && (riHi & CLR_CLOSED_HI[m]) === 0
  );

  if (dificultad === 'facil') {
    if (
      ganadoras.length > 0 &&
      (ganadoras.length === legales.length || rng() < 0.4)
    ) {
      return elegirAlAzar(ganadoras, rng);
    }
    const pool =
      ganadoras.length > 0
        ? legales.filter(m => !ganadoras.includes(m))
        : legales;
    return elegirAlAzar(pool, rng);
  }

  if (ganadoras.length > 0) {
    return elegirAlAzar(ganadoras, rng);
  }

  const seguras = legales.filter(m => {
    const nYoLo = yoLo & CLR_SELF_LO[m];
    const nYoHi = yoHi & CLR_SELF_HI[m];
    const nRiLo = riLo & CLR_CLOSED_LO[m];
    const nRiHi = riHi & CLR_CLOSED_HI[m];
    return !tieneVictoriaEn1(nRiLo, nRiHi, nYoLo, nYoHi);
  });

  const baseCandidatos = seguras.length > 0 ? seguras : legales;

  if (dificultad === 'medio') {
    let mejorScore = -Infinity;
    let mejores: number[] = [];
    for (let i = 0; i < baseCandidatos.length; i++) {
      const m = baseCandidatos[i];
      const nYoLo = yoLo & CLR_SELF_LO[m];
      const nYoHi = yoHi & CLR_SELF_HI[m];
      const nRiLo = riLo & CLR_CLOSED_LO[m];
      const nRiHi = riHi & CLR_CLOSED_HI[m];
      const score = puntuarMedio1Ply(nYoLo, nYoHi, nRiLo, nRiHi);
      if (score > mejorScore) {
        mejorScore = score;
        mejores = [m];
      } else if (score === mejorScore) {
        mejores.push(m);
      }
    }
    return elegirAlAzar(mejores, rng);
  }

  if (seguras.length === 1) {
    return seguras[0];
  }

  const memoExacto = new Map<bigint, boolean>();
  const unionCount = popcount36(yoLo | riLo, yoHi | riHi);

  if (unionCount <= 12) {
    const ganadorasExactas: number[] = [];
    const ordenados = obtenerMovimientosOrdenados(yoLo, yoHi, riLo, riHi, false);
    const pool =
      seguras.length > 0
        ? ordenados.filter(m => seguras.includes(m))
        : ordenados;

    for (let i = 0; i < pool.length; i++) {
      const m = pool[i];
      const nYoLo = yoLo & CLR_SELF_LO[m];
      const nYoHi = yoHi & CLR_SELF_HI[m];
      const nRiLo = riLo & CLR_CLOSED_LO[m];
      const nRiHi = riHi & CLR_CLOSED_HI[m];
      if (!esGanadoraExacta(nRiLo, nRiHi, nYoLo, nYoHi, memoExacto)) {
        ganadorasExactas.push(m);
      }
    }
    if (ganadorasExactas.length > 0) {
      return elegirAlAzar(ganadorasExactas, rng);
    }
  }

  const tt = new Map<bigint, EntradaTT>();
  const ordenados = obtenerMovimientosOrdenados(yoLo, yoHi, riLo, riHi, true);
  const raizPool =
    seguras.length > 0
      ? ordenados.filter(m => seguras.includes(m))
      : ordenados;
  const raizLimite = Math.min(unionCount <= 22 ? 12 : 10, raizPool.length);
  const profundidad = unionCount <= 20 ? 5 : 4; // +1 del nivel raíz => 5-6 plies totales

  let mejorScore = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < raizLimite; i++) {
    const m = raizPool[i];
    const nYoLo = yoLo & CLR_SELF_LO[m];
    const nYoHi = yoHi & CLR_SELF_HI[m];
    const nRiLo = riLo & CLR_CLOSED_LO[m];
    const nRiHi = riHi & CLR_CLOSED_HI[m];

    const beta = Number.isFinite(mejorScore) ? -(mejorScore - 1) : Infinity;
    const valor = -negamax(
      nRiLo,
      nRiHi,
      nYoLo,
      nYoHi,
      profundidad,
      -Infinity,
      beta,
      memoExacto,
      tt
    );

    if (valor > mejorScore) {
      mejorScore = valor;
      mejores = [m];
    } else if (valor === mejorScore) {
      mejores.push(m);
    }
  }

  return elegirAlAzar(mejores, rng);
}
