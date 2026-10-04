import { describe, it, expect } from 'vitest';
import { avanzar, crearParticulas, lanzarConfeti, retirarConfeti } from './confeti';

describe('confeti', () => {
  it('crea n partículas dentro del ancho, por encima de la pantalla', () => {
    const p = crearParticulas(60, 800, 600, () => 0.5);
    expect(p).toHaveLength(60);
    for (const q of p) {
      expect(q.x).toBeGreaterThanOrEqual(0);
      expect(q.x).toBeLessThanOrEqual(800);
      expect(q.y).toBeLessThanOrEqual(0);
    }
  });

  it('avanzar mueve con la gravedad y descarta lo que cae fuera', () => {
    const p = [
      { x: 10, y: 0, vx: 0, vy: 100, color: '#f00', talla: 6, giro: 0 },
      { x: 10, y: 590, vx: 0, vy: 400, color: '#0f0', talla: 6, giro: 0 },
    ];
    const sig = avanzar(p, 0.1, 600);
    expect(sig).toHaveLength(1);
    expect(sig[0].y).toBeGreaterThan(0);
  });

  it('es determinista con un generador de azar inyectado', () => {
    const a = crearParticulas(5, 100, 100, () => 0.3);
    const b = crearParticulas(5, 100, 100, () => 0.3);
    expect(a).toEqual(b);
  });

  it('sin document (Node) lanzar y retirar no lanzan', () => {
    expect(() => lanzarConfeti()).not.toThrow();
    expect(() => retirarConfeti()).not.toThrow();
  });
});
