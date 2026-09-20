import type { Player, PlayerNames } from './players';

export type Marcador = Record<Player, number>;

const VACIO: Marcador = { 1: 0, 2: 0 };

function storageKey(slug: string): string {
  return `pencilgames:marcador:${slug}`;
}

export function obtenerMarcador(slug: string): Marcador {
  try {
    const raw = localStorage.getItem(storageKey(slug));
    if (!raw) return { ...VACIO };
    const parsed = JSON.parse(raw);
    const v1 = Number(parsed?.[1]);
    const v2 = Number(parsed?.[2]);
    return {
      1: Number.isFinite(v1) && v1 >= 0 ? v1 : 0,
      2: Number.isFinite(v2) && v2 >= 0 ? v2 : 0,
    };
  } catch {
    return { ...VACIO };
  }
}

// Solo suma para el ganador; un empate (null) no incrementa a nadie.
export function registrarVictoria(slug: string, ganador: Player | null): Marcador {
  const actual = obtenerMarcador(slug);
  if (ganador) actual[ganador]++;
  try {
    localStorage.setItem(storageKey(slug), JSON.stringify(actual));
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): no
    // persiste, pero no debe romper el flujo de la partida.
  }
  return actual;
}

export function limpiarMarcador(slug: string): void {
  try {
    localStorage.removeItem(storageKey(slug));
  } catch {
    // ignore
  }
}

export function formatearMarcador(marcador: Marcador, nombres: PlayerNames): string {
  return `${nombres[1]} ${marcador[1]} · ${nombres[2]} ${marcador[2]}`;
}
