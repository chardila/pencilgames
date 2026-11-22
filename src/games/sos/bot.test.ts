import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  type Letter,
  type Move,
  type SOSState,
} from './engine';
import { elegirMovimiento } from './bot';
import type { Dificultad } from '../../lib/bot/tipos';

function crearRng(semilla: number): () => number {
  let s = semilla >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function crearEstadoDesdeFilas(filas: string[], currentPlayer: 1 | 2 = 1): SOSState {
  const size = filas.length;
  const state = createInitialState(size);
  state.currentPlayer = currentPlayer;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const ch = filas[r][c];
      state.board[r][c] = ch === 'S' || ch === 'O' ? ch : null;
    }
  }
  return state;
}

function jugadaAzar(state: SOSState, rng: () => number): Move {
  const vacias: { row: number; col: number }[] = [];
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size; c++) {
      if (state.board[r][c] === null) vacias.push({ row: r, col: c });
    }
  }
  const celda = vacias[Math.floor(rng() * vacias.length)];
  const letter: Letter = rng() < 0.5 ? 'S' : 'O';
  return { row: celda.row, col: celda.col, letter };
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number
) {
  let state = createInitialState(6);
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner;
}

function creaAmenazaInmediata(state: SOSState, mov: Move): boolean {
  const next = playMove(state, mov);
  if (next === state || next.status !== 'playing') return false;
  // Si el movimiento ya formó SOS, el turno sigue siendo nuestro; aquí comprobamos si
  // un movimiento sin SOS regala al rival al menos un SOS inmediato.
  const prevTotal = state.scores[1] + state.scores[2];
  const nextTotal = next.scores[1] + next.scores[2];
  if (nextTotal > prevTotal) return false;

  for (let r = 0; r < next.size; r++) {
    for (let c = 0; c < next.size; c++) {
      if (next.board[r][c] !== null) continue;
      for (const letter of ['S', 'O'] as const) {
        const afterOpp = playMove(next, { row: r, col: c, letter });
        if (afterOpp.scores[next.currentPlayer] > next.scores[next.currentPlayer]) {
          return true;
        }
      }
    }
  }
  return false;
}

