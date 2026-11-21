import { codificarEstado } from '../partidaGuardada';
import type { Player } from '../players';
import type { Dificultad } from './tipos';

export const RETRASO_BOT_MS = 500;
export const RETRASO_BOT_REDUCIDO_MS = 180;

export interface ControladorBotConfig<TMovimiento> {
  elegirMovimiento: (dificultad: Dificultad) => TMovimiento | null;
  validarMovimiento: (payload: unknown) => payload is TMovimiento;
  aplicarMovimiento: (movimiento: TMovimiento) => void;
  obtenerSnapshot?: () => unknown;
  esMovimientoReducido?: () => boolean;
}

export interface ControladorBot {
  activar: (dificultad: Dificultad, asientoHumano?: Player) => void;
  desactivar: () => void;
  setDificultad: (dificultad: Dificultad) => void;
  alternarAsiento: () => Player;
  alCambiarTurno: (jugadorActual: Player) => void;
  cancelarTurno: () => void;
  estaActivo: () => boolean;
  estaAplicandoJugada: () => boolean;
  getDificultad: () => Dificultad;
  getAsientoHumano: () => Player;
  getAsientoBot: () => Player;
}

function defectoMovimientoReducido(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

function huellaSnapshot(obtenerSnapshot?: () => unknown): string | null {
  if (!obtenerSnapshot) return null;
  try {
    const huella = codificarEstado(obtenerSnapshot());
    return typeof huella === 'string' ? huella : null;
  } catch {
    return null;
  }
}

export function crearControladorBot<TMovimiento>(
  config: ControladorBotConfig<TMovimiento>
): ControladorBot {
  let activo = false;
  let dificultad: Dificultad = 'facil';
  let asientoHumano: Player = 1;
  let aplicandoJugada = false;
  let timerPendiente: ReturnType<typeof setTimeout> | null = null;
  let epoch = 0;
  let bloqueadoPorSinCambio = false;

  const esMovimientoReducido = config.esMovimientoReducido ?? defectoMovimientoReducido;

  function limpiarTimer(): void {
    epoch++;
    if (timerPendiente !== null) {
      clearTimeout(timerPendiente);
      timerPendiente = null;
    }
  }

  function cancelarTurno(): void {
    limpiarTimer();
    bloqueadoPorSinCambio = false;
  }

  function activar(nuevaDificultad: Dificultad, nuevoAsientoHumano: Player = 1): void {
    limpiarTimer();
    activo = true;
    dificultad = nuevaDificultad;
    asientoHumano = nuevoAsientoHumano;
    bloqueadoPorSinCambio = false;
  }

  function desactivar(): void {
    limpiarTimer();
    activo = false;
    aplicandoJugada = false;
    bloqueadoPorSinCambio = false;
  }

  function setDificultad(nuevaDificultad: Dificultad): void {
    dificultad = nuevaDificultad;
  }

  function alternarAsiento(): Player {
    cancelarTurno();
    asientoHumano = asientoHumano === 1 ? 2 : 1;
    return asientoHumano;
  }

  function getAsientoBot(): Player {
    return asientoHumano === 1 ? 2 : 1;
  }

  function ejecutarJugada(epochEsperado: number): void {
    timerPendiente = null;
    if (!activo || epoch !== epochEsperado) return;

    let movimiento: TMovimiento | null;
    try {
      movimiento = config.elegirMovimiento(dificultad);
    } catch (error) {
      console.warn('Error al calcular la jugada del bot:', error);
      return;
    }

    if (movimiento === null || !config.validarMovimiento(movimiento)) {
      console.warn('El bot devolvió un movimiento inválido:', movimiento);
      return;
    }

    const antes = huellaSnapshot(config.obtenerSnapshot);
    aplicandoJugada = true;
    try {
      config.aplicarMovimiento(movimiento);
    } finally {
      aplicandoJugada = false;
    }

    if (antes !== null && huellaSnapshot(config.obtenerSnapshot) === antes) {
      bloqueadoPorSinCambio = true;
      limpiarTimer();
      console.warn('El movimiento del bot no modificó el estado; se detiene para evitar bucle.');
    }
  }

  function alCambiarTurno(jugadorActual: Player): void {
    if (!activo || jugadorActual === asientoHumano) {
      bloqueadoPorSinCambio = false;
      limpiarTimer();
      return;
    }

    if (bloqueadoPorSinCambio) {
      bloqueadoPorSinCambio = false;
      return;
    }

    limpiarTimer();
    const epochActual = epoch;
    const retraso = esMovimientoReducido() ? RETRASO_BOT_REDUCIDO_MS : RETRASO_BOT_MS;
    timerPendiente = setTimeout(() => ejecutarJugada(epochActual), retraso);
  }

  return {
    activar,
    desactivar,
    setDificultad,
    alternarAsiento,
    alCambiarTurno,
    cancelarTurno,
    estaActivo: () => activo,
    estaAplicandoJugada: () => aplicandoJugada,
    getDificultad: () => dificultad,
    getAsientoHumano: () => asientoHumano,
    getAsientoBot,
  };
}
