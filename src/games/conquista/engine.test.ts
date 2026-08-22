import { describe, expect, test } from 'vitest';
import { ALL_CANDIDATES, GRID_SIZE, fenceKey } from './engine';

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
});
