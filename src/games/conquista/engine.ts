export interface Point {
  row: number;
  col: number;
}

export type ConquistaPlayer = 1 | 2;

export interface Fence {
  a: Point;
  b: Point;
}

export const GRID_SIZE = 6;

function comparePoints(a: Point, b: Point): number {
  if (a.row !== b.row) return a.row - b.row;
  return a.col - b.col;
}

function pointKey(p: Point): string {
  return `${p.row},${p.col}`;
}

export function fenceKey(a: Point, b: Point): string {
  const [p, q] = comparePoints(a, b) <= 0 ? [a, b] : [b, a];
  return `${pointKey(p)}-${pointKey(q)}`;
}

function canonicalFence(a: Point, b: Point): Fence {
  return comparePoints(a, b) <= 0 ? { a, b } : { a: b, b: a };
}

function inBounds(p: Point): boolean {
  return p.row >= 0 && p.row < GRID_SIZE && p.col >= 0 && p.col < GRID_SIZE;
}

function gcd(x: number, y: number): number {
  let a = Math.abs(x);
  let b = Math.abs(y);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

// Las 12 orientaciones canónicas del catálogo (sección 1 del spec): una sola
// dirección por línea (dr > 0, o dr === 0 && dc > 0) para no contar cada
// línea dos veces en sentidos opuestos.
const OFFSETS: Array<{ dr: number; dc: number }> = [
  { dr: 0, dc: 1 },
  { dr: 0, dc: 2 },
  { dr: 1, dc: 0 },
  { dr: 2, dc: 0 },
  { dr: 1, dc: 1 },
  { dr: 1, dc: -1 },
  { dr: 1, dc: 2 },
  { dr: 1, dc: -2 },
  { dr: 2, dc: 1 },
  { dr: 2, dc: -1 },
  { dr: 2, dc: 2 },
  { dr: 2, dc: -2 },
];

export interface FenceInfo {
  fence: Fence;
  key: string;
  subSegments: Fence[];
  collinearGroup: Set<string>;
  crossesWith: Set<string>;
}

function computeSubSegments(fence: Fence): Fence[] {
  const dr = fence.b.row - fence.a.row;
  const dc = fence.b.col - fence.a.col;
  if (gcd(dr, dc) === 1) return [fence];
  // Solo (0,±2), (±2,0) y (±2,±2) tienen mcd = 2 en este catálogo — pasan
  // exactamente por su propio punto medio (sección 1 del spec).
  const mid: Point = { row: fence.a.row + dr / 2, col: fence.a.col + dc / 2 };
  return [canonicalFence(fence.a, mid), canonicalFence(mid, fence.b)];
}

function buildCatalog(): FenceInfo[] {
  const result: FenceInfo[] = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const a: Point = { row, col };
      for (const { dr, dc } of OFFSETS) {
        const b: Point = { row: row + dr, col: col + dc };
        if (!inBounds(b)) continue;
        const fence = canonicalFence(a, b);
        const key = fenceKey(fence.a, fence.b);
        const subSegments = computeSubSegments(fence);
        result.push({ fence, key, subSegments, collinearGroup: new Set(), crossesWith: new Set() });
      }
    }
  }
  return result;
}

function attachCollinearGroups(candidates: FenceInfo[]): void {
  const parentsOfSubSegment = new Map<string, string[]>();
  for (const c of candidates) {
    if (c.subSegments.length === 2) {
      for (const sub of c.subSegments) {
        const subKey = fenceKey(sub.a, sub.b);
        const list = parentsOfSubSegment.get(subKey) ?? [];
        list.push(c.key);
        parentsOfSubSegment.set(subKey, list);
      }
    }
  }

  for (const c of candidates) {
    c.collinearGroup.add(c.key);
    if (c.subSegments.length === 2) {
      for (const sub of c.subSegments) {
        c.collinearGroup.add(fenceKey(sub.a, sub.b));
      }
    } else {
      for (const parentKey of parentsOfSubSegment.get(c.key) ?? []) {
        c.collinearGroup.add(parentKey);
      }
    }
  }
}

function orientation(p: Point, q: Point, r: Point): number {
  const val = (q.col - p.col) * (r.row - p.row) - (q.row - p.row) * (r.col - p.col);
  if (val === 0) return 0;
  return val > 0 ? 1 : -1;
}

