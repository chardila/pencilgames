import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  FLOTA,
  TAMANO,
  type BattleshipState,
  type Move,
  type Resultado,
} from './engine';

const TOTAL = TAMANO * TAMANO;

interface Placement {
  cells: number[];
  lo: number;
  hi: number;
  horiz: boolean;
  centroidR: number;
  centroidC: number;
  onBorder: boolean;
  corners: number;
}

const ORTHO: number[][] = Array.from({ length: TOTAL }, (_, idx) => {
  const r = Math.floor(idx / TAMANO);
  const c = idx % TAMANO;
  const res: number[] = [];
  if (r > 0) res.push(idx - TAMANO);
  if (r < TAMANO - 1) res.push(idx + TAMANO);
  if (c > 0) res.push(idx - 1);
  if (c < TAMANO - 1) res.push(idx + 1);
  return res;
});

const ADJ8: number[][] = Array.from({ length: TOTAL }, (_, idx) => {
  const r0 = Math.floor(idx / TAMANO);
  const c0 = idx % TAMANO;
  const res: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    const r = r0 + dr;
    if (r < 0 || r >= TAMANO) continue;
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const c = c0 + dc;
      if (c < 0 || c >= TAMANO) continue;
      res.push(r * TAMANO + c);
    }
  }
  return res;
});

function maskFromCells(cells: readonly number[]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c < 32) lo = (lo | (1 << c)) >>> 0;
    else hi = (hi | (1 << (c - 32))) >>> 0;
  }
  return [lo, hi];
}

function crearPlacements(long: number): Placement[] {
  const res: Placement[] = [];
  for (let horiz = 0; horiz < 2; horiz++) {
    const isH = horiz === 1;
    const maxR = isH ? TAMANO : TAMANO - long + 1;
    const maxC = isH ? TAMANO - long + 1 : TAMANO;
    for (let r = 0; r < maxR; r++) {
      for (let c = 0; c < maxC; c++) {
        const cells: number[] = [];
        let sumR = 0;
        let sumC = 0;
        let allBorder = true;
        let corners = 0;
        for (let k = 0; k < long; k++) {
          const rr = isH ? r : r + k;
          const cc = isH ? c + k : c;
          const idx = rr * TAMANO + cc;
          cells.push(idx);
          sumR += rr;
          sumC += cc;
          if (rr > 0 && rr < TAMANO - 1 && cc > 0 && cc < TAMANO - 1) {
            allBorder = false;
          }
          if ((rr === 0 || rr === TAMANO - 1) && (cc === 0 || cc === TAMANO - 1)) {
            corners++;
          }
        }
        const [lo, hi] = maskFromCells(cells);
        res.push({
          cells,
          lo,
          hi,
          horiz: isH,
          centroidR: sumR / long,
          centroidC: sumC / long,
          onBorder: allBorder,
          corners,
        });
      }
    }
  }
  return res;
}

const PLACEMENTS_BY_LEN: Record<number, Placement[]> = {
  2: crearPlacements(2),
  3: crearPlacements(3),
  4: crearPlacements(4),
};

const FALLBACK_FLOTA: number[][] = [
  [9, 10, 11, 12],
  [25, 33, 41],
  [29, 37, 45],
  [51, 52],
];

function expandirMascara(cells: readonly number[], vecinos: number[][]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c < 32) lo = (lo | (1 << c)) >>> 0;
    else hi = (hi | (1 << (c - 32))) >>> 0;
    const vs = vecinos[c];
    for (let j = 0; j < vs.length; j++) {
      const v = vs[j];
      if (v < 32) lo = (lo | (1 << v)) >>> 0;
      else hi = (hi | (1 << (v - 32))) >>> 0;
    }
  }
  return [lo, hi];
}

