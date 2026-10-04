// Junta las señales de un mismo tick y dispara solo la más fuerte, después de
// pintar (spec 09, R7). Una jugada que anota punto y termina la partida pasa
// por toque → punto → victoria dentro del mismo render: suena una sola vez.
import type { Senal } from './feedback';

const PRIORIDAD: Record<Senal, number> = { toque: 0, error: 1, punto: 2, victoria: 3 };

export interface Senales {
  marcar(senal: Senal): void;
  mejorar(senal: Senal): void;
  hayPendiente(): boolean;
}

function planificadorPorDefecto(fn: () => void): void {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => fn());
  else setTimeout(fn, 0);
}

export function crearSenales(
  emitir: (senal: Senal) => void,
  planificar: (fn: () => void) => void = planificadorPorDefecto
): Senales {
  let pendiente: Senal | null = null;

  function disparar(): void {
    const s = pendiente;
    pendiente = null;
    if (s) emitir(s);
  }

  function marcar(senal: Senal): void {
    const habiaPendiente = pendiente !== null;
    if (pendiente === null || PRIORIDAD[senal] > PRIORIDAD[pendiente]) pendiente = senal;
    if (!habiaPendiente) planificar(disparar);
  }

  return {
    marcar,
    mejorar(senal) {
      if (pendiente !== null) marcar(senal);
    },
    hayPendiente: () => pendiente !== null,
  };
}
