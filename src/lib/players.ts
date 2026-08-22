export type Player = 1 | 2;
export type PlayerNames = Record<Player, string>;

const STORAGE_KEY = 'pencilgames:jugadores';
export const DEFAULTS: PlayerNames = { 1: 'Jugador 1', 2: 'Jugador 2' };

export function getPlayerNames(): PlayerNames {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return { ...DEFAULTS };
  }

  if (!raw) return { ...DEFAULTS };

  try {
    const parsed = JSON.parse(raw);
    const nombre1 = typeof parsed?.[1] === 'string' ? parsed[1].trim() : '';
    const nombre2 = typeof parsed?.[2] === 'string' ? parsed[2].trim() : '';
    return {
      1: nombre1 || DEFAULTS[1],
      2: nombre2 || DEFAULTS[2],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePlayerNames(nombres: PlayerNames): void {
  const aGuardar: PlayerNames = {
    1: nombres[1].trim() || DEFAULTS[1],
    2: nombres[2].trim() || DEFAULTS[2],
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(aGuardar));
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): no
    // persiste, pero no debe romper el flujo de guardado del modal.
  }
}

export function hasStoredPlayerNames(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

// Comparación sin distinguir mayúsculas ni espacios al borde: "Ana" y " ana "
// cuentan como el mismo nombre. Se usa para impedir que ambos jugadores
// terminen con nombres iguales en el marcador (ModalJugadores.astro compara
// los nombres ya resueltos, no el texto crudo de los inputs).
export function nombresColisionan(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