function colocarFlota(dificultad: Dificultad, rng: Rng): number[][] {
  if (dificultad === 'facil') {
    let usedLo = 0;
    let usedHi = 0;
    const barcos: number[][] = [];
    for (const long of FLOTA) {
      const cands = PLACEMENTS_BY_LEN[long].filter(
        p => (p.lo & usedLo) === 0 && (p.hi & usedHi) === 0,
      );
      if (cands.length === 0) return FALLBACK_FLOTA.map(b => [...b]);
      const p = elegirAlAzar(cands, rng);
      usedLo = (usedLo | p.lo) >>> 0;
      usedHi = (usedHi | p.hi) >>> 0;
      barcos.push([...p.cells]);
    }
    return barcos;
  }

  if (dificultad === 'medio') {
    let usedLo = 0;
    let usedHi = 0;
    let orthoLo = 0;
    let orthoHi = 0;
    const barcos: number[][] = [];
    for (const long of FLOTA) {
      const todos = PLACEMENTS_BY_LEN[long];
      const sinPegar = todos.filter(p => (p.lo & orthoLo) === 0 && (p.hi & orthoHi) === 0);
      const pool =
        sinPegar.length > 0
          ? sinPegar
          : todos.filter(p => (p.lo & usedLo) === 0 && (p.hi & usedHi) === 0);
      if (pool.length === 0) return FALLBACK_FLOTA.map(b => [...b]);
      const p = elegirAlAzar(pool, rng);
      usedLo = (usedLo | p.lo) >>> 0;
      usedHi = (usedHi | p.hi) >>> 0;
      const [eLo, eHi] = expandirMascara(p.cells, ORTHO);
      orthoLo = (orthoLo | eLo) >>> 0;
      orthoHi = (orthoHi | eHi) >>> 0;
      barcos.push([...p.cells]);
    }
    return barcos;
  }

  // Difícil: genera varios candidatos sin adyacencias y elige al azar entre los mejores anti-patrón.
  interface CandidatoFlota {
    barcos: number[][];
    score: number;
  }
  const candidatos: CandidatoFlota[] = [];
  const MUESTRAS = 16;

  for (let m = 0; m < MUESTRAS; m++) {
    let usedLo = 0;
    let usedHi = 0;
    let orthoLo = 0;
    let orthoHi = 0;
    let adj8Lo = 0;
    let adj8Hi = 0;
    const elegidos: Placement[] = [];
    let ok = true;
    let sinDiag = true;

    for (const long of FLOTA) {
      const todos = PLACEMENTS_BY_LEN[long];
      let pool = todos.filter(p => (p.lo & adj8Lo) === 0 && (p.hi & adj8Hi) === 0);
      if (pool.length === 0) {
        sinDiag = false;
        pool = todos.filter(p => (p.lo & orthoLo) === 0 && (p.hi & orthoHi) === 0);
      }
      if (pool.length === 0) {
        pool = todos.filter(p => (p.lo & usedLo) === 0 && (p.hi & usedHi) === 0);
      }
      if (pool.length === 0) {
        ok = false;
        break;
      }
      const p = elegirAlAzar(pool, rng);
      elegidos.push(p);
      usedLo = (usedLo | p.lo) >>> 0;
      usedHi = (usedHi | p.hi) >>> 0;
      const [oLo, oHi] = expandirMascara(p.cells, ORTHO);
      orthoLo = (orthoLo | oLo) >>> 0;
      orthoHi = (orthoHi | oHi) >>> 0;
      const [aLo, aHi] = expandirMascara(p.cells, ADJ8);
      adj8Lo = (adj8Lo | aLo) >>> 0;
      adj8Hi = (adj8Hi | aHi) >>> 0;
    }

    if (!ok) continue;

    let horizCount = 0;
    let borderShips = 0;
    let corners = 0;
    let cuadrantes = 0;
    for (const p of elegidos) {
      if (p.horiz) horizCount++;
      if (p.onBorder) borderShips++;
      corners += p.corners;
      const q = (p.centroidR >= 4 ? 2 : 0) + (p.centroidC >= 4 ? 1 : 0);
      cuadrantes |= 1 << q;
    }

    let distSum = 0;
    for (let i = 0; i < elegidos.length; i++) {
      for (let j = i + 1; j < elegidos.length; j++) {
        distSum +=
          Math.abs(elegidos[i].centroidR - elegidos[j].centroidR) +
          Math.abs(elegidos[i].centroidC - elegidos[j].centroidC);
      }
    }

    let numCuadrantes = 0;
    for (let q = 0; q < 4; q++) {
      if ((cuadrantes & (1 << q)) !== 0) numCuadrantes++;
    }

    const balance = horizCount === 2 ? 30 : horizCount === 1 || horizCount === 3 ? 15 : 0;
    const score =
      (sinDiag ? 40 : 0) +
      balance +
      numCuadrantes * 10 +
      distSum * 1.5 -
      borderShips * 18 -
      corners * 14;

    candidatos.push({
      barcos: elegidos.map(p => [...p.cells]),
      score,
    });
  }

  if (candidatos.length === 0) return FALLBACK_FLOTA.map(b => [...b]);
  candidatos.sort((a, b) => b.score - a.score);
  const top = candidatos.slice(0, Math.min(3, candidatos.length));
  return elegirAlAzar(top, rng).barcos;
}

