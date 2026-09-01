import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esColocacionValida,
  esJugadaValida,
  generarFlotaAleatoria,
  barcosAFlote,
  playMove,
  TAMANO,
  FLOTA,
  type BattleshipState,
  type Player,
  type Move,
} from './engine';

// Helpers compartidos por todas las tasks.
const idx = (fila: number, col: number) => fila * TAMANO + col;

// Barco horizontal de longitud `long` empezando en (fila, col).
const horiz = (fila: number, col: number, long: number): number[] =>
  Array.from({ length: long }, (_, k) => idx(fila, col + k));
// Barco vertical de longitud `long` empezando en (fila, col).
const vert = (fila: number, col: number, long: number): number[] =>
  Array.from({ length: long }, (_, k) => idx(fila + k, col));

// Flota válida de referencia: 4/3/3/2 en filas separadas, sin tocarse.
const FLOTA_OK = (): number[][] => [
  horiz(0, 0, 4),
  horiz(2, 0, 3),
  horiz(4, 0, 3),
  horiz(6, 0, 2),
];

describe('createInitialState', () => {
  it('arranca en fase colocacion, turno del jugador 1, ambas flotas null', () => {
    const s = createInitialState();
    expect(s.fase).toBe('colocacion');
    expect(s.currentPlayer).toBe(1);
    expect(s.flotas).toEqual({ 1: null, 2: null });
    expect(s.disparos[1]).toHaveLength(64);
    expect(s.disparos[2]).toHaveLength(64);
    expect(s.disparos[1].every(x => x === null)).toBe(true);
    expect(s.disparos[2].every(x => x === null)).toBe(true);
    expect(s.winner).toBeNull();
    expect(s.ultimoDisparo).toBeNull();
  });

  it('TAMANO es 8 y FLOTA es [4,3,3,2]', () => {
    expect(TAMANO).toBe(8);
    expect([...FLOTA]).toEqual([4, 3, 3, 2]);
  });

  it('cada createInitialState devuelve arrays de disparos independientes', () => {
    const a = createInitialState();
    const b = createInitialState();
    a.disparos[1][0] = 'agua';
    expect(b.disparos[1][0]).toBeNull();
  });
});