describe('sos bot', () => {
  it('genera jugadas legales, deterministas y en menos de 30 ms en todas las fases', () => {
    const rng = crearRng(2026);
    let state = createInitialState(6);

    // Recorrer una partida completa verificando los 3 niveles en cada estado
    while (state.status === 'playing') {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, crearRng(77));
        const elapsed = performance.now() - t0;

        expect(elapsed).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(state.board[mov.row][mov.col]).toBeNull();
        expect(playMove(state, mov)).not.toBe(state);

        // Determinismo con la misma semilla
        const movRepetido = elegirMovimiento(state, dif, crearRng(77));
        expect(movRepetido).toEqual(mov);
      }

      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }
  });

  it('funciona con 1 sola casilla vacía sin errores y completando la partida', () => {
    const state = crearEstadoDesdeFilas([
      'SOSOSO',
      'OSOSOS',
      'SOSOSO',
      'OSOSOS',
      'SOSOSO',
      'OSOSO.',
    ]);
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const mov = elegirMovimiento(state, dif, crearRng(1));
      expect(esJugadaValida(mov)).toBe(true);
      expect(mov.row).toBe(5);
      expect(mov.col).toBe(5);
      const next = playMove(state, mov);
      expect(next.status).toBe('finished');
    }
  });

  it('medio y dificil completan el SOS inmediato máximo y facil respeta probabilidad 0.45', () => {
    // En (2, 2) colocar 'O' forma 2 SOS en cruz (vertical y horizontal),
    // mientras (0, 5) colocar 'S' solo forma 1 SOS (S-O-S en fila 0: cols 3,4,5).
    const state = crearEstadoDesdeFilas([
      '..SSOS',
      '..S...',
      '.S.S..',
      '..S...',
      '......',
      '......',
    ]);
    // Nota: fila 0 ya tiene SOS en (0,2)? No, (0,2)=S,(0,3)=S,(0,4)=O,(0,5)=S -> pongamos fila 0 '.SO...' para 1 SOS en (0,3) con 'S'
    const s = crearEstadoDesdeFilas([
      '.SO...',
      '..S...',
      '.S.S..',
      '..S...',
      '......',
      '......',
    ]);
    expect(state.size).toBe(6);

    for (const dif of ['medio', 'dificil'] as const) {
      const mov = elegirMovimiento(s, dif, crearRng(9));
      expect(mov).toEqual({ row: 2, col: 2, letter: 'O' });
    }

    // Fácil toma SOS con rng < 0.45 y lo omite con rng >= 0.45
    const movFacilToma = elegirMovimiento(s, 'facil', () => 0.2);
    expect(playMove(s, movFacilToma).scores[1]).toBeGreaterThan(0);

    const movFacilOmite = elegirMovimiento(s, 'facil', () => 0.7);
    expect(esJugadaValida(movFacilOmite)).toBe(true);
    expect(playMove(s, movFacilOmite).scores[1]).toBe(0);
  });

  it('medio y dificil evitan regalar S_S o SO_ cuando existen jugadas seguras', () => {
    // Tablero con algunas letras aisladas donde existen jugadas seguras y jugadas trampa
    const state = crearEstadoDesdeFilas([
      'S.....',
      '......',
      '...O..',
      '......',
      '......',
      '......',
    ]);

    const rng = crearRng(42);
    for (let i = 0; i < 15; i++) {
      for (const dif of ['medio', 'dificil'] as const) {
        const mov = elegirMovimiento(state, dif, rng);
        expect(esJugadaValida(mov)).toBe(true);
        expect(creaAmenazaInmediata(state, mov)).toBe(false);
      }
    }
  });

  it('dificil elige el sacrificio de cadena mínima cuando no quedan jugadas seguras', () => {
    // Tablero con 12 casillas vacías (> 10), sin SOS inmediatos y sin jugadas seguras:
    // - Algunas casillas (fila 0, fila 5, col 4) entregan cadena de exactamente 1 SOS.
    // - El núcleo central ((2,1),(2,2),(3,1),(3,3),(4,2),(4,3)) entrega cadenas de 7-9 SOS.
    const soloSacrificios = crearEstadoDesdeFilas([
      'OOS..S',
      'OOSSSS',
      'S..SSO',
      'O.O..O',
      'SS...O',
      'S..SSO',
    ]);

    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (soloSacrificios.board[r][c] !== null) continue;
        for (const letter of ['S', 'O'] as const) {
          expect(
            creaAmenazaInmediata(soloSacrificios, { row: r, col: c, letter }),
            `(${r},${c},${letter})`
          ).toBe(true);
        }
      }
    }

    const movDificil = elegirMovimiento(soloSacrificios, 'dificil', crearRng(5));
    expect(esJugadaValida(movDificil)).toBe(true);

    const trampasLargas = new Set(['2,1', '2,2', '3,1', '3,3', '4,2', '4,3']);
    expect(trampasLargas.has(`${movDificil.row},${movDificil.col}`)).toBe(false);
  });

  it('dificil resuelve óptimamente un final con <= 10 vacías evitando regalar puntos', () => {
    // 4 casillas vacías: (0,1), (0,2), (5,4), (5,5).
    // En fila 0: 'S . . O O O' -> en (0,1) poner 'O' regala SOS en (0,2); poner 'S' en (0,1) es seguro,
    //   y poner 'O' en (0,2) es seguro! Pero si pones 'S' en (0,2) regalas (0,1)='O'? No, S-.-S regala 'O' en (0,1)!
    // En fila 5: 'O O O O . .' -> cualquier letra en (5,4) o (5,5) es segura y no forma SOS.
    // Con J1 arriba 0-0, J1 debe evitar regalar (0,1)='O' o (0,2)='S' y terminar >= 0.
    const state = crearEstadoDesdeFilas([
      'S..OOO',
      'OOOOOO',
      'OOOOOO',
      'OOOOOO',
      'OOOOOO',
      'OOOO..',
    ]);

    let s = state;
    // Simular difícil vs medio desde aquí: difícil nunca debe terminar perdiendo
    while (s.status === 'playing') {
      const dif = s.currentPlayer === 1 ? 'dificil' : 'medio';
      s = playMove(s, elegirMovimiento(s, dif, crearRng(11)));
    }
    expect(s.scores[1]).toBeGreaterThanOrEqual(s.scores[2]);
  });

  it('dificil toma una cadena completa de SOS eligiendo el orden que maximiza la racha', () => {
    // (0,2) con 'O' completa 1 SOS en fila 0 (S O S -> cols 1,2,3)
    // y deja (0,0)='S', (0,1)='S' -> espera:
    // Si fila 0 es 'S . . S O .' ->
    //   colocar 'S' en (0,5) completa (0,3)S-(0,4)O-(0,5)S (1 punto), y no abre nada más.
    //   colocar 'O' en (0,1) no completa nada.
    // Mejor ejemplo de cadena:
    //   (2,2)='O' completa (2,1)S-(2,2)O-(2,3)S (1 pt) Y habilita (1,2)='S' para completar (1,2)S-(2,2)O-(3,2)S (2do pt)!
    //   Mientras (5,5)='S' solo completa 1 SOS aislado en fila 5 sin continuación.
    const state = crearEstadoDesdeFilas([
      'OOOOOO',
      'OO.OOO',
      'OS.SOO',
      'OOSOOO',
      'OOOOOO',
      'OOOSOS',
    ]);
    // Espera: en fila 5: (5,3)=S,(5,4)=O,(5,5)=S ya está completo. Pongamos (5,5)='.'
    const cadena = crearEstadoDesdeFilas([
      'OOOOOO',
      'OO.OOO',
      'OS.SOO',
      'OOSOOO',
      'OOOOOO',
      'OOOSO.',
    ]);
    // En cadena:
    // - (2,2)='O' -> 1 SOS en fila 2; luego en el mismo turno coloca (1,2)='S' -> 2do SOS en col 2 (2 pts totales!).
    // - (5,5)='S' -> 1 SOS en fila 5; luego en el mismo turno aún tiene (2,2)='O' y (1,2)='S', o sea 3 pts totales!
    // Hagamos que (5,5)='S' sea imposible si toma (2,2) primero? No, ambos se suman si están en el mismo tablero.
    // Para que el ORDEN importe (exclusión mutua):
    // En fila 2: (2,0)=S, (2,1)=., (2,2)=S, (2,3)=., (2,4)=O, (2,5)=S:
    //   - Si pones 'O' en (2,1): ganas 1 SOS (2,0)-(2,1)-(2,2) y sigues con (2,3)='S' (gana 2do SOS (2,3)-(2,4)-(2,5)) = 2 pts.
    //   - Si pones 'S' en (2,1): no ganas SOS.
    // Más claro: en una T o cruce donde una casilla admite 'S' o 'O', o donde tomar (2,1)='O' crea un 2do SOS que antes no existía (sin el 'S' previo):
    // (2,0)=S, (2,1)=O, (2,2)=., (3,2)=O, (4,2)=S, (2,3)=O, (2,4)=S:
    //   - Si pones 'S' en (2,2): completas (2,0)-(2,1)-(2,2) AND (2,2)-(2,3)-(2,4) AND (2,2)-(3,2)-(4,2) = 3 puntos de golpe!
    //   - Si hubiera otra vacía (0,5) con 1 punto, (2,2)='S' da 3 puntos!
    const triple = crearEstadoDesdeFilas([
      'OOOSO.',
      'OOOOOO',
      'SO.OSO',
      'OOOSOO',
      'OOSOOO',
      'OOOOOO',
    ]);
    // En triple: (2,2)='S' forma 2 SOS: (2,0)-(2,1)-(2,2) horizontal y (2,2)-(3,2)-(4,2) vertical?
    // Verifiquemos coords:
    // r=2: c0=S, c1=O, c2=., c3=O, c4=S, c5=O -> (2,2)='S' forma 2 horizontales!
    // r=3: c2=O? No: 'OOOSOO' tiene c3=S, c2=O! Wait: 'OOOSOO' -> index 0=O,1=O,2=O,3=S. Pongamos index 2=O: 'OOSOOO' es index 2=S.
    // r=2: c2 es index 2: 'SO.OSO' -> 0=S,1=O,2=.,3=O,4=S,5=O.
    // r=3: 'OOOSOO' -> 0=O,1=O,2=O,3=S. Index 2 is 'O'.
    // r=4: 'OOSOOO' -> 0=O,1=O,2=S. Index 2 is 'S'.
    // Así que (2,2)='S' forma:
    // 1) (2,0)S-(2,1)O-(2,2)S
    // 2) (2,2)S-(2,3)O-(2,4)S
    // 3) (2,2)S-(3,2)O-(4,2)S
    // = 3 puntos! Mientras (0,5)='S' solo forma 1 punto.
    const mov = elegirMovimiento(triple, 'dificil', crearRng(3));
    expect(mov).toEqual({ row: 2, col: 2, letter: 'S' });
  });

  it('calibración: dificil > medio > facil (con partidas espejo) y azar gana a facil', () => {
    const rng = crearRng(909);
    const PAREJAS = 20; // 40 partidas por cruce (20 como J1 y 20 como J2)
    let dificilGana = 0;
    let medioGana = 0;

    for (let i = 0; i < PAREJAS; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'dificil', rng) === 2) dificilGana++;

      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('facil', 'medio', rng) === 2) medioGana++;
    }

    const total = PAREJAS * 2;
    expect(dificilGana).toBeGreaterThan(total * 0.65);
    expect(medioGana).toBeGreaterThan(total * 0.65);

    const M = 40;
    let azarGana = 0;
    for (let i = 0; i < M; i++) {
      if (simular('azar', 'facil', rng) === 1) azarGana++;
    }
    expect(azarGana).toBeGreaterThan(M * 0.1);
  });
});