/**
 * Deduce qué longitudes de `FLOTA` siguen a flote usando exclusivamente
 * `state.disparos[yo]` (nunca consulta `state.flotas`).
 */
function deducirBarcosRestantes(disparos: readonly (Resultado | null)[]): number[] {
  const hundidos: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (disparos[i] === 'hundido') hundidos.push(i);
  }
  if (hundidos.length === 0) return [...FLOTA];

  const [targetLo, targetHi] = maskFromCells(hundidos);
  const longitudes = [4, 3, 2] as const;
  const maxCounts: Record<number, number> = { 4: 1, 3: 2, 2: 1 };

  // Preseleccionar colocaciones completamente contenidas en las celdas 'hundido'.
  const dentro: Record<number, Placement[]> = { 4: [], 3: [], 2: [] };
  for (const long of longitudes) {
    dentro[long] = PLACEMENTS_BY_LEN[long].filter(
      p => (p.lo & targetLo) === p.lo && (p.hi & targetHi) === p.hi,
    );
  }

  let solucion: Record<number, number> | null = null;

  function buscar(
    remLo: number,
    remHi: number,
    usados: Record<number, number>,
  ): boolean {
    if (remLo === 0 && remHi === 0) {
      solucion = { ...usados };
      return true;
    }

    // Elegir la primera celda 'hundido' aún sin cubrir (orden determinista).
    let celda = -1;
    if (remLo !== 0) {
      for (let i = 0; i < 32; i++) {
        if ((remLo & (1 << i)) !== 0) {
          celda = i;
          break;
        }
      }
    } else {
      for (let i = 0; i < 32; i++) {
        if ((remHi & (1 << i)) !== 0) {
          celda = i + 32;
          break;
        }
      }
    }
    if (celda < 0) return false;

    const cLo = celda < 32 ? (1 << celda) >>> 0 : 0;
    const cHi = celda >= 32 ? (1 << (celda - 32)) >>> 0 : 0;

    for (const long of longitudes) {
      if (usados[long] >= maxCounts[long]) continue;
      const lista = dentro[long];
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i];
        if ((p.lo & cLo) === 0 && (p.hi & cHi) === 0) continue;
        if ((p.lo & remLo) !== p.lo || (p.hi & remHi) !== p.hi) continue;
        usados[long]++;
        if (buscar((remLo & ~p.lo) >>> 0, (remHi & ~p.hi) >>> 0, usados)) {
          return true;
        }
        usados[long]--;
      }
    }
    return false;
  }

  buscar(targetLo, targetHi, { 4: 0, 3: 0, 2: 0 });

  if (solucion !== null) {
    const restantes: number[] = [];
    for (const long of FLOTA) {
      if (solucion[long] > 0) {
        solucion[long]--;
      } else {
        restantes.push(long);
      }
    }
    return restantes;
  }

  // Respaldo defensivo ante tableros sintéticos inconsistentes.
  let porCubrir = hundidos.length;
  const restantes: number[] = [];
  for (const long of FLOTA) {
    if (porCubrir >= long) {
      porCubrir -= long;
    } else {
      restantes.push(long);
    }
  }
  return restantes;
}

