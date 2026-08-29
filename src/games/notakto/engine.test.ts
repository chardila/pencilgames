import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove } from './engine';

describe('notakto engine - estado inicial', () => {
  it('empieza con 3 tableros vacíos, ninguno muerto y turno del jugador 1', () => {
    const state = createInitialState();
    expect(state.boards).toHaveLength(3);
    for (const board of state.boards) {
      expect(board).toEqual(Array(9).fill(null));
    }
    expect(state.deadBoards).toEqual([false, false, false]);
    expect(state.deadLines).toEqual([null, null, null]);
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.loser).toBeNull();
    expect(state.winner).toBeNull();
  });
});

describe('notakto engine - playMove', () => {
  it('coloca una X y pasa el turno al otro jugador', () => {
    const next = playMove(createInitialState(), { board: 0, cell: 4 });
    expect(next.boards[0][4]).toBe('X');
    expect(next.currentPlayer).toBe(2);
    expect(next.status).toBe('playing');
  });

  it('ignora una jugada sobre una casilla ocupada', () => {
    const state = playMove(createInitialState(), { board: 1, cell: 0 });
    const next = playMove(state, { board: 1, cell: 0 });
    expect(next).toBe(state);
  });

  it('ignora una jugada con tablero fuera de rango', () => {
    const state = createInitialState();
    expect(playMove(state, { board: 3, cell: 0 })).toBe(state);
    expect(playMove(state, { board: -1, cell: 0 })).toBe(state);
  });

  it('ignora una jugada con casilla fuera de rango', () => {
    const state = createInitialState();
    expect(playMove(state, { board: 0, cell: 9 })).toBe(state);
    expect(playMove(state, { board: 0, cell: -1 })).toBe(state);
  });

  it('mata un tablero al formar tres en línea y sigue cambiando de turno', () => {
    let state = createInitialState();
    state = playMove(state, { board: 0, cell: 0 }); // j1
    state = playMove(state, { board: 0, cell: 3 }); // j2
    state = playMove(state, { board: 0, cell: 1 }); // j1
    state = playMove(state, { board: 0, cell: 4 }); // j2
    state = playMove(state, { board: 0, cell: 2 }); // j1 cierra fila superior
    expect(state.deadBoards[0]).toBe(true);
    expect(state.deadLines[0]).toEqual([0, 1, 2]);
    expect(state.status).toBe('playing');
    expect(state.currentPlayer).toBe(2);
  });

  it('ignora cualquier jugada sobre un tablero muerto', () => {
    let state = createInitialState();
    state = playMove(state, { board: 0, cell: 0 });
    state = playMove(state, { board: 1, cell: 0 });
    state = playMove(state, { board: 0, cell: 1 });
    state = playMove(state, { board: 1, cell: 1 });
    state = playMove(state, { board: 0, cell: 2 }); // tablero 0 muerto
    const antes = state;
    const despues = playMove(state, { board: 0, cell: 5 });
    expect(despues).toBe(antes);
  });

  it('termina la partida cuando muere el último tablero: pierde quien hizo la jugada', () => {
    const secuencia: Array<[number, number]> = [
      [0, 0], [0, 1], [0, 2], // j1,j2,j1 -> tablero 0 muerto
      [1, 0], [1, 1], [1, 2], // j2,j1,j2 -> tablero 1 muerto
      [2, 0], [2, 1], [2, 2], // j1,j2,j1 -> tablero 2 muerto -> fin
    ];
    let state = createInitialState();
    for (const [board, cell] of secuencia) {
      state = playMove(state, { board, cell });
    }
    expect(state.status).toBe('won');
    expect(state.deadBoards).toEqual([true, true, true]);
    expect(state.loser).toBe(1); // el jugador 1 hizo la jugada [2,2]
    expect(state.winner).toBe(2);
    expect(state.currentPlayer).toBe(1); // no cambia al terminar
  });

  it('no permite jugar después de terminada la partida', () => {
    const secuencia: Array<[number, number]> = [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2],
    ];
    let state = createInitialState();
    for (const [board, cell] of secuencia) {
      state = playMove(state, { board, cell });
    }
    const next = playMove(state, { board: 0, cell: 5 });
    expect(next).toBe(state);
  });

  it('termina la partida cuando el jugador 2 mata el último tablero: gana el jugador 1', () => {
    // Un movimiento de relleno extra en el tablero 2 (jugada 9) invierte la
    // paridad para que la jugada final que mata el tablero 2 sea del jugador 2.
    // Las jugadas se alternan 1,2,1,2,… y el turno NO cambia en la jugada final.
    const secuencia: Array<[number, number]> = [
      [0, 0], [0, 1], [0, 2], // j1,j2,j1 -> tablero 0 muerto
      [1, 0], [1, 1], [1, 2], // j2,j1,j2 -> tablero 1 muerto
      [2, 0], [2, 1],         // j1,j2 en el tablero 2
      [2, 3],                 // j1 relleno: no forma línea, tablero 2 sigue vivo
      [2, 2],                 // j2 cierra la fila superior -> tablero 2 muerto -> fin
    ];
    let state = createInitialState();
    for (const [board, cell] of secuencia) {
      state = playMove(state, { board, cell });
    }
    expect(state.status).toBe('won');
    expect(state.deadBoards).toEqual([true, true, true]);
    expect(state.loser).toBe(2); // el jugador 2 hizo la jugada [2,2]
    expect(state.winner).toBe(1);
    expect(state.currentPlayer).toBe(2); // no cambia al terminar
  });

  it('no muta el estado que recibe', () => {
    const state = createInitialState();
    const copia = JSON.parse(JSON.stringify(state));
    playMove(state, { board: 0, cell: 0 });
    expect(state).toEqual(copia);
  });
});

