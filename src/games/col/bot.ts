import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { otro, type ColMove, type ColState } from './engine';
import { MAPAS } from './maps';

const MAX_REGIONES = 13;
const POPCOUNT_13 = new Uint8Array(1 << MAX_REGIONES);
for (let i = 1; i < POPCOUNT_13.length; i++) {
  POPCOUNT_13[i] = POPCOUNT_13[i >> 1] + (i & 1);
}

const ADJ_MASKS: Uint16Array[] = MAPAS.map(mapa => {
  const arr = new Uint16Array(mapa.regiones.length);
  for (const [a, b] of mapa.adyacencias) {
    arr[a] |= 1 << b;
    arr[b] |= 1 << a;
  }
  return arr;
});

const CLOSE_MASKS: Uint16Array[] = MAPAS.map((mapa, idx) => {
  const adj = ADJ_MASKS[idx];
  const arr = new Uint16Array(mapa.regiones.length);
  for (let r = 0; r < mapa.regiones.length; r++) {
    arr[r] = (1 << r) | adj[r];
  }
  return arr;
});

const ALL_MASKS: number[] = MAPAS.map(mapa => (1 << mapa.regiones.length) - 1);

const MEMO_POR_MAPA: Map<number, boolean>[] = MAPAS.map(() => new Map<number, boolean>());

function listarBits(mask: number): number[] {
  const res: number[] = [];
  let b = mask;
  while (b !== 0) {
    const lsb = b & -b;
    res.push(31 - Math.clz32(lsb));
    b ^= lsb;
  }
  return res;
}

function esDerrotaInmediata(nextMy: number, nextOpp: number): boolean {
  return nextMy === 0 || (POPCOUNT_13[nextMy] === 1 && (nextOpp & nextMy) !== 0);
}

function esGanadora(
  myLegal: number,
  oppLegal: number,
  close: Uint16Array,
  memo: Map<number, boolean>
): boolean {
  if (myLegal === 0) return false;
  if (oppLegal === 0 || (POPCOUNT_13[oppLegal] === 1 && (myLegal & oppLegal) !== 0)) {
    return true;
  }

  const key = (myLegal << MAX_REGIONES) | oppLegal;
  const cacheado = memo.get(key);
  if (cacheado !== undefined) return cacheado;

  const candidatas: number[] = [];
  let b = myLegal;
  while (b !== 0) {
    const lsb = b & -b;
    const r = 31 - Math.clz32(lsb);
    b ^= lsb;
    const nextMy = myLegal & ~close[r];
    const nextOpp = oppLegal & ~lsb;
    if (!esDerrotaInmediata(nextMy, nextOpp)) {
      candidatas.push(r);
    }
  }

  if (candidatas.length === 0) {
    memo.set(key, false);
    return false;
  }

  if (candidatas.length > 1) {
    candidatas.sort((a, bIdx) => {
      const sa = POPCOUNT_13[myLegal & ~close[a]] - POPCOUNT_13[oppLegal & ~(1 << a)];
      const sb = POPCOUNT_13[myLegal & ~close[bIdx]] - POPCOUNT_13[oppLegal & ~(1 << bIdx)];
      return sb - sa;
    });
  }

  for (let i = 0; i < candidatas.length; i++) {
    const r = candidatas[i];
    const nextMy = myLegal & ~close[r];
    const nextOpp = oppLegal & ~(1 << r);
    if (!esGanadora(nextOpp, nextMy, close, memo)) {
      memo.set(key, true);
      return true;
    }
  }

  memo.set(key, false);
  return false;
}

function elegirMejorDerrota(
  seguras: number[],
  myLegal: number,
  oppLegal: number,
  close: Uint16Array,
  memo: Map<number, boolean>,
  rng: Rng
): number {
  let menorRespuestasGanadoras = Infinity;
  let mejorVentaja = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < seguras.length; i++) {
    const r = seguras[i];
    const nextMy = myLegal & ~close[r];
    const nextOpp = oppLegal & ~(1 << r);
    let respuestasGanadoras = 0;

    let b = nextOpp;
    while (b !== 0) {
      const lsb = b & -b;
      const o = 31 - Math.clz32(lsb);
      b ^= lsb;
      if (!esGanadora(nextMy & ~lsb, nextOpp & ~close[o], close, memo)) {
        respuestasGanadoras++;
      }
    }

    const ventaja = POPCOUNT_13[nextMy] - POPCOUNT_13[nextOpp];
    if (
      respuestasGanadoras < menorRespuestasGanadoras ||
      (respuestasGanadoras === menorRespuestasGanadoras && ventaja > mejorVentaja)
    ) {
      menorRespuestasGanadoras = respuestasGanadoras;
      mejorVentaja = ventaja;
      mejores = [r];
    } else if (
      respuestasGanadoras === menorRespuestasGanadoras &&
      ventaja === mejorVentaja
    ) {
      mejores.push(r);
    }
  }

  return elegirAlAzar(mejores, rng);
}

