import { describe, expect, it } from 'vitest';

// Deshacer (spec 02) guarda snapshots con `structuredClone`. Si el estado de
// algún juego incluyera algo no clonable (funciones, instancias de clase con
// métodos, etc.) el clon perdería datos o `structuredClone` lanzaría, y el
// bug solo aparecería jugando esa partida concreta. Este test lo detecta para
// los 21 motores de una sola vez, sin tener que leerlos todos a mano.
const ENGINES = [
  'agujero-negro',
  'battleship',
  'bridg-it',
  'chomp',
  'col',
  'conquista',
  'domineering',
  'estampida',
  'gomoku',
  'hex',
  'metasquares',
  'nim',
  'notakto',
  'obstruccion',
  'puntos-y-cajas',
  'sim',
  'snakes',
  'sos',
  'tres-en-raya',
  'triggle',
  'y',
] as const;

describe('el estado inicial de cada juego sobrevive a structuredClone', () => {
  it.each(ENGINES)('%s', async juego => {
    const mod: { createInitialState: (...args: never[]) => unknown } =
      await import(`../games/${juego}/engine.ts`);
    const estado = mod.createInitialState();
    const clon = structuredClone(estado);
    expect(clon).toEqual(estado);
  });
});