function disparoFacil(disparos: readonly (Resultado | null)[], rng: Rng): number {
  const libres: number[] = [];
  const esTocado = new Uint8Array(TOTAL);
  let hayTocados = false;
  for (let i = 0; i < TOTAL; i++) {
    if (disparos[i] === null) libres.push(i);
    else if (disparos[i] === 'tocado') {
      esTocado[i] = 1;
      hayTocados = true;
    }
  }

  if (hayTocados) {
    const adyacentes: number[] = [];
    const noAdyacentes: number[] = [];
    for (let i = 0; i < libres.length; i++) {
      const c = libres[i];
      if (ORTHO[c].some(v => esTocado[v] === 1)) adyacentes.push(c);
      else noAdyacentes.push(c);
    }
    if (adyacentes.length > 0) {
      if (rng() < 0.4) return elegirAlAzar(adyacentes, rng);
      if (noAdyacentes.length > 0) return elegirAlAzar(noAdyacentes, rng);
    }
  }

  return elegirAlAzar(libres, rng);
}

function disparoMedio(disparos: readonly (Resultado | null)[], rng: Rng): number {
  const tocados: number[] = [];
  const esTocado = new Uint8Array(TOTAL);
  const libres: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (disparos[i] === 'tocado') {
      tocados.push(i);
      esTocado[i] = 1;
    } else if (disparos[i] === null) {
      libres.push(i);
    }
  }

  if (tocados.length > 0) {
    // Seguimiento de eje si existen dos o más 'tocado' alineados contiguos.
    const ejeSet = new Set<number>();
    for (let i = 0; i < tocados.length; i++) {
      const idx = tocados[i];
      const r = Math.floor(idx / TAMANO);
      const c = idx % TAMANO;

      if (c + 1 < TAMANO && esTocado[idx + 1] === 1) {
        let cc = c - 1;
        while (cc >= 0 && esTocado[r * TAMANO + cc] === 1) cc--;
        if (cc >= 0 && disparos[r * TAMANO + cc] === null) ejeSet.add(r * TAMANO + cc);

        cc = c + 2;
        while (cc < TAMANO && esTocado[r * TAMANO + cc] === 1) cc++;
        if (cc < TAMANO && disparos[r * TAMANO + cc] === null) ejeSet.add(r * TAMANO + cc);
      }

      if (r + 1 < TAMANO && esTocado[idx + TAMANO] === 1) {
        let rr = r - 1;
        while (rr >= 0 && esTocado[rr * TAMANO + c] === 1) rr--;
        if (rr >= 0 && disparos[rr * TAMANO + c] === null) ejeSet.add(rr * TAMANO + c);

        rr = r + 2;
        while (rr < TAMANO && esTocado[rr * TAMANO + c] === 1) rr++;
        if (rr < TAMANO && disparos[rr * TAMANO + c] === null) ejeSet.add(rr * TAMANO + c);
      }
    }
    if (ejeSet.size > 0) return elegirAlAzar([...ejeSet], rng);

    // Vecinos ortogonales de cualquier 'tocado'.
    const adySet = new Set<number>();
    for (let i = 0; i < tocados.length; i++) {
      const vs = ORTHO[tocados[i]];
      for (let j = 0; j < vs.length; j++) {
        if (disparos[vs[j]] === null) adySet.add(vs[j]);
      }
    }
    if (adySet.size > 0) return elegirAlAzar([...adySet], rng);
  }

  // Modo caza: paridad de ajedrez filtrando celdas donde aún quepa el barco mínimo.
  const restantes = deducirBarcosRestantes(disparos);
  const minLen = restantes.length > 0 ? Math.min(...restantes) : 2;
  let deadLo = 0;
  let deadHi = 0;
  for (let i = 0; i < TOTAL; i++) {
    if (disparos[i] === 'agua' || disparos[i] === 'hundido') {
      if (i < 32) deadLo = (deadLo | (1 << i)) >>> 0;
      else deadHi = (deadHi | (1 << (i - 32))) >>> 0;
    }
  }
  const caben = new Uint8Array(TOTAL);
  for (const p of PLACEMENTS_BY_LEN[minLen]) {
    if ((p.lo & deadLo) === 0 && (p.hi & deadHi) === 0) {
      for (let k = 0; k < p.cells.length; k++) caben[p.cells[k]] = 1;
    }
  }

  const paridadCabida: number[] = [];
  const paridadLibre: number[] = [];
  const cabidaLibre: number[] = [];
  for (let i = 0; i < libres.length; i++) {
    const idx = libres[i];
    const r = Math.floor(idx / TAMANO);
    const c = idx % TAMANO;
    const esPar = (r + c) % 2 === 0;
    if (esPar && caben[idx] === 1) paridadCabida.push(idx);
    if (esPar) paridadLibre.push(idx);
    if (caben[idx] === 1) cabidaLibre.push(idx);
  }

  if (paridadCabida.length > 0) return elegirAlAzar(paridadCabida, rng);
  if (paridadLibre.length > 0) return elegirAlAzar(paridadLibre, rng);
  if (cabidaLibre.length > 0) return elegirAlAzar(cabidaLibre, rng);
  return elegirAlAzar(libres, rng);
}

