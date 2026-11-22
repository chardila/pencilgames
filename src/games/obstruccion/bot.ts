import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { TAMANO, casillaLegal, type ObstruccionState } from './engine';

const TOTAL = TAMANO * TAMANO;
const HALF_MASK = (1 << 18) - 1;

const POPCOUNT_9 = new Uint8Array(512);
for (let i = 1; i < 512; i++) {
  POPCOUNT_9[i] = POPCOUNT_9[i >> 1] + (i & 1);
}

const INV_LO = new Int32Array(TOTAL);
const INV_HI = new Int32Array(TOTAL);

for (let idx = 0; idx < TOTAL; idx++) {
  const fila = Math.floor(idx / TAMANO);
  const col = idx % TAMANO;
  let lo = 0;
  let hi = 0;
  for (let df = -1; df <= 1; df++) {
    for (let dc = -1; dc <= 1; dc++) {
      const f = fila + df;
      const c = col + dc;
      if (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO) {
        const bit = f * TAMANO + c;
        if (bit < 18) lo |= 1 << bit;
        else hi |= 1 << (bit - 18);
      }
    }
  }
  INV_LO[idx] = HALF_MASK ^ lo;
  INV_HI[idx] = HALF_MASK ^ hi;
}

const CENTRO_PESO = Int8Array.from({ length: TOTAL }, (_, idx) => {
  const fila = Math.floor(idx / TAMANO);
  const col = idx % TAMANO;
  const dist = Math.abs(fila - 2.5) + Math.abs(col - 2.5);
  return Math.round(6 - dist);
});

// Scratch reutilizable: se rellena y lee dentro de ordenarPorRestantes antes de recursión.
const REM_SCRATCH = new Uint8Array(TOTAL);

function popcount36(lo: number, hi: number): number {
  return (
    POPCOUNT_9[lo & 0x1ff] +
    POPCOUNT_9[lo >> 9] +
    POPCOUNT_9[hi & 0x1ff] +
    POPCOUNT_9[hi >> 9]
  );
}

function listarIndices(lo: number, hi: number): number[] {
  const indices: number[] = [];
  let b = lo;
  while (b !== 0) {
    const lsb = b & -b;
    indices.push(31 - Math.clz32(lsb));
    b ^= lsb;
  }
  b = hi;
  while (b !== 0) {
    const lsb = b & -b;
    indices.push(49 - Math.clz32(lsb));
    b ^= lsb;
  }
  return indices;
}

function ordenarPorRestantes(indices: number[], lo: number, hi: number): void {
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    REM_SCRATCH[idx] = popcount36(lo & INV_LO[idx], hi & INV_HI[idx]);
  }
  indices.sort((a, b) => {
    const diff = REM_SCRATCH[a] - REM_SCRATCH[b];
    return diff !== 0 ? diff : CENTRO_PESO[b] - CENTRO_PESO[a];
  });
}

function esGanadoraExacta(lo: number, hi: number, memoExacto: Map<number, boolean>): boolean {
  if (lo === 0 && hi === 0) return false;
  const key = hi * 0x40000 + lo;
  const cacheado = memoExacto.get(key);
  if (cacheado !== undefined) return cacheado;

  const libres = listarIndices(lo, hi);
  for (let i = 0; i < libres.length; i++) {
    const m = libres[i];
    if ((lo & INV_LO[m]) === 0 && (hi & INV_HI[m]) === 0) {
      memoExacto.set(key, true);
      return true;
    }
  }

  ordenarPorRestantes(libres, lo, hi);

  for (let i = 0; i < libres.length; i++) {
    const m = libres[i];
    if (!esGanadoraExacta(lo & INV_LO[m], hi & INV_HI[m], memoExacto)) {
      memoExacto.set(key, true);
      return true;
    }
  }

  memoExacto.set(key, false);
  return false;
}

function negamax(
  lo: number,
  hi: number,
  profundidad: number,
  alpha: number,
  beta: number,
  memoExacto: Map<number, boolean>
): number {
  if (lo === 0 && hi === 0) return -1000;
  const n = popcount36(lo, hi);
  if (n <= 10) {
    return esGanadoraExacta(lo, hi, memoExacto) ? 1000 + profundidad : -1000 - profundidad;
  }

  if (profundidad === 0) {
    // Heurística ligera: número impar de casillas restantes y movilidad acotada.
    return (n % 2 === 1 ? 8 : -8) + Math.min(n, 20);
  }

  const libres = listarIndices(lo, hi);
  ordenarPorRestantes(libres, lo, hi);

  const limite = Math.min(6, libres.length);
  let mejor = -Infinity;
  for (let i = 0; i < limite; i++) {
    const m = libres[i];
    const valor = -negamax(lo & INV_LO[m], hi & INV_HI[m], profundidad - 1, -beta, -alpha, memoExacto);
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
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < TOTAL; i++) {
    if (casillaLegal(state.board, i)) {
      if (i < 18) lo |= 1 << i;
      else hi |= 1 << (i - 18);
    }
  }

  const legales = listarIndices(lo, hi);
  if (legales.length === 0) return 0;

  const inmediatas = legales.filter(i => (lo & INV_LO[i]) === 0 && (hi & INV_HI[i]) === 0);

  if (dificultad === 'facil') {
    if (inmediatas.length > 0 && (legales.length === inmediatas.length || rng() < 0.4)) {
      return elegirAlAzar(inmediatas, rng);
    }
    return elegirAlAzar(legales, rng);
  }

  if (inmediatas.length > 0) return elegirAlAzar(inmediatas, rng);

  if (dificultad === 'medio') {
    const seguras = legales.filter(i => {
      const sigLo = lo & INV_LO[i];
      const sigHi = hi & INV_HI[i];
      const sigLibres = listarIndices(sigLo, sigHi);
      for (let k = 0; k < sigLibres.length; k++) {
        const j = sigLibres[k];
        if ((sigLo & INV_LO[j]) === 0 && (sigHi & INV_HI[j]) === 0) return false;
      }
      return true;
    });
    return elegirAlAzar(seguras.length > 0 ? seguras : legales, rng);
  }

  const memoExacto = new Map<number, boolean>();
  ordenarPorRestantes(legales, lo, hi);

  if (legales.length <= 12) {
    const ganadoras = legales.filter(
      m => !esGanadoraExacta(lo & INV_LO[m], hi & INV_HI[m], memoExacto)
    );
    if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);
  }

  const candidatos = legales.length > 16 ? legales.slice(0, 10) : legales;
  const profundidad = legales.length > 14 ? 2 : 3;
  let mejorPuntaje = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < candidatos.length; i++) {
    const m = candidatos[i];
    const beta = Number.isFinite(mejorPuntaje) ? -mejorPuntaje + 1 : Infinity;
    const valor = -negamax(lo & INV_LO[m], hi & INV_HI[m], profundidad, -Infinity, beta, memoExacto);
    if (valor > mejorPuntaje) {
      mejorPuntaje = valor;
      mejores = [m];
    } else if (valor === mejorPuntaje) {
      mejores.push(m);
    }
  }

  return elegirAlAzar(mejores, rng);
}
