// Persistencia del recorrido de entrada a un juego: qué reglas ya se leyeron
// y qué modo de juego (local/remoto) se eligió la última vez. Ver
// specs/03-reducir-friccion-de-entrada.md. Mismo patrón de try/catch
// silencioso que players.ts: si localStorage no está disponible (modo
// privado, cuota llena), el flujo de hoy (mostrar todo) sigue funcionando.

const REGLAS_VISTAS_KEY = 'pencilgames:reglas-vistas';
const MODO_KEY = 'pencilgames:modo';

export type Modo = 'local' | 'remoto';

export function haVistoReglas(slug: string): boolean {
  try {
    const raw = localStorage.getItem(REGLAS_VISTAS_KEY);
    if (!raw) return false;
    const vistos = JSON.parse(raw);
    return Array.isArray(vistos) && vistos.includes(slug);
  } catch {
    return false;
  }
}

export function marcarReglasVistas(slug: string): void {
  try {
    const raw = localStorage.getItem(REGLAS_VISTAS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const vistos: unknown[] = Array.isArray(parsed) ? parsed : [];
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
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    localStorage.setItem(REGLAS_VISTAS_KEY, JSON.stringify(parsed.filter(s => s !== slug)));
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