function disparoDificil(disparos: readonly (Resultado | null)[], rng: Rng): number {
  const restantes = deducirBarcosRestantes(disparos);
  const tocados: number[] = [];
  const libres: number[] = [];
  let deadLo = 0;
  let deadHi = 0;

  for (let i = 0; i < TOTAL; i++) {
    const r = disparos[i];
    if (r === null) {
      libres.push(i);
    } else if (r === 'tocado') {
      tocados.push(i);
    } else {
      if (i < 32) deadLo = (deadLo | (1 << i)) >>> 0;
      else deadHi = (deadHi | (1 << (i - 32))) >>> 0;
    }
  }

  const scores = new Float64Array(TOTAL);
  const validos: Record<number, Placement[]> = {
    2: PLACEMENTS_BY_LEN[2].filter(p => (p.lo & deadLo) === 0 && (p.hi & deadHi) === 0),
    3: PLACEMENTS_BY_LEN[3].filter(p => (p.lo & deadLo) === 0 && (p.hi & deadHi) === 0),
    4: PLACEMENTS_BY_LEN[4].filter(p => (p.lo & deadLo) === 0 && (p.hi & deadHi) === 0),
  };

  if (tocados.length === 0) {
    // Mapa de densidad probabilística sobre barcos aún a flote.
    for (let s = 0; s < restantes.length; s++) {
      const lista = validos[restantes[s]];
      for (let i = 0; i < lista.length; i++) {
        const cells = lista[i].cells;
        for (let k = 0; k < cells.length; k++) {
          scores[cells[k]] += 1;
        }
      }
    }
  } else {
    // Densidad bayesiana condicionada a que los barcos a flote expliquen TODOS los 'tocado'.
    const remCounts: Record<number, number> = { 4: 0, 3: 0, 2: 0 };
    for (let i = 0; i < restantes.length; i++) remCounts[restantes[i]]++;

    const [hitLo, hitHi] = maskFromCells(tocados);
    const longitudes = [4, 3, 2] as const;

    // Precomputar para cada 'tocado' qué colocaciones válidas lo cubren.
    const cubrenTocado = new Map<number, { long: number; p: Placement }[]>();
    for (let i = 0; i < tocados.length; i++) {
      const t = tocados[i];
      const tLo = t < 32 ? (1 << t) >>> 0 : 0;
      const tHi = t >= 32 ? (1 << (t - 32)) >>> 0 : 0;
      const opciones: { long: number; p: Placement }[] = [];
      for (const long of longitudes) {
        if (remCounts[long] === 0) continue;
        const lista = validos[long];
        for (let j = 0; j < lista.length; j++) {
          const p = lista[j];
          if ((p.lo & tLo) !== 0 || (p.hi & tHi) !== 0) {
            opciones.push({ long, p });
          }
        }
      }
      cubrenTocado.set(t, opciones);
    }

    const contarDisjoint = (long: number, uLo: number, uHi: number): number => {
      const lista = validos[long];
      let cnt = 0;
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i];
        if ((p.lo & uLo) === 0 && (p.hi & uHi) === 0) cnt++;
      }
      return cnt;
    };

    let nodos = 0;
    const MAX_NODOS = 1500;

    function cubrir(
      remHitLo: number,
      remHitHi: number,
      usedLo: number,
      usedHi: number,
    ): void {
      if (nodos >= MAX_NODOS) return;
      nodos++;

      if (remHitLo === 0 && remHitHi === 0) {
        let peso = 1;
        for (const long of longitudes) {
          const r = remCounts[long];
          if (r === 0) continue;
          const w = contarDisjoint(long, usedLo, usedHi);
          if (w < r) return;
          peso *= r === 1 ? w : w * (w - 1);
        }
        for (let i = 0; i < libres.length; i++) {
          const c = libres[i];
          const bit = c < 32 ? (usedLo & (1 << c)) !== 0 : (usedHi & (1 << (c - 32))) !== 0;
          if (bit) scores[c] += peso;
        }
        return;
      }

      // MRV: elegir el 'tocado' sin cubrir con menos opciones disponibles ahora.
      let mejorT = -1;
      let mejorCount = Infinity;
      for (let i = 0; i < tocados.length; i++) {
        const t = tocados[i];
        const sinCubrir =
          t < 32 ? (remHitLo & (1 << t)) !== 0 : (remHitHi & (1 << (t - 32))) !== 0;
        if (!sinCubrir) continue;
        const ops = cubrenTocado.get(t)!;
        let disponibles = 0;
        for (let j = 0; j < ops.length; j++) {
          const op = ops[j];
          if (
            remCounts[op.long] > 0 &&
            (op.p.lo & usedLo) === 0 &&
            (op.p.hi & usedHi) === 0
          ) {
            disponibles++;
          }
        }
        if (disponibles === 0) return;
        if (disponibles < mejorCount) {
          mejorCount = disponibles;
          mejorT = t;
          if (disponibles === 1) break;
        }
      }

      if (mejorT < 0) return;
      const ops = cubrenTocado.get(mejorT)!;
      for (let j = 0; j < ops.length; j++) {
        const op = ops[j];
        if (remCounts[op.long] === 0) continue;
        if ((op.p.lo & usedLo) !== 0 || (op.p.hi & usedHi) !== 0) continue;
        remCounts[op.long]--;
        cubrir(
          (remHitLo & ~op.p.lo) >>> 0,
          (remHitHi & ~op.p.hi) >>> 0,
          (usedLo | op.p.lo) >>> 0,
          (usedHi | op.p.hi) >>> 0,
        );
        remCounts[op.long]++;
      }
    }

    cubrir(hitLo, hitHi, 0, 0);

    // Respaldo defensivo si ningún reparto completo existiera (tableros sintéticos).
    let maxActual = 0;
    for (let i = 0; i < libres.length; i++) {
      if (scores[libres[i]] > maxActual) maxActual = scores[libres[i]];
    }
    if (maxActual === 0) {
      for (let s = 0; s < restantes.length; s++) {
        const lista = validos[restantes[s]];
        for (let i = 0; i < lista.length; i++) {
          const p = lista[i];
          const loH = (p.lo & hitLo) >>> 0;
          const hiH = (p.hi & hitHi) >>> 0;
          if (loH === 0 && hiH === 0) continue;
          let hits = 0;
          for (let k = 0; k < p.cells.length; k++) {
            if (disparos[p.cells[k]] === 'tocado') hits++;
          }
          const peso = Math.pow(10, hits);
          for (let k = 0; k < p.cells.length; k++) {
            const c = p.cells[k];
            if (disparos[c] === null) scores[c] += peso;
          }
        }
      }
    }
  }

  let mejorScore = -1;
  let mejores: number[] = [];
  for (let i = 0; i < libres.length; i++) {
    const c = libres[i];
    const s = scores[c];
    if (s > mejorScore) {
      mejorScore = s;
      mejores = [c];
    } else if (s === mejorScore) {
      mejores.push(c);
    }
  }

  if (mejorScore <= 0) return disparoMedio(disparos, rng);
  return elegirAlAzar(mejores, rng);
}

/**
 * Elige la jugada del bot de Batalla Naval (colocación de flota o disparo)
 * respetando estrictamente la información visible en `state.disparos[yo]`.
 */
export function elegirMovimiento(
  state: BattleshipState,
  dificultad: Dificultad,
  rng: Rng = Math.random,
): Move {
  if (state.fase === 'colocacion') {
    return { tipo: 'flota', barcos: colocarFlota(dificultad, rng) };
  }

  const disparos = state.disparos[state.currentPlayer];
  if (dificultad === 'facil') {
    return { tipo: 'disparo', celda: disparoFacil(disparos, rng) };
  }
  if (dificultad === 'medio') {
    return { tipo: 'disparo', celda: disparoMedio(disparos, rng) };
  }
  return { tipo: 'disparo', celda: disparoDificil(disparos, rng) };
}
