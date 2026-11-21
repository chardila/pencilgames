import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, casillaLegal, type ObstruccionState } from './engine';

const TOTAL = TAMANO * TAMANO;
const ALL_MASK = (1n << BigInt(TOTAL)) - 1n;
const BIT_MASK: bigint[] = Array.from({ length: TOTAL }, (_, i) => 1n << BigInt(i));

const POPCOUNT_12 = new Uint8Array(4096);
for (let i = 1; i < 4096; i++) {
  POPCOUNT_12[i] = POPCOUNT_12[i >> 1] + (i & 1);
}

const VECINOS_MASK: bigint[] = Array.from({ length: TOTAL }, (_, idx) => {
  const fila = Math.floor(idx / TAMANO);
  const col = idx % TAMANO;
  let mask = 0n;
  for (let df = -1; df <= 1; df++) {
    for (let dc = -1; dc <= 1; dc++) {
      const f = fila + df;
      const c = col + dc;
      if (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO) {
        mask |= BIT_MASK[f * TAMANO + c];
      }
    }
  }
  return mask;
});

const INV_VECINOS_MASK: bigint[] = VECINOS_MASK.map(m => ALL_MASK ^ m);

const CENTRO_PESO: number[] = Array.from({ length: TOTAL }, (_, idx) => {
  const fila = Math.floor(idx / TAMANO);
  const col = idx % TAMANO;
  const dist = Math.abs(fila - 2.5) + Math.abs(col - 2.5);
  return Math.round(6 - dist);
});

function construirMascaraLegal(state: ObstruccionState): bigint {
  let mask = 0n;
  for (let i = 0; i < TOTAL; i++) {
    if (casillaLegal(state.board, i)) mask |= BIT_MASK[i];
  }
  return mask;
}

function listarIndices(mask: bigint): number[] {
  const indices: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if ((mask & BIT_MASK[i]) !== 0n) indices.push(i);
  }
  return indices;
}

function popcount(mask: bigint): number {
  const n = Number(mask & 0xfffn);
  const m = Number((mask >> 12n) & 0xfffn);
  const h = Number((mask >> 24n) & 0xfffn);
  return POPCOUNT_12[n] + POPCOUNT_12[m] + POPCOUNT_12[h];
}

function ordenarPorRestantes(indices: number[], mask: bigint): void {
  indices.sort((a, b) => {
    const remA = popcount(mask & INV_VECINOS_MASK[a]);
    const remB = popcount(mask & INV_VECINOS_MASK[b]);
    if (remA !== remB) return remA - remB;
    return CENTRO_PESO[b] - CENTRO_PESO[a];
  });
}

function esGanadoraExacta(mask: bigint, memoExacto: Map<bigint, boolean>): boolean {
  if (mask === 0n) return false;
  const cacheado = memoExacto.get(mask);
  if (cacheado !== undefined) return cacheado;

  const libres = listarIndices(mask);
  for (const m of libres) {
    if ((mask & INV_VECINOS_MASK[m]) === 0n) {
      memoExacto.set(mask, true);
      return true;
    }
  }

  libres.sort((a, b) => popcount(mask & INV_VECINOS_MASK[a]) - popcount(mask & INV_VECINOS_MASK[b]));

  for (const m of libres) {
    const siguiente = mask & INV_VECINOS_MASK[m];
    if (!esGanadoraExacta(siguiente, memoExacto)) {
      memoExacto.set(mask, true);
      return true;
    }
  }

  memoExacto.set(mask, false);
  return false;
}

function negamax(
  mask: bigint,
  profundidad: number,
  alpha: number,
  beta: number,
  memoExacto: Map<bigint, boolean>
): number {
  if (mask === 0n) return -1000;
  const n = popcount(mask);
  if (n <= 10) {
    return esGanadoraExacta(mask, memoExacto) ? 1000 + profundidad : -1000 - profundidad;
  }

  if (profundidad === 0) {
    // Heurística ligera: número impar de casillas restantes y movilidad acotada.
    return (n % 2 === 1 ? 8 : -8) + Math.min(n, 20);
  }

  const libres = listarIndices(mask);
  ordenarPorRestantes(libres, mask);

  const limite = libres.slice(0, 8);
  let mejor = -Infinity;
  for (const m of limite) {
    const siguiente = mask & INV_VECINOS_MASK[m];
    const valor = -negamax(siguiente, profundidad - 1, -beta, -alpha, memoExacto);
    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }
  return mejor;
}

/**
 * Elige el índice de casilla para el turno actual en Obstrucción según la dificultad.
 */
export function elegirMovimiento(
  state: ObstruccionState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const mask = construirMascaraLegal(state);
  const legales = listarIndices(mask);
  if (legales.length === 0) return 0;

  const inmediatas = legales.filter(i => (mask & INV_VECINOS_MASK[i]) === 0n);

  if (dificultad === 'facil') {
    if (inmediatas.length > 0 && (legales.length === inmediatas.length || rng() < 0.4)) {
      return elegirAlAzar(inmediatas, rng);
    }
    return elegirAlAzar(legales, rng);
  }

  if (inmediatas.length > 0) return elegirAlAzar(inmediatas, rng);

  if (dificultad === 'medio') {
    const seguras = legales.filter(i => {
      const sig = mask & INV_VECINOS_MASK[i];
      for (const j of listarIndices(sig)) {
        if ((sig & INV_VECINOS_MASK[j]) === 0n) return false;
      }
      return true;
    });
    return elegirAlAzar(seguras.length > 0 ? seguras : legales, rng);
  }

  const memoExacto = new Map<bigint, boolean>();
  ordenarPorRestantes(legales, mask);

  if (legales.length <= 12) {
    const ganadoras = legales.filter(m => !esGanadoraExacta(mask & INV_VECINOS_MASK[m], memoExacto));
    if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);
  }

  const candidatos = legales.length > 16 ? legales.slice(0, 14) : legales;
  const profundidad = legales.length > 20 ? 3 : 4;
  let mejorPuntaje = -Infinity;
  let mejores: number[] = [];

  for (const m of candidatos) {
    const siguiente = mask & INV_VECINOS_MASK[m];
    const beta = Number.isFinite(mejorPuntaje) ? -mejorPuntaje + 1 : Infinity;
    const valor = -negamax(siguiente, profundidad, -Infinity, beta, memoExacto);
    if (valor > mejorPuntaje) {
      mejorPuntaje = valor;
      mejores = [m];
    } else if (valor === mejorPuntaje) {
      mejores.push(m);
    }
  }

  return elegirAlAzar(mejores, rng);
}