describe('esColocacionValida', () => {
  it('acepta una flota 4/3/3/2 bien formada', () => {
    expect(esColocacionValida(FLOTA_OK())).toBe(true);
  });

  it('acepta barcos que se tocan (de lado y en diagonal)', () => {
    expect(
      esColocacionValida([
        horiz(0, 0, 4),
        horiz(1, 0, 3), // pegado por debajo al primero
        vert(2, 3, 3), // toca al segundo en diagonal
        horiz(5, 0, 2),
      ]),
    ).toBe(true);
  });

  it('acepta barcos verticales', () => {
    expect(
      esColocacionValida([vert(0, 0, 4), vert(0, 2, 3), vert(0, 4, 3), vert(0, 6, 2)]),
    ).toBe(true);
  });

  it('rechaza un número de barcos distinto de 4', () => {
    expect(esColocacionValida([horiz(0, 0, 4), horiz(2, 0, 3), horiz(4, 0, 3)])).toBe(false);
    expect(
      esColocacionValida([...FLOTA_OK(), horiz(7, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un multiconjunto de longitudes que no es {4,3,3,2}', () => {
    expect(
      esColocacionValida([horiz(0, 0, 4), horiz(2, 0, 4), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
    expect(
      esColocacionValida([horiz(0, 0, 3), horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un barco diagonal', () => {
    expect(
      esColocacionValida([[idx(0, 0), idx(1, 1), idx(2, 2), idx(3, 3)], horiz(5, 0, 3), horiz(6, 0, 3), horiz(7, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un barco no contiguo', () => {
    expect(
      esColocacionValida([[idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 4)], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza un índice fuera de rango', () => {
    expect(
      esColocacionValida([[61, 62, 63, 64], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
    expect(
      esColocacionValida([[-1, 0, 1, 2], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza envolvimiento de borde (fila 0 col 6..fila 1 col 1)', () => {
    // idx(0,6),idx(0,7),idx(1,0),idx(1,1) son "consecutivos" como enteros pero cruzan de fila.
    expect(
      esColocacionValida([[idx(0, 6), idx(0, 7), idx(1, 0), idx(1, 1)], horiz(3, 0, 3), horiz(5, 0, 3), horiz(7, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza celdas repetidas dentro de un barco', () => {
    expect(
      esColocacionValida([[idx(0, 0), idx(0, 1), idx(0, 1), idx(0, 2)], horiz(2, 0, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza dos barcos que se solapan', () => {
    expect(
      esColocacionValida([horiz(0, 0, 4), horiz(0, 2, 3), horiz(4, 0, 3), horiz(6, 0, 2)]),
    ).toBe(false);
  });

  it('rechaza entradas que no son arrays', () => {
    expect(esColocacionValida(null)).toBe(false);
    expect(esColocacionValida('flota')).toBe(false);
    expect(esColocacionValida({})).toBe(false);
    expect(esColocacionValida([1, 2, 3, 4])).toBe(false);
    expect(esColocacionValida([horiz(0, 0, 4), horiz(2, 0, 3), horiz(4, 0, 3), 'x'])).toBe(false);
  });
});

describe('esJugadaValida', () => {
  it('acepta disparo con celda entera en [0, 64)', () => {
    expect(esJugadaValida({ tipo: 'disparo', celda: 0 })).toBe(true);
    expect(esJugadaValida({ tipo: 'disparo', celda: 63 })).toBe(true);
  });

  it('acepta flota con una colocación válida', () => {
    expect(esJugadaValida({ tipo: 'flota', barcos: FLOTA_OK() })).toBe(true);
  });

  it('rechaza formas inválidas', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(5)).toBe(false);
    expect(esJugadaValida({})).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo' })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: -1 })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: 64 })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: 1.5 })).toBe(false);
    expect(esJugadaValida({ tipo: 'disparo', celda: '3' })).toBe(false);
    expect(esJugadaValida({ tipo: 'flota' })).toBe(false);
    expect(esJugadaValida({ tipo: 'flota', barcos: [] })).toBe(false);
    expect(esJugadaValida({ tipo: 'otro', celda: 3 })).toBe(false);
  });
});

describe('generarFlotaAleatoria', () => {
  it('genera 200 flotas y todas pasan esColocacionValida', () => {
    for (let i = 0; i < 200; i++) {
      const flota = generarFlotaAleatoria();
      expect(esColocacionValida(flota)).toBe(true);
    }
  });

  it('las longitudes de los 4 barcos son exactamente 4,3,3,2 (en algún orden)', () => {
    const flota = generarFlotaAleatoria();
    expect(flota.map(b => b.length).sort((a, b) => b - a)).toEqual([4, 3, 3, 2]);
  });
});

describe('barcosAFlote', () => {
  it('con la flota sin colocar devuelve el total de barcos (4)', () => {
    expect(barcosAFlote(createInitialState(), 1)).toBe(FLOTA.length);
  });

  it('cuenta los barcos del jugador con al menos una celda sin tocar', () => {
    // J1 tiene FLOTA_OK; el rival (J2) le ha disparado y hundido el barco de 2.
    const s: BattleshipState = {
      ...createInitialState(),
      flotas: { 1: FLOTA_OK(), 2: null },
    };
    const barco2 = horiz(6, 0, 2); // último barco de FLOTA_OK
    s.disparos[2][barco2[0]] = 'hundido';
    s.disparos[2][barco2[1]] = 'hundido';
    expect(barcosAFlote(s, 1)).toBe(3);
  });

  it('un barco solo tocado parcialmente sigue a flote', () => {
    const s: BattleshipState = {
      ...createInitialState(),
      flotas: { 1: FLOTA_OK(), 2: null },
    };
    s.disparos[2][idx(0, 0)] = 'tocado'; // una celda del barco de 4
    expect(barcosAFlote(s, 1)).toBe(4);
  });

  it('cuenta por jugador de forma independiente', () => {
    const s: BattleshipState = {
      ...createInitialState(),
      flotas: { 1: FLOTA_OK(), 2: FLOTA_OK() },
    };
    for (const c of horiz(0, 0, 4)) s.disparos[1][c] = 'hundido'; // J1 hunde el de 4 de J2
    expect(barcosAFlote(s, 2)).toBe(3);
    expect(barcosAFlote(s, 1)).toBe(4);
  });
});

// Aplica la colocación de ambas flotas y devuelve el estado (fase 'disparos').
function colocarAmbas(flota1: number[][], flota2: number[][]): BattleshipState {
  let s = createInitialState();
  s = playMove(s, { tipo: 'flota', barcos: flota1 });
  s = playMove(s, { tipo: 'flota', barcos: flota2 });
  return s;
}

describe('playMove — fase colocacion', () => {
  it('fija la flota del jugador en turno y alterna a J2, sigue en colocacion', () => {
    const s = playMove(createInitialState(), { tipo: 'flota', barcos: FLOTA_OK() });
    expect(s.flotas[1]).not.toBeNull();
    expect(s.flotas[2]).toBeNull();
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('colocacion');
  });

  it('normaliza cada barco a orden ascendente de índices', () => {
    const desordenada = [
      [idx(0, 3), idx(0, 0), idx(0, 2), idx(0, 1)], // barco de 4, al revés
      horiz(2, 0, 3),
      horiz(4, 0, 3),
      horiz(6, 0, 2),
    ];
    const s = playMove(createInitialState(), { tipo: 'flota', barcos: desordenada });
    expect(s.flotas[1]![0]).toEqual([idx(0, 0), idx(0, 1), idx(0, 2), idx(0, 3)]);
  });

  it('al quedar ambas flotas puestas pasa a disparos con turno de J1', () => {
    const s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    expect(s.fase).toBe('disparos');
    expect(s.currentPlayer).toBe(1);
    expect(s.flotas[1]).not.toBeNull();
    expect(s.flotas[2]).not.toBeNull();
  });

  it('rechaza un disparo durante la colocacion (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'disparo', celda: 0 })).toBe(s);
  });

  it('rechaza una flota inválida (misma referencia)', () => {
    const s = createInitialState();
    expect(playMove(s, { tipo: 'flota', barcos: [1, 2, 3, 4] } as never)).toBe(s);
    expect(playMove(s, { tipo: 'flota', barcos: [horiz(0, 0, 4), horiz(0, 2, 3), horiz(4, 0, 3), horiz(6, 0, 2)] })).toBe(s);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState();
    playMove(s, { tipo: 'flota', barcos: FLOTA_OK() });
    expect(s.flotas).toEqual({ 1: null, 2: null });
  });
});

describe('playMove — fase disparos', () => {
  it('disparo a agua: marca agua, guarda ultimoDisparo y pasa el turno', () => {
    // J2 tiene FLOTA_OK (filas 0,2,4,6 desde la col 0). La fila 1 es todo agua.
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s = playMove(s0, { tipo: 'disparo', celda: idx(1, 0) });
    expect(s.disparos[1][idx(1, 0)]).toBe('agua');
    expect(s.ultimoDisparo).toEqual({ por: 1, celda: idx(1, 0), resultado: 'agua' });
    expect(s.currentPlayer).toBe(2);
    expect(s.fase).toBe('disparos');
  });

  it('disparo que toca sin hundir: marca tocado', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s = playMove(s0, { tipo: 'disparo', celda: idx(0, 0) }); // 1.ª celda del barco de 4
    expect(s.disparos[1][idx(0, 0)]).toBe('tocado');
    expect(s.ultimoDisparo!.resultado).toBe('tocado');
  });

  it('al caer la última celda de un barco lo marca hundido en todas sus celdas', () => {
    let s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    // El barco de 2 de J2 está en idx(6,0), idx(6,1). J1 dispara a ambos (J2 tira a agua en medio).
    s = playMove(s, { tipo: 'disparo', celda: idx(6, 0) }); // J1 tocado
    s = playMove(s, { tipo: 'disparo', celda: idx(1, 7) }); // J2 agua
    s = playMove(s, { tipo: 'disparo', celda: idx(6, 1) }); // J1 hunde
    expect(s.disparos[1][idx(6, 0)]).toBe('hundido');
    expect(s.disparos[1][idx(6, 1)]).toBe('hundido');
    expect(s.ultimoDisparo).toEqual({ por: 1, celda: idx(6, 1), resultado: 'hundido' });
    expect(s.fase).toBe('disparos'); // aún quedan 3 barcos
  });

  it('rechaza disparar dos veces a la misma celda (misma referencia)', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s1 = playMove(s0, { tipo: 'disparo', celda: idx(1, 0) }); // J1 dispara
    const s2 = playMove(s1, { tipo: 'disparo', celda: idx(2, 2) }); // J2 dispara
    expect(playMove(s2, { tipo: 'disparo', celda: idx(1, 0) })).toBe(s2); // J1 repite celda
  });

  it('rechaza una colocacion durante la fase disparos (misma referencia)', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    expect(playMove(s0, { tipo: 'flota', barcos: FLOTA_OK() })).toBe(s0);
  });

  it('el turno alterna aunque el disparo sea un acierto', () => {
    const s0 = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const s = playMove(s0, { tipo: 'disparo', celda: idx(0, 0) }); // tocado
    expect(s.currentPlayer).toBe(2);
  });

  it('hundir el último barco rival termina la partida y fija el ganador', () => {
    // J1 hunde toda la flota de J2 (12 celdas de FLOTA_OK) intercalando disparos de J2 a agua.
    let s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const celdasRival = FLOTA_OK().flat(); // 12 celdas de la flota de J2
    const aguaJ2 = [idx(1, 0), idx(1, 1), idx(1, 2), idx(1, 3), idx(1, 4), idx(1, 5), idx(1, 6), idx(1, 7), idx(3, 0), idx(3, 1), idx(3, 2)];
    for (let k = 0; k < celdasRival.length; k++) {
      s = playMove(s, { tipo: 'disparo', celda: celdasRival[k] }); // J1
      if (s.fase === 'finished') break;
      s = playMove(s, { tipo: 'disparo', celda: aguaJ2[k] }); // J2
    }
    expect(s.fase).toBe('finished');
    expect(s.winner).toBe(1);
    expect(barcosAFlote(s, 2)).toBe(0);
  });

  it('no permite más disparos tras terminar (misma referencia)', () => {
    let s = colocarAmbas(FLOTA_OK(), FLOTA_OK());
    const celdasRival = FLOTA_OK().flat();
    const aguaJ2 = [idx(1, 0), idx(1, 1), idx(1, 2), idx(1, 3), idx(1, 4), idx(1, 5), idx(1, 6), idx(1, 7), idx(3, 0), idx(3, 1), idx(3, 2)];
    for (let k = 0; k < celdasRival.length; k++) {
      s = playMove(s, { tipo: 'disparo', celda: celdasRival[k] });
      if (s.fase === 'finished') break;
      s = playMove(s, { tipo: 'disparo', celda: aguaJ2[k] });
    }
    expect(playMove(s, { tipo: 'disparo', celda: idx(7, 7) })).toBe(s);
  });

  it('determinismo remoto: dos instancias con la misma secuencia de Move convergen', () => {
    const f1 = generarFlotaAleatoria();
    const f2 = generarFlotaAleatoria();
    const jugadas: Move[] = [
      { tipo: 'flota', barcos: f1 },
      { tipo: 'flota', barcos: f2 },
      { tipo: 'disparo', celda: 0 },
      { tipo: 'disparo', celda: 63 },
      { tipo: 'disparo', celda: 12 },
      { tipo: 'disparo', celda: 40 },
    ];
    const correr = () => jugadas.reduce((s, m) => playMove(s, m), createInitialState());
    expect(correr()).toEqual(correr());
  });
});

describe('fuzzing — partidas aleatorias completas', () => {
  it('300 partidas: siempre termina en finished con un ganador y 0 barcos rivales a flote', () => {
    for (let partida = 0; partida < 300; partida++) {
      let s = createInitialState();
      s = playMove(s, { tipo: 'flota', barcos: generarFlotaAleatoria() });
      s = playMove(s, { tipo: 'flota', barcos: generarFlotaAleatoria() });
      expect(s.fase).toBe('disparos');

      const pendientes: Record<Player, number[]> = {
        1: Array.from({ length: 64 }, (_, i) => i),
        2: Array.from({ length: 64 }, (_, i) => i),
      };

      let iteraciones = 0;
      while (s.fase === 'disparos') {
        expect(iteraciones++).toBeLessThan(200);
        const yo = s.currentPlayer;
        const cola = pendientes[yo];
        const pos = Math.floor(Math.random() * cola.length);
        const celda = cola.splice(pos, 1)[0];
        const aFloteAntes = barcosAFlote(s, yo === 1 ? 2 : 1);
        s = playMove(s, { tipo: 'disparo', celda });
        const rival: Player = yo === 1 ? 2 : 1;
        expect(barcosAFlote(s, rival)).toBeLessThanOrEqual(aFloteAntes);
      }

      expect(s.fase).toBe('finished');
      expect(s.winner === 1 || s.winner === 2).toBe(true);
      expect(barcosAFlote(s, s.winner === 1 ? 2 : 1)).toBe(0);
    }
  });
});
