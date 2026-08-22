import { describe, expect, test } from 'vitest';
import { ALL_CANDIDATES, GRID_SIZE, fenceKey, CANDIDATES_BY_KEY } from './engine';

describe('catálogo de fences', () => {
  test('tiene exactamente 270 candidatos en la cuadrícula 6×6', () => {
    expect(GRID_SIZE).toBe(6);
    expect(ALL_CANDIDATES.length).toBe(270);
  });

  test('el conteo por tipo de offset coincide con la tabla del spec', () => {
    // Ortogonal corta: (0,1) + (1,0)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 0 && dc === 1) || (dr === 1 && dc === 0);
      }).length
    ).toBe(60);

    // Ortogonal larga: (0,2) + (2,0)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 0 && dc === 2) || (dr === 2 && dc === 0);
      }).length
    ).toBe(48);

    // Diagonal 1×1: (1,1) + (1,-1)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return dr === 1 && dc === 1;
      }).length
    ).toBe(50);

    // Diagonal "caballo": (1,2),(1,-2),(2,1),(2,-1)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return (dr === 1 && dc === 2) || (dr === 2 && dc === 1);
      }).length
    ).toBe(80);

    // Diagonal larga 2×2: (2,2) + (2,-2)
    expect(
      ALL_CANDIDATES.filter(c => {
        const dr = Math.abs(c.fence.b.row - c.fence.a.row);
        const dc = Math.abs(c.fence.b.col - c.fence.a.col);
        return dr === 2 && dc === 2;
      }).length
    ).toBe(32);
  });

  test('fenceKey es estable sin importar el orden de los puntos', () => {
    const a = { row: 1, col: 2 };
    const b = { row: 0, col: 0 };
    expect(fenceKey(a, b)).toBe(fenceKey(b, a));
  });

  test('fences primitivas (mcd=1) tienen un solo elemento en subSegments', () => {
    // Ortogonal corta: offset (0,1)
    const shortOrtho = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 1 }))!;
    expect(shortOrtho.subSegments.length).toBe(1);
    expect(shortOrtho.subSegments[0]).toEqual(shortOrtho.fence);

    // Diagonal 1×1: offset (1,1)
    const diag1x1 = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    expect(diag1x1.subSegments.length).toBe(1);
    expect(diag1x1.subSegments[0]).toEqual(diag1x1.fence);

    // Diagonal "caballo": offset (1,2)
    const knight = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    expect(knight.subSegments.length).toBe(1);
    expect(knight.subSegments[0]).toEqual(knight.fence);
  });

  test('fences no primitivas (mcd=2) tienen 2 subSegments de longitud unitaria con punto medio correcto', () => {
    // Ortogonal larga: offset (0,2) desde (0,0) a (0,2)
    const longHorizontal = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 0, col: 2 }))!;
    expect(longHorizontal.subSegments.length).toBe(2);
    expect(longHorizontal.subSegments[0]).toEqual({ a: { row: 0, col: 0 }, b: { row: 0, col: 1 } });
    expect(longHorizontal.subSegments[1]).toEqual({ a: { row: 0, col: 1 }, b: { row: 0, col: 2 } });

    // Diagonal larga 2×2: offset (2,2) desde (0,0) a (2,2)
    const longDiag = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 }))!;
    expect(longDiag.subSegments.length).toBe(2);
    expect(longDiag.subSegments[0]).toEqual({ a: { row: 0, col: 0 }, b: { row: 1, col: 1 } });
    expect(longDiag.subSegments[1]).toEqual({ a: { row: 1, col: 1 }, b: { row: 2, col: 2 } });

    // Vertical larga: offset (2,0) desde (0,0) a (2,0)
    const longVertical = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 2, col: 0 }))!;
    expect(longVertical.subSegments.length).toBe(2);
    expect(longVertical.subSegments[0]).toEqual({ a: { row: 0, col: 0 }, b: { row: 1, col: 0 } });
    expect(longVertical.subSegments[1]).toEqual({ a: { row: 1, col: 0 }, b: { row: 2, col: 0 } });
  });
});

describe('collinearGroup', () => {
  test('una fence larga (2,2) tiene grupo de tamaño 3 con sus 2 mitades', () => {
    const a = { row: 0, col: 0 };
    const b = { row: 2, col: 2 };
    const mid = { row: 1, col: 1 };
    const larga = CANDIDATES_BY_KEY.get(fenceKey(a, b))!;
    expect(larga.collinearGroup.size).toBe(3);
    expect(larga.collinearGroup.has(fenceKey(a, mid))).toBe(true);
    expect(larga.collinearGroup.has(fenceKey(mid, b))).toBe(true);
  });

  test('una fence primitiva sin fence larga que la contenga tiene grupo de tamaño 1', () => {
    // Diagonal "caballo" (1,2): no es mitad de ninguna fence más larga del catálogo.
    const info = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 2 }))!;
    expect(info.collinearGroup).toEqual(new Set([info.key]));
  });

  test('una mitad de fence larga incluye esa fence larga en su propio grupo', () => {
    const mitad = CANDIDATES_BY_KEY.get(fenceKey({ row: 0, col: 0 }, { row: 1, col: 1 }))!;
    const larga = fenceKey({ row: 0, col: 0 }, { row: 2, col: 2 });
    expect(mitad.collinearGroup.has(larga)).toBe(true);
  });
});