// Tabla con las 8 líneas ganadoras escritas a mano: una errata en cualquier
// entrada de WINNING_LINES del engine hace fallar este test.
const LINEAS: Array<{ nombre: string; linea: [number, number, number] }> = [
  { nombre: 'fila superior', linea: [0, 1, 2] },
  { nombre: 'fila central', linea: [3, 4, 5] },
  { nombre: 'fila inferior', linea: [6, 7, 8] },
  { nombre: 'columna izquierda', linea: [0, 3, 6] },
  { nombre: 'columna central', linea: [1, 4, 7] },
  { nombre: 'columna derecha', linea: [2, 5, 8] },
  { nombre: 'diagonal principal', linea: [0, 4, 8] },
  { nombre: 'diagonal inversa', linea: [2, 4, 6] },
];

describe('notakto engine - detección de líneas', () => {
  it.each(LINEAS)('mata el tablero con la línea: $nombre', ({ linea }) => {
    let state = createInitialState();
    state = playMove(state, { board: 0, cell: linea[0] });
    state = playMove(state, { board: 1, cell: 0 });
    state = playMove(state, { board: 0, cell: linea[1] });
    state = playMove(state, { board: 1, cell: 1 });
    state = playMove(state, { board: 0, cell: linea[2] });
    expect(state.deadBoards[0]).toBe(true);
    expect(state.deadLines[0]).toEqual(linea);
  });
});

describe('notakto - guarda de payload (esJugadaValida)', () => {
  it('acepta un Move bien formado', () => {
    expect(esJugadaValida({ board: 0, cell: 0 })).toBe(true);
    expect(esJugadaValida({ board: 2, cell: 8 })).toBe(true);
  });

  it('acepta un Move con propiedades extra (solo valida board y cell)', () => {
    expect(esJugadaValida({ board: 1, cell: 4, extra: true })).toBe(true);
  });

  it('rechaza board fuera de rango', () => {
    expect(esJugadaValida({ board: 3, cell: 0 })).toBe(false);
    expect(esJugadaValida({ board: -1, cell: 0 })).toBe(false);
  });

  it('rechaza cell fuera de rango', () => {
    expect(esJugadaValida({ board: 0, cell: 9 })).toBe(false);
    expect(esJugadaValida({ board: 0, cell: -1 })).toBe(false);
  });

  it('rechaza valores no enteros', () => {
    expect(esJugadaValida({ board: 1.5, cell: 2 })).toBe(false);
    expect(esJugadaValida({ board: 0, cell: NaN })).toBe(false);
  });

  it('rechaza objetos incompletos o del tipo equivocado', () => {
    expect(esJugadaValida({ board: 0 })).toBe(false);
    expect(esJugadaValida({ cell: 0 })).toBe(false);
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(undefined)).toBe(false);
    expect(esJugadaValida(42)).toBe(false);
    expect(esJugadaValida('x')).toBe(false);
    expect(esJugadaValida([0, 0])).toBe(false);
  });
});
