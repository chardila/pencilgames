import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CADUCIDAD_MS,
  codificarEstado,
  decodificarEstado,
  borrarPartida,
  guardarPartida,
  hayPartidaGuardada,
  leerPartida,
} from './partidaGuardada';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

const CLAVE = 'pencilgames:partida:gomoku';
const NOMBRES = { 1: 'Ana', 2: 'Beto' };
const DATOS = { nombres: NOMBRES, snapshot: { board: [1, null] }, pila: [{ board: [null, null] }] };
const T0 = 1_700_000_000_000;

describe('partidaGuardada', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('guarda con v: 1 y marca de tiempo, y lee lo mismo de vuelta', () => {
    guardarPartida('gomoku', DATOS, T0);
    expect(JSON.parse(storage.getItem(CLAVE)!)).toEqual({ v: 1, ts: T0, ...DATOS });
    expect(leerPartida('gomoku', T0 + 1000)).toEqual({ v: 1, ts: T0, ...DATOS });
    expect(hayPartidaGuardada('gomoku', T0 + 1000)).toBe(true);
  });

  it('sin entrada devuelve null y hayPartidaGuardada es false', () => {
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(hayPartidaGuardada('gomoku', T0)).toBe(false);
  });

  it('descarta y borra una entrada de más de 24 h; justo en el límite la conserva', () => {
    guardarPartida('gomoku', DATOS, T0);
    expect(leerPartida('gomoku', T0 + CADUCIDAD_MS)).not.toBeNull();
    expect(leerPartida('gomoku', T0 + CADUCIDAD_MS + 1)).toBeNull();
    expect(storage.getItem(CLAVE)).toBeNull();
  });

  it('descarta y borra una entrada con v distinta de 1', () => {
    storage.setItem(CLAVE, JSON.stringify({ v: 0, ts: T0, ...DATOS }));
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(storage.getItem(CLAVE)).toBeNull();
  });

  it('descarta y borra JSON corrupto o de forma inválida sin lanzar', () => {
    const invalidas = [
      '{no es json',
      'null',
      '[]',
      JSON.stringify({ v: 1, ts: 'ayer', ...DATOS }),
      JSON.stringify({ v: 1, ts: T0, nombres: { 1: 'Ana' }, snapshot: {}, pila: [] }),
      JSON.stringify({ v: 1, ts: T0, nombres: NOMBRES, snapshot: {}, pila: 'no' }),
      JSON.stringify({ v: 1, ts: T0, nombres: NOMBRES, pila: [] }),
      JSON.stringify({ v: 1, ts: T0, nombres: NOMBRES, snapshot: null, pila: [] }),
    ];
    for (const raw of invalidas) {
      storage.setItem(CLAVE, raw);
      expect(() => leerPartida('gomoku', T0)).not.toThrow();
      expect(leerPartida('gomoku', T0)).toBeNull();
      expect(storage.getItem(CLAVE)).toBeNull();
    }
  });

  it('descarta una entrada con marca de tiempo en el futuro (reloj cambiado)', () => {
    guardarPartida('gomoku', DATOS, T0 + 2 * 60 * 60 * 1000);
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(storage.getItem(CLAVE)).toBeNull();
  });

  it('borrarPartida elimina la entrada y cada juego tiene la suya', () => {
    guardarPartida('gomoku', DATOS, T0);
    guardarPartida('hex', DATOS, T0);
    borrarPartida('gomoku');
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(leerPartida('hex', T0)).not.toBeNull();
  });

  it('el codificador conserva Map y Set, también anidados (Conquista usa Map)', () => {
    const estado = {
      fences: new Map([
        ['a|b', 1],
        ['c|d', 2],
      ]),
      anidado: { grupo: new Set(['x', 'y']), lista: [new Map([['k', { n: 1 }]])] },
      plano: { board: [1, null, 2] },
    };
    const vuelta = decodificarEstado(codificarEstado(estado));
    expect(vuelta).toEqual(estado);
    expect((vuelta as typeof estado).fences).toBeInstanceOf(Map);
    expect((vuelta as typeof estado).anidado.grupo).toBeInstanceOf(Set);
  });

  it('una partida con Map sobrevive a guardar y leer', () => {
    const conMapa = {
      nombres: NOMBRES,
      snapshot: { state: { fences: new Map([['a|b', 1]]) }, repiteTurno: false },
      pila: [{ state: { fences: new Map() }, repiteTurno: false }],
    };
    guardarPartida('conquista', conMapa, T0);
    const leida = leerPartida('conquista', T0)!;
    expect(leida.snapshot).toEqual(conMapa.snapshot);
    expect(leida.pila).toEqual(conMapa.pila);
  });

  it('si localStorage lanza (modo privado, cuota llena) no rompe nada', () => {
    const roto = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('cuota');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    vi.stubGlobal('localStorage', roto as unknown as Storage);
    expect(() => guardarPartida('gomoku', DATOS, T0)).not.toThrow();
    expect(leerPartida('gomoku', T0)).toBeNull();
    expect(hayPartidaGuardada('gomoku', T0)).toBe(false);
    expect(() => borrarPartida('gomoku')).not.toThrow();
  });
});
