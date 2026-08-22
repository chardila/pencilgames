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

export const ALL_CANDIDATES: FenceInfo[] = buildCatalog();
export const CANDIDATES_BY_KEY: Map<string, FenceInfo> = new Map(
  ALL_CANDIDATES.map(info => [info.key, info])
);
