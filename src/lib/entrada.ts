// Persistencia del recorrido de entrada a un juego: qué reglas ya se leyeron
// y qué modo de juego (local/remoto) se eligió la última vez. Ver
// specs/03-reducir-friccion-de-entrada.md. Mismo patrón de try/catch
// silencioso que players.ts: si localStorage no está disponible (modo
// privado, cuota llena), el flujo de hoy (mostrar todo) sigue funcionando.

const REGLAS_VISTAS_KEY = 'pencilgames:reglas-vistas';
const MODO_KEY = 'pencilgames:modo';

export type Modo = 'local' | 'remoto';

function parseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function haVistoReglas(slug: string): boolean {
  try {
    const raw = localStorage.getItem(REGLAS_VISTAS_KEY);
    const vistos = parseArray(raw);
    return vistos.includes(slug);
  } catch {
    return false;
  }
}

export function marcarReglasVistas(slug: string): void {
  try {
    const raw = localStorage.getItem(REGLAS_VISTAS_KEY);
    const vistos = parseArray(raw);
    if (!vistos.includes(slug)) vistos.push(slug);
    localStorage.setItem(REGLAS_VISTAS_KEY, JSON.stringify(vistos));
  } catch {
    // localStorage no disponible: no persiste, no rompe el flujo.
  }
}

export function olvidarReglasVistas(slug: string): void {
  try {
    const raw = localStorage.getItem(REGLAS_VISTAS_KEY);
    if (!raw) return;
    const vistos = parseArray(raw);
    localStorage.setItem(REGLAS_VISTAS_KEY, JSON.stringify(vistos.filter(s => s !== slug)));
  } catch {
    // localStorage no disponible: no persiste, no rompe el flujo.
  }
}

export function getModoGuardado(): Modo | null {
  try {
    const valor = localStorage.getItem(MODO_KEY);
    return valor === 'local' || valor === 'remoto' ? valor : null;
  } catch {
    return null;
  }
}

export function guardarModo(modo: Modo): void {
  try {
    localStorage.setItem(MODO_KEY, modo);
  } catch {
    // localStorage no disponible: no persiste, no rompe el flujo.
  }
}

export function olvidarModo(): void {
  try {
    localStorage.removeItem(MODO_KEY);
  } catch {
    // localStorage no disponible: no persiste, no rompe el flujo.
  }
}

/**
 * Ejecuta `fn` cuando ya corrieron todos los scripts de módulo de la página.
 * Cada componente Astro se emite como un `<script type="module">` aparte, y
 * cada uno corre en su propia tarea: un `setTimeout(0)` puede disparar entre
 * dos de ellos, antes de que los demás registren sus listeners (issue #61).
 * Los módulos son deferred, así que siempre terminan antes de
 * `DOMContentLoaded`; por eso no se comprueba `readyState` (durante la
 * ejecución de módulos ya es "interactive" y llamaría `fn` demasiado pronto).
 */
export function alTerminarDeCargarScripts(fn: () => void): void {
  document.addEventListener('DOMContentLoaded', fn, { once: true });
}
