import { describe, it, expect } from 'vitest';
import { MAPAS, sonAdyacentes, adyacentesDe, type ColMap } from './maps';

function esConexo(mapa: ColMap): boolean {
  const visitadas = new Set<number>([0]);
  const cola = [0];
  while (cola.length) {
    const r = cola.pop()!;
    for (const v of adyacentesDe(mapa, r)) {
      if (!visitadas.has(v)) {
        visitadas.add(v);
        cola.push(v);
      }
    }
  }
  return visitadas.size === mapa.regiones.length;
}

describe('MAPAS', () => {
  it('hay exactamente 3 mapas con id = índice', () => {
    expect(MAPAS).toHaveLength(3);
    MAPAS.forEach((m, i) => expect(m.id).toBe(i));
  });

  for (const mapa of MAPAS) {
    describe(`mapa ${mapa.id} (${mapa.nombre})`, () => {
      it('tiene entre 11 y 15 regiones con id = índice', () => {
        expect(mapa.regiones.length).toBeGreaterThanOrEqual(11);
        expect(mapa.regiones.length).toBeLessThanOrEqual(15);
        mapa.regiones.forEach((r, i) => expect(r.id).toBe(i));
      });

      it('cada región tiene path no vacío y centro dentro del viewBox', () => {
        const [, , w, h] = mapa.viewBox.split(/\s+/).map(Number);
        expect([w, h].every(n => Number.isFinite(n) && n > 0)).toBe(true);
        for (const r of mapa.regiones) {
          expect(r.path.trim().length).toBeGreaterThan(0);
          expect(r.cx).toBeGreaterThanOrEqual(0);
          expect(r.cx).toBeLessThanOrEqual(w);
          expect(r.cy).toBeGreaterThanOrEqual(0);
          expect(r.cy).toBeLessThanOrEqual(h);
        }
      });

      it('adyacencias: índices en rango, a < b, sin duplicados', () => {
        const vistos = new Set<string>();
        for (const [a, b] of mapa.adyacencias) {
          expect(Number.isInteger(a) && Number.isInteger(b)).toBe(true);
          expect(a).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThan(mapa.regiones.length);
          expect(a).toBeLessThan(b);
          const clave = `${a}-${b}`;
          expect(vistos.has(clave)).toBe(false);
          vistos.add(clave);
        }
      });

      it('ninguna región queda aislada (grado >= 1)', () => {
        for (const r of mapa.regiones) {
          expect(adyacentesDe(mapa, r.id).length).toBeGreaterThanOrEqual(1);
        }
      });

      it('el grafo de regiones es conexo', () => {
        expect(esConexo(mapa)).toBe(true);
      });

      it('las adyacencias declaradas coinciden con la geometría de los rectángulos', () => {
        // path exacto: `M{x1} {y1} H{x2} V{y2} H{x1} Z`
        const rects = mapa.regiones.map(r => {
          const m = r.path.match(
            /^M(-?[\d.]+) (-?[\d.]+) H(-?[\d.]+) V(-?[\d.]+) H(-?[\d.]+) Z$/
          );
          if (!m) throw new Error(`path inesperado: ${r.path}`);
          const [x1, y1, x2, y2] = [m[1], m[2], m[3], m[4]].map(Number);
          return { x1, y1, x2, y2 };
        });

        const solapa = (a1: number, a2: number, b1: number, b2: number) =>
          Math.min(a2, b2) - Math.max(a1, b1) > 0;

        const geom: string[] = [];
        for (let i = 0; i < rects.length; i++) {
          for (let j = i + 1; j < rects.length; j++) {
            const a = rects[i];
            const b = rects[j];
            const bordeVertical =
              (a.x2 === b.x1 || b.x2 === a.x1) &&
              solapa(a.y1, a.y2, b.y1, b.y2);
            const bordeHorizontal =
              (a.y2 === b.y1 || b.y2 === a.y1) &&
              solapa(a.x1, a.x2, b.x1, b.x2);
            if (bordeVertical || bordeHorizontal) geom.push(`${i}-${j}`);
          }
        }

        const declaradas = mapa.adyacencias
          .map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)
          .sort();
        expect(geom.sort()).toEqual(declaradas);
      });

      it('sonAdyacentes es simétrico', () => {
        for (const [a, b] of mapa.adyacencias) {
          expect(sonAdyacentes(mapa, a, b)).toBe(true);
          expect(sonAdyacentes(mapa, b, a)).toBe(true);
        }
        expect(sonAdyacentes(mapa, 0, 0)).toBe(false);
      });
    });
  }
});
