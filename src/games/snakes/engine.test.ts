import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  usados,
  vecinosLibres,
  playMove,
  TAMANO,
  SALIDA_J1,
  SALIDA_J2,
  type SnakesState,
} from './engine';

// Índice fila-mayor en la retícula 7×7.
const idx = (fila: number, col: number) => fila * TAMANO + col;

// Construye un estado a mano (para escenarios de fin de partida).
function estado(
  camino1: number[],
  camino2: number[],
  currentPlayer: 1 | 2 = 1,
): SnakesState {
  return {
    caminos: { 1: camino1, 2: camino2 },
    currentPlayer,
    status: 'playing',
    winner: null,
  };
}

describe('createInitialState', () => {
  it('coloca cada serpiente en su salida, turno del jugador 1', () => {
    const s = createInitialState();
    expect(s.caminos[1]).toEqual([SALIDA_J1]);
    expect(s.caminos[2]).toEqual([SALIDA_J2]);
    expect(SALIDA_J1).toBe(idx(1, 1));
    expect(SALIDA_J2).toBe(idx(5, 5));
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros en [0, 48]', () => {
    expect(esJugadaValida(0)).toBe(true);
    expect(esJugadaValida(48)).toBe(true);
    expect(esJugadaValida(24)).toBe(true);
  });
  it('rechaza fuera de rango, no enteros y no números', () => {
    for (const v of [-1, 49, 3.5, '2', null, undefined, {}, NaN]) {
      expect(esJugadaValida(v)).toBe(false);
    }
  });
});

describe('usados', () => {
  it('en el estado inicial son solo las dos salidas', () => {
    expect(usados(createInitialState())).toEqual(new Set([SALIDA_J1, SALIDA_J2]));
  });
  it('incluye cada punto de ambos caminos', () => {
    const s = estado([8, 9, 10], [40, 39]);
    expect(usados(s)).toEqual(new Set([8, 9, 10, 40, 39]));
  });
});

describe('vecinosLibres', () => {
  it('cabeza inicial de J1 (idx 8): arriba, abajo, izquierda, derecha', () => {
    const s = createInitialState();
    expect(vecinosLibres(s, 1)).toEqual([idx(0, 1), idx(2, 1), idx(1, 0), idx(1, 2)]);
  });
  it('excluye puntos usados por cualquiera de las dos serpientes', () => {
    const s = estado([9, 8], [1]); // cabeza J1 = 8; 9 (derecha) y 1 (arriba) ocupados
    expect(vecinosLibres(s, 1)).toEqual([idx(2, 1), idx(1, 0)]); // abajo, izquierda
  });
  it('acota en esquina superior-izquierda (idx 0): solo abajo y derecha', () => {
    const s = estado([0], [40]);
    expect(vecinosLibres(s, 1)).toEqual([idx(1, 0), idx(0, 1)]);
  });
  it('acota en esquina inferior-derecha (idx 48): solo arriba e izquierda', () => {
    const s = estado([0], [48], 2);
    expect(vecinosLibres(s, 2)).toEqual([idx(5, 6), idx(6, 5)]);
  });
  it('en fila superior (idx 3) no devuelve ningún índice de fila -1', () => {
    const s = estado([3], [40]);
    const vs = vecinosLibres(s, 1);
    expect(vs).toEqual([idx(1, 3), idx(0, 2), idx(0, 4)]);
    expect(vs.every(v => v >= 0 && v < TAMANO * TAMANO)).toBe(true);
  });
  it('devuelve [] cuando la cabeza está totalmente rodeada', () => {
    // Cabeza de J1 en idx 8, sus 4 vecinos ocupados por J2.
    const s = estado([8], [idx(0, 1), idx(2, 1), idx(1, 0), idx(1, 2)]);
    expect(vecinosLibres(s, 1)).toEqual([]);
  });
});

describe('playMove — jugadas válidas', () => {
  it('extiende el camino del jugador actual y alterna el turno', () => {
    const s = playMove(createInitialState(), 9); // J1: 8 -> 9 (derecha)
    expect(s.caminos[1]).toEqual([8, 9]);
    expect(s.caminos[2]).toEqual([40]);
    expect(s.currentPlayer).toBe(2);
    expect(s.status).toBe('playing');
  });
  it('permite jugadas sucesivas de ambos jugadores', () => {
    let s = createInitialState();
    s = playMove(s, 9);   // J1
    s = playMove(s, 39);  // J2: 40 -> 39
    s = playMove(s, 16);  // J1: 9 -> 16 (abajo)
    expect(s.caminos[1]).toEqual([8, 9, 16]);
    expect(s.caminos[2]).toEqual([40, 39]);
    expect(s.currentPlayer).toBe(2);
  });
});

