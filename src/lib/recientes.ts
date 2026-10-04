// Últimos juegos abiertos (spec 07). Solo guarda slugs; qué juegos existen
// lo decide la portada. Mismo patrón de try/catch silencioso que marcador.ts:
// si localStorage no está disponible, no persiste pero no rompe nada.

export const CLAVE_RECIENTES = 'pencilgames:recientes';
export const MAX_RECIENTES = 4;

export function obtenerRecientes(): string[] {
  try {
    const raw = localStorage.getItem(CLAVE_RECIENTES);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const vistos = new Set<string>();
    for (const x of parsed) {
      if (typeof x === 'string' && x !== '') vistos.add(x);
    }
    return [...vistos].slice(0, MAX_RECIENTES);
  } catch {
    return [];
  }
}

export function registrarReciente(slug: string): string[] {
  if (slug === '') return obtenerRecientes();
  const nuevos = [slug, ...obtenerRecientes().filter(s => s !== slug)].slice(0, MAX_RECIENTES);
  try {
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(nuevos));
  } catch {
    // localStorage no disponible (modo privado, cuota llena): no persiste,
    // pero abrir un juego nunca debe fallar por esto.
  }
  return nuevos;
}
