export interface Region {
  id: number;
  path: string; // atributo "d" del <path> SVG
  cx: number;
  cy: number;
}

export interface ColMap {
  id: number;
  nombre: string;
  viewBox: string;
  regiones: Region[];
  adyacencias: ReadonlyArray<readonly [number, number]>;
}

function rect(id: number, x1: number, y1: number, x2: number, y2: number): Region {
  return {
    id,
    path: `M${x1} ${y1} H${x2} V${y2} H${x1} Z`,
    cx: (x1 + x2) / 2,
    cy: (y1 + y2) / 2,
  };
}

const MAPA_CUADRAS: ColMap = {
  id: 0,
  nombre: 'Cuadras',
  viewBox: '0 0 120 90',
  regiones: [
    rect(0, 0, 0, 40, 22),
    rect(1, 40, 0, 80, 22),
    rect(2, 80, 0, 120, 22),
    rect(3, 0, 22, 30, 45),
    rect(4, 30, 22, 60, 45),
    rect(5, 60, 22, 90, 45),
    rect(6, 90, 22, 120, 45),
    rect(7, 0, 45, 40, 68),
    rect(8, 40, 45, 80, 68),
    rect(9, 80, 45, 120, 68),
    rect(10, 0, 68, 35, 90),
    rect(11, 35, 68, 75, 90),
    rect(12, 75, 68, 120, 90),
  ],
  adyacencias: [
    [0, 1], [1, 2],
    [0, 3], [0, 4], [1, 4], [1, 5], [2, 5], [2, 6],
    [3, 4], [4, 5], [5, 6],
    [3, 7], [4, 7], [4, 8], [5, 8], [5, 9], [6, 9],
    [7, 8], [8, 9],
    [7, 10], [7, 11], [8, 11], [8, 12], [9, 12],
    [10, 11], [11, 12],
  ],
};

const MAPA_ISLAS: ColMap = {
  id: 1,
  nombre: 'Islas',
  viewBox: '0 0 120 100',
  regiones: [
    rect(0, 40, 35, 80, 65),
    rect(1, 0, 0, 30, 35),
    rect(2, 30, 0, 60, 35),
    rect(3, 60, 0, 90, 35),
    rect(4, 90, 0, 120, 35),
    rect(5, 0, 35, 40, 50),
    rect(6, 80, 35, 120, 50),
    rect(7, 0, 65, 30, 100),
    rect(8, 30, 65, 60, 100),
    rect(9, 60, 65, 90, 100),
    rect(10, 90, 65, 120, 100),
    rect(11, 0, 50, 40, 65),
    rect(12, 80, 50, 120, 65),
  ],
  adyacencias: [
    [1, 2], [2, 3], [3, 4],
    [1, 5], [2, 5], [0, 2], [0, 3], [3, 6], [4, 6],
    [5, 11], [0, 5], [0, 11],
    [6, 12], [0, 6], [0, 12],
    [7, 8], [8, 9], [9, 10],
    [7, 11], [8, 11], [0, 8], [0, 9], [9, 12], [10, 12],
  ],
};

const MAPA_PANAL: ColMap = {
  id: 2,
  nombre: 'Skyline',
  viewBox: '0 0 130 90',
  regiones: [
    rect(0, 0, 0, 26, 45),
    rect(1, 0, 45, 26, 90),
    rect(2, 26, 0, 52, 30),
    rect(3, 26, 30, 52, 60),
    rect(4, 26, 60, 52, 90),
    rect(5, 52, 0, 78, 22),
    rect(6, 52, 45, 78, 90),
    rect(7, 78, 0, 104, 30),
    rect(8, 78, 30, 104, 60),
    rect(9, 78, 60, 104, 90),
    rect(10, 104, 0, 130, 45),
    rect(11, 104, 45, 130, 90),
    rect(12, 52, 22, 78, 45),
  ],
  adyacencias: [
    [0, 1],
    [0, 2], [0, 3], [1, 3], [1, 4],
    [2, 3], [3, 4],
    [2, 5], [2, 12], [3, 12], [3, 6], [4, 6],
    [5, 12], [6, 12],
    [5, 7], [7, 12], [8, 12], [6, 8], [6, 9],
    [7, 8], [8, 9],
    [7, 10], [8, 10], [8, 11], [9, 11],
    [10, 11],
  ],
};

export const MAPAS: readonly ColMap[] = [MAPA_CUADRAS, MAPA_ISLAS, MAPA_PANAL];

export function sonAdyacentes(mapa: ColMap, a: number, b: number): boolean {
  if (a === b) return false;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return mapa.adyacencias.some(([x, y]) => x === lo && y === hi);
}

export function adyacentesDe(mapa: ColMap, region: number): number[] {
  const res: number[] = [];
  for (const [a, b] of mapa.adyacencias) {
    if (a === region) res.push(b);
    else if (b === region) res.push(a);
  }
  return res;
}
