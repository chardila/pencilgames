import { describe, expect, it } from 'vitest';
import { createInitialState, esJugadaValida, playMove } from './engine';

describe('tres en raya engine', () => {
  it('empieza con tablero vacío y le toca a X', () => {
    const state = createInitialState();
    expect(state.board).toEqual(Array(9).fill(null));
    expect(state.currentPlayer).toBe('X');
    expect(state.status).toBe('playing');
  });

  it('coloca la ficha del jugador actual y pasa el turno', () => {
    const state = createInitialState();
    const next = playMove(state, 0);
    expect(next.board[0]).toBe('X');
    expect(next.currentPlayer).toBe('O');
    expect(next.status).toBe('playing');
  });

  it('ignora una jugada sobre una casilla ocupada', () => {
    const state = playMove(createInitialState(), 0);
    const next = playMove(state, 0);
    expect(next).toEqual(state);
  });

  it('ignora una jugada fuera de rango', () => {
    const state = createInitialState();
    const next = playMove(state, 9);
    expect(next).toEqual(state);
  });

  it('detecta una fila ganadora', () => {
    let state = createInitialState();
    state = playMove(state, 0); // X
    state = playMove(state, 3); // O
    state = playMove(state, 1); // X
    state = playMove(state, 4); // O
    state = playMove(state, 2); // X gana fila superior
    expect(state.status).toBe('won');
    expect(state.winner).toBe('X');
    expect(state.winningLine).toEqual([0, 1, 2]);
  });

  // Tabla con las 8 líneas ganadoras: 3 filas, 3 columnas y 2 diagonales.
  // Se escriben aquí a mano (no se importan de engine.ts) para que una errata
  // en cualquier entrada de WINNING_LINES haga fallar el test.
  const LINEAS_GANADORAS: Array<{ nombre: string; linea: number[] }> = [
    { nombre: 'fila superior', linea: [0, 1, 2] },
    { nombre: 'fila central', linea: [3, 4, 5] },
    { nombre: 'fila inferior', linea: [6, 7, 8] },
    { nombre: 'columna izquierda', linea: [0, 3, 6] },
    { nombre: 'columna central', linea: [1, 4, 7] },
    { nombre: 'columna derecha', linea: [2, 5, 8] },
    { nombre: 'diagonal principal', linea: [0, 4, 8] },
    { nombre: 'diagonal inversa', linea: [2, 4, 6] },
  ];

  it.each(LINEAS_GANADORAS)('detecta la línea ganadora: $nombre', ({ linea }) => {
    // X ocupa las 3 casillas de la línea; O responde en dos casillas de fuera
    // (con sólo 2 fichas O nunca puede ganar antes).
    const fuera = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter(i => !linea.includes(i));
    const jugadasO = fuera.slice(0, 2);

    let state = createInitialState();
    state = playMove(state, linea[0]); // X
    state = playMove(state, jugadasO[0]); // O
    state = playMove(state, linea[1]); // X
    state = playMove(state, jugadasO[1]); // O
    state = playMove(state, linea[2]); // X cierra la línea

    expect(state.status).toBe('won');
    expect(state.winner).toBe('X');
    expect(state.winningLine).toEqual(linea);
  });

  it('detecta un empate', () => {
    // Resultado final:
    // X O X
    // X O O
    // O X X
    const jugadas = [0, 1, 2, 4, 3, 5, 7, 6, 8];
    let state = createInitialState();
    for (const jugada of jugadas) {
      state = playMove(state, jugada);
    }
    expect(state.status).toBe('draw');
    expect(state.winner).toBeNull();
  });

  it('no permite jugar después de terminada la partida', () => {
    let state = createInitialState();
    state = playMove(state, 0);
    state = playMove(state, 3);
    state = playMove(state, 1);
    state = playMove(state, 4);
    state = playMove(state, 2); // X gana
    const next = playMove(state, 5);
    expect(next).toEqual(state);
  });
});

describe('tres-en-raya - guarda de payload (esJugadaValida)', () => {
  it('acepta números enteros válidos entre 0 y 8', () => {
    for (let i = 0; i <= 8; i++) {
      expect(esJugadaValida(i)).toBe(true);
    }
  });

  it('rechaza índices fuera de rango', () => {
    expect(esJugadaValida(-1)).toBe(false);
    expect(esJugadaValida(9)).toBe(false);
    expect(esJugadaValida(100)).toBe(false);
  });

  it('rechaza números no enteros', () => {
    expect(esJugadaValida(1.5)).toBe(false);
    expect(esJugadaValida(NaN)).toBe(false);
    expect(esJugadaValida(Infinity)).toBe(false);
  });

  it('rechaza tipos no numéricos', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(undefined)).toBe(false);
    expect(esJugadaValida('0')).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida([0])).toBe(false);
  });
});
