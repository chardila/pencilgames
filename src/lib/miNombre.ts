const STORAGE_KEY = 'pencilgames:mi-nombre';

export function getMiNombre(): string | null {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    return guardado?.trim() || null;
  } catch {
    return null;
  }
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