// ¿Se cruzan f1 y f2 en un punto ESTRICTAMENTE interior a ambos segmentos?
// Esta es la prueba estándar de "intersección propia" (CLRS): exige que
// las 4 orientaciones sean no-nulas antes de comparar signos. Cualquier
// toque en un extremo compartido, o en el punto de paso intermedio de una
// fence larga (que es un extremo real de la OTRA fence, aunque no lo sea
// de esta), produce al menos una orientación = 0 y por tanto NUNCA cuenta
// como cruce — es un empalme en T válido (sección 1 del spec). No hace
// falta ningún caso especial de colinealidad: el solapamiento colineal
// genuino entre dos candidatos del catálogo solo ocurre entre una fence
// larga y sus propias mitades, y eso ya lo cubre `collinearGroup`
// (Task 2) — nunca entre dos fences primitivas distintas de este catálogo.
function properlyCrosses(f1: Fence, f2: Fence): boolean {
  const o1 = orientation(f1.a, f1.b, f2.a);
  const o2 = orientation(f1.a, f1.b, f2.b);
  const o3 = orientation(f2.a, f2.b, f1.a);
  const o4 = orientation(f2.a, f2.b, f1.b);

  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function attachCrossesWith(candidates: FenceInfo[]): void {
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (properlyCrosses(candidates[i].fence, candidates[j].fence)) {
        candidates[i].crossesWith.add(candidates[j].key);
        candidates[j].crossesWith.add(candidates[i].key);
      }
    }
  }
}

export const ALL_CANDIDATES: FenceInfo[] = buildCatalog();
attachCollinearGroups(ALL_CANDIDATES);
attachCrossesWith(ALL_CANDIDATES);
export const CANDIDATES_BY_KEY: Map<string, FenceInfo> = new Map(
  ALL_CANDIDATES.map(info => [info.key, info])
);

export interface ConquistaRegion {
  vertices: Point[];
  owner: ConquistaPlayer;
  area: number;
  key: string;
}

export interface ConquistaState {
  size: number;
  fences: Map<string, ConquistaPlayer>;
  regions: ConquistaRegion[];
  currentPlayer: ConquistaPlayer;
  scores: Record<ConquistaPlayer, number>;
  status: 'playing' | 'finished';
}

function segmentMidpoint(f: Fence): Point {
  return { row: (f.a.row + f.b.row) / 2, col: (f.a.col + f.b.col) / 2 };
}

// Ray casting estándar, tratando row/col como y/x.
function pointInPolygon(point: Point, vertices: Point[]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i];
    const vj = vertices[j];
    const cruza =
      vi.col > point.col !== vj.col > point.col &&
      point.row < ((vj.row - vi.row) * (point.col - vi.col)) / (vj.col - vi.col) + vi.row;
    if (cruza) inside = !inside;
  }
  return inside;
}

export function esFenceLegal(state: ConquistaState, info: FenceInfo): boolean {
  for (const k of info.collinearGroup) {
    if (state.fences.has(k)) return false;
  }
  for (const k of info.crossesWith) {
    if (state.fences.has(k)) return false;
  }
  for (const sub of info.subSegments) {
    const mid = segmentMidpoint(sub);
    for (const region of state.regions) {
      if (pointInPolygon(mid, region.vertices)) return false;
    }
  }
  return true;
}

export interface Graph {
  neighbors: Map<string, Point[]>;
}

export function buildGraph(fences: Map<string, ConquistaPlayer>): Graph {
  const adjacency = new Map<string, Point[]>();

  function addEdge(p: Point, q: Point): void {
    const key = pointKey(p);
    const list = adjacency.get(key) ?? [];
    list.push(q);
    adjacency.set(key, list);
  }

  for (const key of fences.keys()) {
    const info = CANDIDATES_BY_KEY.get(key);
    if (!info) continue;
    for (const sub of info.subSegments) {
      addEdge(sub.a, sub.b);
      addEdge(sub.b, sub.a);
    }
  }

  for (const [key, list] of adjacency) {
    const [row, col] = key.split(',').map(Number);
    list.sort(
      (p, q) =>
        Math.atan2(p.row - row, p.col - col) - Math.atan2(q.row - row, q.col - col)
    );
  }

  return { neighbors: adjacency };
}
