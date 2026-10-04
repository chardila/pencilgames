import type { PlayerNames } from './players';

// Persistencia de la partida local en curso (spec 06). Estado serializable,
// nunca DOM. Mismo patrón de try/catch silencioso que marcador.ts: si
// localStorage no está disponible, no persiste pero no rompe la partida.

export const VERSION_PARTIDA = 1;
export const CADUCIDAD_MS = 24 * 60 * 60 * 1000;
// Margen para relojes ligeramente desfasados; más allá, una entrada "del
// futuro" nunca caducaría, así que se descarta.
const TOLERANCIA_FUTURO_MS = 60 * 60 * 1000;

export interface DatosPartida {
  nombres: PlayerNames;
  snapshot: unknown;
  pila: unknown[];
}

export interface PartidaGuardada extends DatosPartida {
  v: 1;
  ts: number;
}

// JSON no entiende Map ni Set (los vuelve `{}` / `[]` vacíos sin avisar) y
// Conquista guarda sus vallas en un Map. Se marcan con `__tipo` para poder
// reconstruirlos; el resto del estado va como JSON normal.
function reemplazar(_clave: string, valor: unknown): unknown {
  if (valor instanceof Map) return { __tipo: 'Map', entradas: [...valor] };
  if (valor instanceof Set) return { __tipo: 'Set', valores: [...valor] };
  return valor;
}

function revivir(_clave: string, valor: unknown): unknown {
  if (typeof valor === 'object' && valor !== null) {
    const v = valor as { __tipo?: string; entradas?: unknown; valores?: unknown };
    if (v.__tipo === 'Map' && Array.isArray(v.entradas)) {
      return new Map(v.entradas as [unknown, unknown][]);
    }
    if (v.__tipo === 'Set' && Array.isArray(v.valores)) return new Set(v.valores);
  }
  return valor;
}

export function codificarEstado(valor: unknown): string {
  return JSON.stringify(valor, reemplazar);
}

export function decodificarEstado(texto: string): unknown {
  return JSON.parse(texto, revivir);
}

function clave(slug: string): string {
  return `pencilgames:partida:${slug}`;
}

export function guardarPartida(
  slug: string,
  datos: DatosPartida,
  ahora: number = Date.now()
): void {
  const entrada: PartidaGuardada = { v: VERSION_PARTIDA, ts: ahora, ...datos };
  try {
    localStorage.setItem(clave(slug), codificarEstado(entrada));
  } catch {
    // localStorage no disponible (modo privado, cuota llena): no persiste.
  }
}

export function borrarPartida(slug: string): void {
  try {
    localStorage.removeItem(clave(slug));
  } catch {
    // ignore
  }
}

function esEntradaValida(parsed: unknown): parsed is PartidaGuardada {
  if (typeof parsed !== 'object' || parsed === null) return false;
  const p = parsed as Record<string, unknown>;
  if (p.v !== VERSION_PARTIDA) return false;
  if (typeof p.ts !== 'number' || !Number.isFinite(p.ts)) return false;
  const nombres = p.nombres as Record<string, unknown> | null | undefined;
  if (typeof nombres?.[1] !== 'string' || typeof nombres?.[2] !== 'string') return false;
  if (!Array.isArray(p.pila)) return false;
  return typeof p.snapshot === 'object' && p.snapshot !== null;
}

export function leerPartida(
  slug: string,
  ahora: number = Date.now()
): PartidaGuardada | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(clave(slug));
  } catch {
    return null;
  }
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = decodificarEstado(raw);
  } catch {
    borrarPartida(slug);
    return null;
  }

  if (
    !esEntradaValida(parsed) ||
    ahora - parsed.ts > CADUCIDAD_MS ||
    parsed.ts - ahora > TOLERANCIA_FUTURO_MS
  ) {
    borrarPartida(slug);
    return null;
  }
  return parsed;
}

export function hayPartidaGuardada(slug: string, ahora: number = Date.now()): boolean {
  return leerPartida(slug, ahora) !== null;
}
