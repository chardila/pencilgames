import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  dominosLegalesEn,
  esJugadaValida,
  playMove,
  TAMANO,
  type DomineeringState,
  type Move,
  type Player,
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

function todasJugadasLegales(state: DomineeringState): Move[] {
  const vistas = new Set<string>();
  const jugadas: Move[] = [];
  for (let i = 0; i < TAMANO * TAMANO; i++) {
    for (const m of dominosLegalesEn(state.board, state.currentPlayer, i)) {
      const clave = `${m.a},${m.b}`;
      if (!vistas.has(clave)) {
        vistas.add(clave);
        jugadas.push(m);
      }
    }
  }
  return jugadas;
}

function jugadaAzar(state: DomineeringState, rng: () => number): Move {
  const jugadas = todasJugadasLegales(state);
  return jugadas[Math.floor(rng() * jugadas.length)];
}

function estadoConTablero(
  ocupadas: number[],
  currentPlayer: Player = 1,
): DomineeringState {
  const board = Array<Player | null>(TAMANO * TAMANO).fill(null);
  for (const idx of ocupadas) {
    board[idx] = 1;
  }
  return {
    board,
    currentPlayer,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

function tableroSoloLibres(libres: number[], currentPlayer: Player = 1): DomineeringState {
  const libreSet = new Set(libres);
  const ocupadas: number[] = [];
  for (let i = 0; i < TAMANO * TAMANO; i++) {
    if (!libreSet.has(i)) ocupadas.push(i);
  }
  return estadoConTablero(ocupadas, currentPlayer);
}

function simular(
  dif1: Dificultad | 'azar',
  dif2: Dificultad | 'azar',
  rng: () => number,
): Player {
  let state = createInitialState();
  while (state.status === 'playing') {
    const dif = state.currentPlayer === 1 ? dif1 : dif2;
    const mov = dif === 'azar' ? jugadaAzar(state, rng) : elegirMovimiento(state, dif, rng);
    expect(esJugadaValida(mov)).toBe(true);
    const next = playMove(state, mov);
    expect(next).not.toBe(state);
    state = next;
  }
  return state.winner!;
}

describe('domineering bot', () => {
  it('genera jugadas legales y válidas en estados iniciales, intermedios y finales en < 30 ms', () => {
    const rng = crearRng(42);
    let state = createInitialState();
    let maxMs = 0;

    for (let turno = 0; state.status === 'playing'; turno++) {
      for (const dif of ['facil', 'medio', 'dificil'] as const) {
        const t0 = performance.now();
        const mov = elegirMovimiento(state, dif, rng);
        const dt = performance.now() - t0;
        if (dt > maxMs) maxMs = dt;
        expect(dt).toBeLessThan(30);
        expect(esJugadaValida(mov)).toBe(true);
        expect(mov.a).toBeLessThan(mov.b);
        expect(playMove(state, mov)).not.toBe(state);
      }
      state = playMove(state, elegirMovimiento(state, 'dificil', rng));
    }

    expect(maxMs).toBeLessThan(30);
  });

  it('es 100% determinista para la misma semilla rng', () => {
    const s = playMove(createInitialState(), { a: 27, b: 35 });
    for (const dif of ['facil', 'medio', 'dificil'] as const) {
      const m1 = elegirMovimiento(s, dif, crearRng(12345));
      const m2 = elegirMovimiento(s, dif, crearRng(12345));
      expect(m1).toEqual(m2);
    }
  });

  it('medio y difícil toman victoria en 1 tanto como J1 (vertical) como J2 (horizontal)', () => {
    const rng = crearRng(7);

    // J1 (vertical) tiene una única jugada que bloquea el último hueco horizontal de J2.
    // Libres: (0,0)=0, (1,0)=8, (1,1)=9.
    // Dominós V: {0,8}. Dominós H: {8,9}.
    // Si J1 juega {0,8}, J2 queda sin jugadas y J1 gana en 1.
    const sWinJ1 = tableroSoloLibres([0, 8, 9], 1);
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sWinJ1, dif, rng)).toEqual({ a: 0, b: 8 });
    }

    // J2 (horizontal) tiene {8,9} que destruye el único hueco vertical {0,8} de J1.
    const sWinJ2 = tableroSoloLibres([0, 8, 9], 2);
    for (const dif of ['medio', 'dificil'] as const) {
      expect(elegirMovimiento(sWinJ2, dif, rng)).toEqual({ a: 8, b: 9 });
    }
  });

  it('medio y difícil evitan jugadas suicidas que regalan victoria inmediata al rival', () => {
    const rng = crearRng(19);

    // Libres:
    // Componente A (trampa): 0, 8, 9 (V:{0,8}, H:{8,9})
    // Componente B (segura para J1): 24, 32 (V:{24,32}, sin H)
    // Componente C (segura para J2): 50, 51 (H:{50,51}, sin V)
    // Si J1 (turno) juega {0,8} en A: J2 juega {50,51} en C, y luego J1 no tiene jugadas -> J1 PIERDE en 1 respuesta.
    // Si J1 juega {24,32} en B: quedan A y C.
    //   - Si J2 juega {8,9} en A -> quedan C, luego J1 pierde? Espera:
    //   Queremos una jugada suicida vs segura donde la segura NO deje victoria rival en 1:
    //   Agreguemos Componente D (segura para J1): 40, 48.
    //   Veamos:
    //   J1 juega {0,8} (destruye A, deja B, C, D -> J1 tiene 2 seguras, J2 tiene 1 segura -> ¡esa es buena!).
    //   Queremos que una jugada SÍ deje victoria rival en 1 y otra NO:
    //   Supongamos libres:
    //   - Un hueco 2x2: 0, 1, 8, 9. (V: {0,8},{1,9}; H: {0,1},{8,9}).
    //   - Un hueco seguro V: 24, 32.
    //   - Un hueco seguro H: 50, 51.
    //   Si J1 juega {24,32}: quedan 2x2 y {50,51}.
    //     J2 no tiene victoria en 1 (si J2 juega en 2x2, J1 tiene el otro V; si juega {50,51}, J1 juega en 2x2).
    //   En cambio, supongamos J1 juega {0,8} cuando también hay {50,51} para J2 y NO hay B:
    //   Mejor: J1 tiene un dominó en {0,8} (no toca H) y otro en {24,32}?
    //   Caso exacto:
    //   Libres:
    //   - {0,8}, {1,9} en un 2x2 (0,1,8,9).
    //   - {2, 10} separado (no, eso no toca 2x2).
    //   Queremos que si J1 juega M_malo, J2 gana en 1; si J1 juega M_bueno, J2 NO gana en 1:
    //   - Sea 1x3 horizontal (0,1,2) + debajo de 1 está 9 + debajo de 2 está 10?
    //   Más simple:
    //   Libres:
    //   Región X: {0, 8} (V) y {8, 9} (H) -> 0, 8, 9.
    //   Región Y: {20, 28} (V) y {28, 29} (H) -> 20, 28, 29.
    //   Es turno de J1:
    //   Si J1 juega {0,8} en X, J2 responde {28,29} en Y y J1 queda con 0 jugadas (¡J2 gana en 1!).
    //   ¿Existe alguna jugada de J1 que NO permita a J2 ganar en 1?
    //   Agreguemos {40, 48} (V exclusivo de J1), PERO supongamos que J1 también tiene la opción de jugar en un sitio que regala victoria en 1:
    //   Por ejemplo, libres:
    //   - {0, 8} (V exclusivo, 0,8)
    //   - {20, 28, 21, 29} -> 2x2 (V:{20,28},{21,29}; H:{20,21},{28,29})
    //   - {50, 51} (H exclusivo)
    //   Turno J1:
    //   Si J1 juega {20,28} -> J2 queda con {50,51} y J1 aún tiene {21,29} y {0,8} (segura).
    //   Si en cambio quitamos {0,8}, y dejamos libres:
    //   - {20, 28} (V) y {21, 29} (V), y {20, 21} (H), {28, 29} (H) [un 2x2]
    //   - {40, 48} (V exclusivo)
    //   - ¿Cómo hacer que una jugada de J1 le regale victoria en 1 a J2?
    //   Si J1 tiene {0, 8} (V exclusivo) y además {20, 28} donde {20,21,28,29} es un 2x2? No, en 2x2 J1 tiene {21,29}.
    //   ¿Cuándo jugar M deja a J2 con victoria en 1?
    //   Cuando M es un V que destruye el ÚNICO otro V de J1 (o deja 1 V que J2 puede destruir en 1 jugada)!
    //   ¡Claro! Libres:
    //   - {0, 8, 16} (3 en columna: V puede poner {0,8} o {8,16}, solo 1 dominó).
    //   - {16, 17} (H en fila 2: si J1 juega {8,16}, destruye {16,17} y deja 0 jugadas a J2 -> gana en 1; si J1 juega {0,8}, queda {16,17} solamente y J2 tiene victoria en 1).
    //   Y para que NO haya victoria en 1 para J1 (y así pruebe evitar derrota en 1):
    //   Agreguemos {50, 51} (H exclusivo de J2) y {30, 38, 39} (V:{30,38}, H:{38,39}):
    //   Wait: si libres = {0,8,16} + {16,17} (no, ahí {8,16} solo deja {38,39} y {50,51} para J2).
    //   Construyámoslo directo:
    //   Libres:
    //   - Columna 0 filas 0,1,2: 0, 8, 16 (V tiene {0,8} y {8,16}).
    //   - Además celda 17: (2,1) -> H tiene {16,17}.
    //   - Además celdas 40, 48 (V exclusivo) y 50, 51 (H exclusivo) y 52... no, si hay {40,48} entonces tras J1 jugar {0,8} y J2 jugar {16,17}, J1 aún tiene {40,48}, así que J2 NO ganó en 1.
    //   Para que J2 SÍ gane en 1 si J1 juega {0,8}, J1 NO debe tener otro V fuera de {0,8,16}!
    //   Libres: 0, 8, 16, 17, 40, 41 (un H exclusivo en {40,41}):
    //   - Si J1 juega {0,8}: quedan {16,17} y {40,41} (0 jugadas V!). J2 ya ganó incluso antes de mover, o si falta {24,32} conectado a {24,25}:
    //   ¡Exacto! Libres:
    //   - Grupo 1: 0, 8, 16, 24 (4 en col 0) -> V:{0,8}, {8,16}, {16,24}.
    //     Si J1 juega {8,16}: deja 0 y 24 aislados -> ¡0 jugadas V restantes! J2 juega {50,51} (o cualquier H) y J2 GANA EN 1.
    //     Si J1 juega {0,8}: deja {16,24} libre para J1 -> J2 NO puede destruir {16,24} (si no hay H tocando 16 ni 24). ¡J1 sobrevive y J2 NO gana en 1!
    //   Agreguemos {50, 51} (H exclusivo para J2) para que J2 tenga jugada tras {8,16}.
    const sEvitar = tableroSoloLibres([0, 8, 16, 24, 50, 51], 1);
    // J1 tiene {0,8}, {8,16}, {16,24}.
    // {8,16} deja 0 jugadas V -> J2 juega {50,51} y gana en 1!
    // {0,8} y {16,24} dejan 1 jugada V -> J2 NO puede ganar en 1.
    for (const dif of ['medio', 'dificil'] as const) {
      const m = elegirMovimiento(sEvitar, dif, rng);
      expect(m).not.toEqual({ a: 8, b: 16 });
      expect([{ a: 0, b: 8 }, { a: 16, b: 24 }]).toContainEqual(m);
    }
  });

  it('facil omite victoria inmediata cuando rng >= 0.4 y hay alternativas, y la toma cuando rng < 0.4', () => {
    // Libres: {0, 8} (gana en 1 porque destruye el único H {8,9}), y {24, 32} (no gana en 1 porque deja {8,9} a J2).
    const s = tableroSoloLibres([0, 8, 9, 24, 32], 1);

    const movOmitido = elegirMovimiento(s, 'facil', () => 0.5);
    expect(movOmitido).toEqual({ a: 24, b: 32 });

    const movGanador = elegirMovimiento(s, 'facil', () => 0.1);
    expect(movGanador).toEqual({ a: 0, b: 8 });
  });

  it('dificil resuelve exactamente finales con <= 12 jugadas totales', () => {
    const rng = crearRng(101);
    // Posición ganadora forzada para J1 con <= 12 jugadas totales donde la heurística 1-ply
    // puede dudar o donde hay una única jugada ganadora:
    // Tablero 2x3 en esquina superior izquierda (0,1,2, 8,9,10):
    // En 2x3 con P1 (vertical), si P1 juega la columna central {1,9}:
    // divide el 2x3 en {0,8} y {2,10} (2 dominós V exclusivos para P1, 0 para P2) -> P1 gana seguro!
    // Si P1 juega {0,8}, P2 juega {9,10} -> quedan {1,2}? No, {1,2} sería 1 dominó H exclusivo -> J2 gana!
    // Con un H extra para J2 en {50,51} (1 jugada H segura para J2):
    // - Si P1 juega {1,9}: P1 tiene 2 seguras ({0,8} y {2,10}), P2 tiene 1 segura ({50,51}) -> P1 GANA!
    // - Si P1 juega {0,8}: P2 juega {1,2}, dejando solo {9,10}? No, 9 está en fila 1 col 1, 10 en fila 1 col 2 -> {9,10} es 1 H para P2, 0 V para P1 -> P1 PIERDE!
    const s2x3 = tableroSoloLibres([0, 1, 2, 8, 9, 10, 50, 51], 1);
    expect(elegirMovimiento(s2x3, 'dificil', rng)).toEqual({ a: 1, b: 9 });
  });

  it('calibración espejo: dificil > medio > facil (> 65%) y azar gana a facil', () => {
    const rng = crearRng(2026);
    const PARES = 15; // 30 partidas por emparejamiento (15 como J1 + 15 como J2)

    let dificilGana = 0;
    let medioGana = 0;
    let azarGana = 0;

    for (let i = 0; i < PARES; i++) {
      if (simular('dificil', 'medio', rng) === 1) dificilGana++;
      if (simular('medio', 'dificil', rng) === 2) dificilGana++;

      if (simular('medio', 'facil', rng) === 1) medioGana++;
      if (simular('facil', 'medio', rng) === 2) medioGana++;

      if (simular('azar', 'facil', rng) === 1) azarGana++;
      if (simular('facil', 'azar', rng) === 2) azarGana++;
    }

    const total = PARES * 2;
    expect(dificilGana).toBeGreaterThan(total * 0.65);
    expect(medioGana).toBeGreaterThan(total * 0.65);
    expect(azarGana).toBeGreaterThan(total * 0.25);
  });
});