describe('playMove — jugadas rechazadas (estado sin cambios)', () => {
  it('destino no adyacente a la cabeza propia', () => {
    const s = createInitialState();
    expect(playMove(s, 24)).toBe(s);
  });
  it('destino ya usado por la propia serpiente', () => {
    const s = estado([8, 9], [40], 1); // cabeza en 9; 8 sigue en el camino
    expect(playMove(s, 8)).toBe(s);
  });
  it('destino ya usado por la serpiente rival', () => {
    const s = estado([8], [9], 1); // J2 ocupa 9; J1 quiere ir a 9
    expect(playMove(s, 9)).toBe(s);
  });
  it('destino = salida del rival', () => {
    const s = estado([idx(4, 5)], [40], 1); // cabeza J1 encima de la salida J2
    expect(playMove(s, 40)).toBe(s);
  });
  it('índice fuera de rango', () => {
    const s = createInitialState();
    expect(playMove(s, -1)).toBe(s);
    expect(playMove(s, 49)).toBe(s);
    expect(playMove(s, 3.5)).toBe(s);
  });
  it('jugada tras status "won"', () => {
    const won: SnakesState = { ...createInitialState(), status: 'won', winner: 1 };
    expect(playMove(won, 9)).toBe(won);
  });
});

describe('playMove — fin de partida (legalidad por jugador)', () => {
  it('victoria directa: la jugada del jugador actual deja al rival sin salida', () => {
    // Cabeza J2 en idx 8; sus vecinos son 1, 7, 15, 9.
    // J1 (cabeza en idx 2, adyacente a 9) ya ocupa 1, 7 y 15; mueve a 9.
    const s = estado([1, 7, 15, 2], [8], 1);
    const r = playMove(s, 9);
    expect(r.status).toBe('won');
    expect(r.winner).toBe(1);
    expect(r.currentPlayer).toBe(1); // no cambia: gana quien acaba de mover
  });

  it('AUTO-ENCIERRO no termina la partida de inmediato: gana el rival en su siguiente jugada', () => {
    // Cabeza J1 = idx 3 (fila 0, col 3); vecinos: 10 (abajo), 2 (izq), 4 (der).
    // J1 ya ocupa 10, 4, 1 y 9; su único movimiento legal es a 2, que lo autoencierra
    // (vecinos de 2: 9 usado, 1 usado, 3 usado). J2 aún tiene salidas.
    const s = estado([10, 4, 1, 9, 3], [40], 1);
    const r = playMove(s, 2);
    expect(r.status).toBe('playing'); // el auto-encierro NO termina la partida
    expect(r.currentPlayer).toBe(2);
    // La siguiente jugada de J2 evalúa a J1 (sin vecinos libres) → cierre.
    const r2 = playMove(r, 39); // J2: 40 -> 39
    expect(r2.status).toBe('won');
    expect(r2.winner).toBe(2);
    expect(r2.currentPlayer).toBe(2);
  });

  it('doble encierro tras una jugada → sin empate, gana quien acaba de mover', () => {
    // La jugada de J1 deja a AMBAS serpientes sin salida.
    // Cabeza J1 = 2 (fila 0, col 2); cabeza J2 = 16 (fila 2, col 2).
    // J1 mueve a 9 (fila 1, col 2), entre ambas cabezas.
    //   Tras mover, vecinos de 9: 2 (usado), 16 (J2), 8 y 10 (J1) → J1 encerrado.
    //   Vecinos de 16: 9 (ahora J1), 15, 17, 23 (J2) → J2 encerrado.
    const s = estado([8, 10, 2], [15, 17, 23, 16], 1);
    const r = playMove(s, 9); // J1: 2 -> 9
    expect(r.status).toBe('won');
    expect(r.winner).toBe(1); // se evalúa primero al rival (J2): sin salida
    expect(r.currentPlayer).toBe(1);
  });
});

describe('playMove — inmutabilidad', () => {
  it('no muta el state de entrada ni sus arrays de camino', () => {
    const s = createInitialState();
    const snapshot = JSON.stringify(s);
    const c1 = s.caminos[1];
    playMove(s, 9);
    expect(JSON.stringify(s)).toBe(snapshot);
    expect(s.caminos[1]).toBe(c1);
    expect(s.caminos[1]).toEqual([SALIDA_J1]);
  });
});
