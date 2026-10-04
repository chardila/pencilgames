// Confeti ligero en canvas (spec 09, R5): ~2 s, sin librerías, sin bloquear el
// toque (pointer-events: none) y sin acumularse si se gana varias veces.
export interface Particula {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  talla: number;
  giro: number;
}

const COLORES = ['#e63946', '#f4a261', '#2a9d8f', '#457b9d', '#ffd166'];
const GRAVEDAD = 600;
const DURACION_MS = 2000;
const CANTIDAD = 60;

export function crearParticulas(
  n: number,
  ancho: number,
  _alto: number,
  azar: () => number = Math.random
): Particula[] {
  return Array.from({ length: n }, () => ({
    x: azar() * ancho,
    y: -azar() * 40,
    vx: (azar() - 0.5) * 240,
    vy: azar() * 120,
    color: COLORES[Math.floor(azar() * COLORES.length)],
    talla: 5 + azar() * 5,
    giro: azar() * Math.PI,
  }));
}

export function avanzar(p: Particula[], dt: number, alto: number): Particula[] {
  return p
    .map(q => ({
      ...q,
      x: q.x + q.vx * dt,
      y: q.y + q.vy * dt,
      vy: q.vy + GRAVEDAD * dt,
      giro: q.giro + dt * 6,
    }))
    .filter(q => q.y < alto + 20);
}

let activo: HTMLCanvasElement | null = null;

export function lanzarConfeti(): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  if (activo) return;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext?.('2d');
  if (!ctx) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:20';
  document.body.appendChild(canvas);
  activo = canvas;

  let particulas = crearParticulas(CANTIDAD, canvas.width, canvas.height);
  const inicio = performance.now();
  let previo = inicio;

  function cuadro(ahora: number): void {
    // Si otro confeti (o retirarConfeti) ya tomó el relevo, este se apaga.
    if (activo !== canvas) return;
    const dt = Math.min((ahora - previo) / 1000, 0.05);
    previo = ahora;
    particulas = avanzar(particulas, dt, canvas.height);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    for (const q of particulas) {
      ctx!.save();
      ctx!.translate(q.x, q.y);
      ctx!.rotate(q.giro);
      ctx!.fillStyle = q.color;
      ctx!.fillRect(-q.talla / 2, -q.talla / 2, q.talla, q.talla * 0.6);
      ctx!.restore();
    }
    if (ahora - inicio < DURACION_MS && particulas.length > 0) {
      requestAnimationFrame(cuadro);
    } else {
      retirarConfeti();
    }
  }
  requestAnimationFrame(cuadro);
}

export function retirarConfeti(): void {
  activo?.remove();
  activo = null;
}