/**
 * Elige la siguiente jugada del bot para Col según la dificultad indicada.
 */
export function elegirMovimiento(
  state: ColState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): ColMove {
  if (state.fase === 'seleccion' || state.mapaId === null) {
    return { tipo: 'mapa', mapaId: elegirAlAzar(MAPAS, rng).id };
  }

  const mapaId = state.mapaId;
  const mapa = MAPAS[mapaId];
  if (!mapa) {
    return { tipo: 'mapa', mapaId: 0 };
  }

  const adj = ADJ_MASKS[mapaId];
  const close = CLOSE_MASKS[mapaId];
  const yo = state.currentPlayer;
  const n = mapa.regiones.length;

  let occupied = 0;
  let blockYo = 0;
  let blockRival = 0;
  for (let r = 0; r < n; r++) {
    const c = state.colores[r];
    if (c === 0) continue;
    occupied |= 1 << r;
    if (c === yo) blockYo |= adj[r];
    else blockRival |= adj[r];
  }

  const allMask = ALL_MASKS[mapaId];
  const myLegal = allMask & ~(occupied | blockYo);
  const oppLegal = allMask & ~(occupied | blockRival);
  const legales = listarBits(myLegal);

  if (legales.length === 0) {
    return { tipo: 'color', region: 0 };
  }

  const ganadorasInmediatas = legales.filter(r => (oppLegal & ~(1 << r)) === 0);

  if (dificultad === 'facil') {
    if (ganadorasInmediatas.length > 0) {
      if (ganadorasInmediatas.length === legales.length || rng() >= 0.6) {
        return { tipo: 'color', region: elegirAlAzar(ganadorasInmediatas, rng) };
      }
      const noGanadoras = legales.filter(r => (oppLegal & ~(1 << r)) !== 0);
      return { tipo: 'color', region: elegirAlAzar(noGanadoras, rng) };
    }
    return { tipo: 'color', region: elegirAlAzar(legales, rng) };
  }

  if (ganadorasInmediatas.length > 0) {
    return { tipo: 'color', region: elegirAlAzar(ganadorasInmediatas, rng) };
  }

  const seguras = legales.filter(r => {
    const nextMy = myLegal & ~close[r];
    const nextOpp = oppLegal & ~(1 << r);
    return !esDerrotaInmediata(nextMy, nextOpp);
  });

  if (dificultad === 'medio') {
    const pool = [...(seguras.length > 0 ? seguras : legales)];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    pool.sort(
      (a, b) => POPCOUNT_13[myLegal & ~close[b]] - POPCOUNT_13[myLegal & ~close[a]]
    );
    if (pool.length >= 6) {
      const limite = Math.min(5, Math.ceil(pool.length * 0.45));
      return { tipo: 'color', region: elegirAlAzar(pool.slice(0, limite), rng) };
    }
    const maxMovilidad = POPCOUNT_13[myLegal & ~close[pool[0]]];
    const mejores = pool.filter(r => POPCOUNT_13[myLegal & ~close[r]] === maxMovilidad);
    return { tipo: 'color', region: elegirAlAzar(mejores, rng) };
  }

  const memo = MEMO_POR_MAPA[mapaId];
  const victoriasExactas: number[] = [];
  for (let i = 0; i < seguras.length; i++) {
    const r = seguras[i];
    const nextMy = myLegal & ~close[r];
    const nextOpp = oppLegal & ~(1 << r);
    if (!esGanadora(nextOpp, nextMy, close, memo)) {
      victoriasExactas.push(r);
    }
  }

  if (victoriasExactas.length > 0) {
    return { tipo: 'color', region: elegirAlAzar(victoriasExactas, rng) };
  }

  if (seguras.length > 0) {
    return {
      tipo: 'color',
      region: elegirMejorDerrota(seguras, myLegal, oppLegal, close, memo, rng),
    };
  }

  return { tipo: 'color', region: elegirAlAzar(legales, rng) };
}
