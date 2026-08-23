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
  // Corrección encontrada por el test de propiedad (Task 8), no en el diseño
  // original: dos fences LARGAS distintas pueden compartir la misma mitad
  // entre sí (p. ej., en 6×6, (0,5)-(2,5) y (1,5)-(3,5) comparten el
  // sub-segmento (1,5)-(2,5)) — una regla que solo conecta "larga ↔ sus
  // propias mitades" y "primitiva ↔ larga(s) que la contienen" nunca conecta
  // esas dos fences largas entre sí, dejando pasar un solapamiento real como
  // legal. La regla correcta es una sola, sin casos especiales: el grupo de
  // cualquier candidato es la unión de TODOS los candidatos (primitivos o
  // largos) que tocan cualquiera de sus propios sub-segmentos.
  const touchers = new Map<string, string[]>();
  for (const c of candidates) {
    for (const sub of c.subSegments) {
      const subKey = fenceKey(sub.a, sub.b);
      const list = touchers.get(subKey) ?? [];
      list.push(c.key);
      touchers.set(subKey, list);
    }
  }

  for (const c of candidates) {
    const group = c.collinearGroup;
    group.add(c.key);
    for (const sub of c.subSegments) {
      const subKey = fenceKey(sub.a, sub.b);
      group.add(subKey);
      for (const other of touchers.get(subKey) ?? []) {
        group.add(other);
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
// como cruce — es un empalme en T válido (sección 1 del spec). El
// solapamiento colineal genuino (incluyendo dos fences largas distintas que
// comparten una mitad, p. ej. (0,5)-(2,5) y (1,5)-(3,5)) produce orientaciones
// = 0 y por tanto tampoco se marca como cruce — eso lo cubre `collinearGroup`
// (Task 2), que es el único responsable de detectar y prohibir esos casos.
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

function samePoint(p: Point, q: Point): boolean {
  return p.row === q.row && p.col === q.col;
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

const MAX_FACE_STEPS = 600; // cota generosa: bien por encima de 2 × 270 aristas dirigidas.

function traceFace(graph: Graph, startU: Point, startV: Point, visited: Set<string>): Point[] {
  const cycle: Point[] = [startU];
  let prev = startU;
  let curr = startV;
  visited.add(`${pointKey(startU)}->${pointKey(startV)}`);

  for (let i = 0; i < MAX_FACE_STEPS; i++) {
    const neighbors = graph.neighbors.get(pointKey(curr)) ?? [];
    const idx = neighbors.findIndex(p => samePoint(p, prev));
    const next = neighbors[(idx + 1) % neighbors.length];

    // Cierre correcto: comparar la ARISTA DIRIGIDA que se va a tomar contra
    // la de inicio, no solo el vértice `curr`. Ver spec sección 3,
    // "Corrección importante".
    if (samePoint(curr, startU) && samePoint(next, startV)) return cycle;

    cycle.push(curr);
    visited.add(`${pointKey(curr)}->${pointKey(next)}`);
    prev = curr;
    curr = next;
  }
  throw new Error('traceFace: el ciclo no cerró — el grafo no debería llegar a este estado');
}

export function signedArea(vertices: Point[]): number {
  let sum = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p = vertices[i];
    const q = vertices[(i + 1) % n];
    sum += p.col * q.row - q.col * p.row;
  }
  return sum / 2;
}

export function extractBoundedFaces(
  fences: Map<string, ConquistaPlayer>
): Array<{ vertices: Point[]; area: number }> {
  const graph = buildGraph(fences);
  const visited = new Set<string>();
  const result: Array<{ vertices: Point[]; area: number }> = [];

  for (const [key, neighbors] of graph.neighbors) {
    const [row, col] = key.split(',').map(Number);
    const u: Point = { row, col };
    for (const v of neighbors) {
      const dKey = `${key}->${pointKey(v)}`;
      if (visited.has(dKey)) continue;
      const cycle = traceFace(graph, u, v, visited);
      const signed = signedArea(cycle);
      if (signed < 0) {
        result.push({ vertices: cycle, area: -signed });
      }
      // signed >= 0: cara exterior (o degenerada) — se descarta, ver la
      // nota de implementación arriba de esta tarea.
    }
  }
  return result;
}

export function createInitialState(): ConquistaState {
  return {
    size: GRID_SIZE,
    fences: new Map(),
    regions: [],
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
  };
}

function canonicalizeCycle(vertices: Point[]): Point[] {
  let minIdx = 0;
  for (let i = 1; i < vertices.length; i++) {
    if (comparePoints(vertices[i], vertices[minIdx]) < 0) minIdx = i;
  }
  return [...vertices.slice(minIdx), ...vertices.slice(0, minIdx)];
}

function regionKey(vertices: Point[]): string {
  return canonicalizeCycle(vertices).map(pointKey).join('|');
}

export function jugarFence(state: ConquistaState, fence: Fence): ConquistaState {
  if (state.status !== 'playing') return state;

  const info = CANDIDATES_BY_KEY.get(fenceKey(fence.a, fence.b));
  if (!info) return state;
  if (!esFenceLegal(state, info)) return state;

  const fences = new Map(state.fences);
  fences.set(info.key, state.currentPlayer);

  const found = extractBoundedFaces(fences);
  const existingKeys = new Set(state.regions.map(r => r.key));
  const regions = [...state.regions];
  const scores = { ...state.scores };
  let claimedCount = 0;

  for (const face of found) {
    const key = regionKey(face.vertices);
    if (existingKeys.has(key)) continue;
    regions.push({
      vertices: canonicalizeCycle(face.vertices),
      owner: state.currentPlayer,
      area: face.area,
      key,
    });
    scores[state.currentPlayer] += face.area;
    claimedCount++;
  }

  const currentPlayer =
    claimedCount > 0 ? state.currentPlayer : state.currentPlayer === 1 ? 2 : 1;

  const nextState: ConquistaState = {
    ...state,
    fences,
    regions,
    scores,
    currentPlayer,
    status: 'playing',
  };

  const quedaAlguna = ALL_CANDIDATES.some(c => esFenceLegal(nextState, c));
  nextState.status = quedaAlguna ? 'playing' : 'finished';

  return nextState;
}
