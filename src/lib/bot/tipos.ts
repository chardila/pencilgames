export type Dificultad = 'facil' | 'medio' | 'dificil';
export type Rng = () => number;

export const NOMBRE_BOT = 'Robot';

export const DIFICULTADES: readonly Dificultad[] = ['facil', 'medio', 'dificil'];

export const DIFICULTAD_INFO: Record<
  Dificultad,
  { icono: string; texto: string; descripcion: string }
> = {
  facil: { icono: '🌱', texto: 'Fácil', descripcion: 'Para aprender' },
  medio: { icono: '🎯', texto: 'Medio', descripcion: 'Partida reñida' },
  dificil: { icono: '🔥', texto: 'Difícil', descripcion: 'Todo un reto' },
};

export function esDificultad(valor: unknown): valor is Dificultad {
  return valor === 'facil' || valor === 'medio' || valor === 'dificil';
}

export function elegirAlAzar<T>(opciones: readonly T[], rng: Rng = Math.random): T {
  if (opciones.length === 0) {
    throw new Error('No se puede elegir al azar de una lista vacía.');
  }
  const indice = Math.min(opciones.length - 1, Math.max(0, Math.floor(rng() * opciones.length)));
  return opciones[indice];
}
