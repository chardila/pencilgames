import { describe, it, expect, vi } from 'vitest';
import { crearSenales } from './senales';

function montar() {
  const emitir = vi.fn();
  const cola: Array<() => void> = [];
  const s = crearSenales(emitir, fn => cola.push(fn));
  const vaciar = () => {
    while (cola.length) cola.shift()!();
  };
  return { s, emitir, vaciar, cola };
}

describe('senales', () => {
  it('no emite hasta que corre el planificador (después de pintar)', () => {
    const { s, emitir, vaciar } = montar();
    s.marcar('toque');
    expect(emitir).not.toHaveBeenCalled();
    vaciar();
    expect(emitir).toHaveBeenCalledWith('toque');
  });

  it('en el mismo tick gana la de mayor prioridad y emite una sola vez', () => {
    const { s, emitir, vaciar } = montar();
    s.marcar('toque');
    s.mejorar('punto');
    s.mejorar('victoria');
    s.mejorar('punto'); // no degrada
    vaciar();
    expect(emitir).toHaveBeenCalledTimes(1);
    expect(emitir).toHaveBeenCalledWith('victoria');
  });

  it('mejorar sin señal pendiente no hace nada (restaurar/deshacer/reiniciar callan)', () => {
    const { s, emitir, vaciar, cola } = montar();
    s.mejorar('victoria');
    expect(cola).toHaveLength(0);
    vaciar();
    expect(emitir).not.toHaveBeenCalled();
  });

  it('error pesa más que toque pero menos que punto', () => {
    const a = montar();
    a.s.marcar('toque');
    a.s.marcar('error');
    a.vaciar();
    expect(a.emitir).toHaveBeenCalledWith('error');
    const b = montar();
    b.s.marcar('error');
    b.s.mejorar('punto');
    b.vaciar();
    expect(b.emitir).toHaveBeenCalledWith('punto');
  });

  it('tras disparar queda limpia y programa otra vez', () => {
    const { s, emitir, vaciar } = montar();
    s.marcar('toque');
    vaciar();
    expect(s.hayPendiente()).toBe(false);
    s.marcar('error');
    vaciar();
    expect(emitir).toHaveBeenNthCalledWith(2, 'error');
  });

  it('programa un solo disparo aunque se marque varias veces', () => {
    const { s, cola } = montar();
    s.marcar('toque');
    s.marcar('toque');
    s.mejorar('punto');
    expect(cola).toHaveLength(1);
  });
});
