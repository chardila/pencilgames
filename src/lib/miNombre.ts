import { DEFAULTS, getPlayerNames } from './players';

const STORAGE_KEY = 'pencilgames:mi-nombre';

export function getMiNombre(): string | null {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    const nombre = guardado?.trim() || null;
    if (nombre) return nombre;
  } catch {
    return null;
  }
  // Sin nombre remoto guardado todavía: si el usuario ya personalizó su
  // nombre en el modal de jugadores local (pasa-y-juega), se reutiliza en
  // vez de volver a preguntar. Si sigue en el valor por defecto sin tocar,
  // no cuenta como "el usuario eligió un nombre" — se sigue devolviendo
  // null para que ModalJuegoRemoto pregunte como antes.
  const nombreLocal = getPlayerNames()[1];
  return nombreLocal !== DEFAULTS[1] ? nombreLocal : null;
}

export function setMiNombre(nombre: string): void {
  const limpio = nombre.trim();
  if (!limpio) return;
  try {
    localStorage.setItem(STORAGE_KEY, limpio);
  } catch {
    // localStorage no disponible: no persiste, no rompe el flujo.
  }
}
