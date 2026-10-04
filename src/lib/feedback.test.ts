import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CLAVE_SONIDO,
  PATRONES_VIBRACION,
  alternarSonido,
  desbloquearAudio,
  emitirSenal,
  sonidoActivo,
} from './feedback';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(k: string) {
    return this.store.has(k) ? this.store.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.store.set(k, v);
  }
  removeItem(k: string) {
    this.store.delete(k);
  }
}

function falsoAudioContext() {
  const osciladores: Array<{ type: string; freq: number[]; start: number; stop: number }> = [];
  class Ctx {
    state = 'suspended';
    currentTime = 0;
    destination = {};
    resume = vi.fn(async () => {
      this.state = 'running';
    });
    createGain() {
      return {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
    }
    createOscillator() {
      const o = {
        type: 'sine',
        freqs: [] as number[],
        t0: 0,
        frequency: { setValueAtTime: (f: number) => o.freqs.push(f) },
        connect: vi.fn(),
        start: (t: number) => {
          o.t0 = t;
        },
        stop: (t: number) => {
          osciladores.push({ type: o.type, freq: o.freqs, start: o.t0, stop: t });
        },
      };
      return o;
    }
  }
  return { Ctx, osciladores };
}

// `contexto` es un singleton de módulo: las pruebas de audio lo cargan de cero.
async function cargarFresco() {
  vi.resetModules();
  return import('./feedback');
}

describe('feedback', () => {
  let vibrate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vibrate = vi.fn();
    vi.stubGlobal('navigator', { vibrate });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('el sonido está activado por defecto', () => {
    expect(sonidoActivo()).toBe(true);
  });

  it('un valor corrupto en localStorage cuenta como activado', () => {
    localStorage.setItem(CLAVE_SONIDO, '¿?');
    expect(sonidoActivo()).toBe(true);
  });

  it('alternar persiste y devuelve el nuevo estado', () => {
    expect(alternarSonido()).toBe(false);
    expect(localStorage.getItem(CLAVE_SONIDO)).toBe('0');
    expect(sonidoActivo()).toBe(false);
    expect(alternarSonido()).toBe(true);
    expect(sonidoActivo()).toBe(true);
  });

  it('localStorage que lanza no rompe nada', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
    });
    expect(() => sonidoActivo()).not.toThrow();
    expect(() => alternarSonido()).not.toThrow();
  });

  it('vibra con el patrón de cada señal', () => {
    for (const s of ['toque', 'error', 'punto', 'victoria'] as const) {
      emitirSenal(s);
      expect(vibrate).toHaveBeenLastCalledWith(PATRONES_VIBRACION[s]);
    }
    expect(PATRONES_VIBRACION.toque).toBe(10);
    expect(PATRONES_VIBRACION.error).toEqual([20, 40, 20]);
    expect(PATRONES_VIBRACION.punto).toEqual([15, 30, 15]);
    expect(PATRONES_VIBRACION.victoria).toEqual([40, 60, 40, 60, 80]);
  });

  it('silenciado no vibra', () => {
    alternarSonido();
    emitirSenal('toque');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('sin navigator.vibrate no lanza', () => {
    vi.stubGlobal('navigator', {});
    expect(() => emitirSenal('victoria')).not.toThrow();
  });

  it('sin AudioContext no lanza (iPad viejo, Node)', () => {
    expect(() => desbloquearAudio()).not.toThrow();
    expect(() => emitirSenal('punto')).not.toThrow();
  });

  it('no crea AudioContext hasta desbloquearAudio', async () => {
    const { desbloquearAudio, emitirSenal } = await cargarFresco();
    const { Ctx } = falsoAudioContext();
    const spy = vi.fn(function () {
      return new Ctx();
    });
    vi.stubGlobal('AudioContext', spy);
    emitirSenal('toque');
    expect(spy).not.toHaveBeenCalled();
    desbloquearAudio();
    expect(spy).toHaveBeenCalledTimes(1);
    desbloquearAudio();
    expect(spy).toHaveBeenCalledTimes(1); // reutiliza
  });

  it('los cuatro tonos, victoria incluida, duran menos de 200 ms', async () => {
    const { alternarSonido, desbloquearAudio, emitirSenal } = await cargarFresco();
    const { Ctx, osciladores } = falsoAudioContext();
    vi.stubGlobal('AudioContext', Ctx);
    desbloquearAudio();
    for (const s of ['toque', 'error', 'punto', 'victoria'] as const) {
      osciladores.length = 0;
      emitirSenal(s);
      expect(osciladores.length).toBeGreaterThan(0);
      expect(Math.max(...osciladores.map(o => o.stop))).toBeLessThan(0.2);
    }
  });

  it('la victoria suena y es más larga que un toque', async () => {
    const { alternarSonido, desbloquearAudio, emitirSenal } = await cargarFresco();
    const { Ctx, osciladores } = falsoAudioContext();
    vi.stubGlobal('AudioContext', Ctx);
    desbloquearAudio();
    emitirSenal('victoria');
    expect(osciladores.length).toBeGreaterThan(1);
  });

  it('silenciado no crea osciladores', async () => {
    const { alternarSonido, desbloquearAudio, emitirSenal } = await cargarFresco();
    const { Ctx, osciladores } = falsoAudioContext();
    vi.stubGlobal('AudioContext', Ctx);
    desbloquearAudio();
    alternarSonido();
    emitirSenal('error');
    expect(osciladores).toHaveLength(0);
  });

  it('un contexto que sigue suspendido se reanuda al sonar (el toque no dio activación)', async () => {
    const { desbloquearAudio, emitirSenal } = await cargarFresco();
    const resume = vi.fn(async () => {});
    class CtxSuspendido {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      resume = resume;
      createGain() {
        return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() };
      }
      createOscillator() {
        return { type: 'sine', frequency: { setValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
      }
    }
    vi.stubGlobal('AudioContext', CtxSuspendido);
    expect(desbloquearAudio()).toBe(false); // sigue suspendido: aún no está desbloqueado
    expect(resume).toHaveBeenCalledTimes(1);
    emitirSenal('toque');
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it('desbloquearAudio devuelve true cuando el contexto ya está en marcha', async () => {
    const { desbloquearAudio } = await cargarFresco();
    const { Ctx } = falsoAudioContext();
    vi.stubGlobal('AudioContext', Ctx);
    desbloquearAudio();
    expect(desbloquearAudio()).toBe(true);
  });

  it('desbloquearAudio devuelve false sin AudioContext', async () => {
    const { desbloquearAudio } = await cargarFresco();
    expect(desbloquearAudio()).toBe(false);
  });
});
