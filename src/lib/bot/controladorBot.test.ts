import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RETRASO_BOT_MS,
  RETRASO_BOT_REDUCIDO_MS,
  crearControladorBot,
} from './controladorBot';

describe('controladorBot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('no programa jugadas mientras está desactivado o en el turno del humano', () => {
    const elegirMovimiento = vi.fn(() => 3);
    const aplicarMovimiento = vi.fn();
    const ctrl = crearControladorBot<number>({
      elegirMovimiento,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });

    ctrl.alCambiarTurno(2);
    vi.advanceTimersByTime(1000);
    expect(elegirMovimiento).not.toHaveBeenCalled();

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(1);
    vi.advanceTimersByTime(1000);
    expect(elegirMovimiento).not.toHaveBeenCalled();
    expect(aplicarMovimiento).not.toHaveBeenCalled();
  });

  it('espera 500 ms en modo normal y aplica el movimiento elegido en turno del bot', () => {
    let dentroDeAplicar = false;
    const elegirMovimiento = vi.fn(() => 4);
    const aplicarMovimiento = vi.fn(() => {
      dentroDeAplicar = ctrl.estaAplicandoJugada();
    });

    const ctrl = crearControladorBot<number>({
      elegirMovimiento,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });

    ctrl.activar('medio', 1);
    ctrl.alCambiarTurno(2);

    vi.advanceTimersByTime(RETRASO_BOT_MS - 1);
    expect(aplicarMovimiento).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(elegirMovimiento).toHaveBeenCalledWith('medio');
    expect(aplicarMovimiento).toHaveBeenCalledWith(4);
    expect(dentroDeAplicar).toBe(true);
    expect(ctrl.estaAplicandoJugada()).toBe(false);
  });

  it('usa 180 ms cuando prefers-reduced-motion está activo', () => {
    const aplicarMovimiento = vi.fn();
    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => 2,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => true,
    });

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(2);

    vi.advanceTimersByTime(RETRASO_BOT_REDUCIDO_MS - 1);
    expect(aplicarMovimiento).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(aplicarMovimiento).toHaveBeenCalledWith(2);
  });

  it('soporta cadenas de turnos repetidos (como Puntos y cajas) jugada por jugada', () => {
    let paso = 0;
    const jugadas = [10, 11];
    const aplicadas: number[] = [];

    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => jugadas[paso++] ?? null,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento: mov => {
        aplicadas.push(mov);
        // El primer movimiento cierra caja y mantiene al bot (jugador 2); el segundo pasa a jugador 1.
        ctrl.alCambiarTurno(aplicadas.length === 1 ? 2 : 1);
      },
      obtenerSnapshot: () => ({ paso, aplicadas }),
      esMovimientoReducido: () => false,
    });

    ctrl.activar('dificil', 1);
    ctrl.alCambiarTurno(2);

    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicadas).toEqual([10]);

    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicadas).toEqual([10, 11]);

    vi.advanceTimersByTime(RETRASO_BOT_MS * 2);
    expect(aplicadas).toEqual([10, 11]);
  });

  it('cancelarTurno y desactivar abortan el timer pendiente', () => {
    const aplicarMovimiento = vi.fn();
    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => 1,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(2);
    vi.advanceTimersByTime(250);
    ctrl.cancelarTurno();
    vi.advanceTimersByTime(1000);
    expect(aplicarMovimiento).not.toHaveBeenCalled();

    ctrl.alCambiarTurno(2);
    ctrl.desactivar();
    vi.advanceTimersByTime(1000);
    expect(aplicarMovimiento).not.toHaveBeenCalled();
  });

  it('si el bot devuelve null, payload inválido o lanza, avisa en consola y no aplica ni entra en bucle', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const aplicarMovimiento = vi.fn();

    const ctrlNull = crearControladorBot<number>({
      elegirMovimiento: () => null,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });
    ctrlNull.activar('facil', 1);
    ctrlNull.alCambiarTurno(2);
    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicarMovimiento).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();

    const ctrlInvalido = crearControladorBot<number>({
      elegirMovimiento: () => 'malo' as unknown as number,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });
    ctrlInvalido.activar('facil', 1);
    ctrlInvalido.alCambiarTurno(2);
    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(aplicarMovimiento).not.toHaveBeenCalled();

    const ctrlError = crearControladorBot<number>({
      elegirMovimiento: () => {
        throw new Error('fallo interno');
      },
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento,
      esMovimientoReducido: () => false,
    });
    ctrlError.activar('facil', 1);
    expect(() => {
      ctrlError.alCambiarTurno(2);
      vi.advanceTimersByTime(RETRASO_BOT_MS);
    }).not.toThrow();
    expect(aplicarMovimiento).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('defensa anti-bucle: si el movimiento no altera el snapshot y el turno vuelve al bot, se detiene', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const estadoFijo = { turno: 2 };
    let intentos = 0;

    const ctrl = crearControladorBot<number>({
      elegirMovimiento: () => 0,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento: () => {
        intentos++;
        ctrl.alCambiarTurno(2);
      },
      obtenerSnapshot: () => estadoFijo,
      esMovimientoReducido: () => false,
    });

    ctrl.activar('facil', 1);
    ctrl.alCambiarTurno(2);
    vi.advanceTimersByTime(RETRASO_BOT_MS * 5);

    expect(intentos).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('alternarAsiento cambia entre 1 y 2 y setDificultad actualiza la dificultad al vuelo', () => {
    const elegirMovimiento = vi.fn(() => 0);
    const ctrl = crearControladorBot<number>({
      elegirMovimiento,
      validarMovimiento: (p): p is number => typeof p === 'number',
      aplicarMovimiento: vi.fn(),
      esMovimientoReducido: () => false,
    });

    ctrl.activar('facil', 1);
    expect(ctrl.getAsientoHumano()).toBe(1);
    expect(ctrl.getAsientoBot()).toBe(2);

    expect(ctrl.alternarAsiento()).toBe(2);
    expect(ctrl.getAsientoHumano()).toBe(2);
    expect(ctrl.getAsientoBot()).toBe(1);

    ctrl.setDificultad('dificil');
    expect(ctrl.getDificultad()).toBe('dificil');
    ctrl.alCambiarTurno(1);
    vi.advanceTimersByTime(RETRASO_BOT_MS);
    expect(elegirMovimiento).toHaveBeenCalledWith('dificil');
  });
});
