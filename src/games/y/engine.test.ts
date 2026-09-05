import { describe, it, expect } from 'vitest';
import {
  cellCount,
  coordsOf,
  createInitialState,
  esJugadaValida,
  getNeighbors,
  indexOf,
  playMove,
  tocaLados,
  type BoardSize,
} from './engine';

describe('cellCount', () => {
  it('devuelve N(N+1)/2 para cada tamaño', () => {
    expect(cellCount(7)).toBe(28);
    expect(cellCount(9)).toBe(45);
    expect(cellCount(11)).toBe(66);
  });
});

describe('indexOf / coordsOf', () => {
  it('son inversas y biyectivas sobre [0, cellCount)', () => {
    for (const N of [7, 9, 11] as BoardSize[]) {
      const vistos = new Set<number>();
      for (let r = 0; r < N; r++) {
        for (let c = 0; c <= r; c++) {
          const i = indexOf(r, c);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(cellCount(N));
          expect(vistos.has(i)).toBe(false);
          vistos.add(i);
          expect(coordsOf(i)).toEqual({ r, c });
        }
      }
      expect(vistos.size).toBe(cellCount(N));
    }
  });
});

describe('createInitialState', () => {
  it('crea un estado por defecto N=9 con 45 celdas vacías y turno de J1', () => {
    const s = createInitialState();
    expect(s.size).toBe(9);
    expect(s.board).toHaveLength(45);
    expect(s.board.every(c => c === null)).toBe(true);
    expect(s.currentPlayer).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
    expect(s.winningCells).toBeNull();
    expect(s.lastMove).toBeNull();
  });

  it('permite N=7 y N=11', () => {
    expect(createInitialState(7).board).toHaveLength(28);
    expect(createInitialState(11).board).toHaveLength(66);
  });
});

describe('esJugadaValida', () => {
  it('acepta enteros en [0, cellCount(size))', () => {
    expect(esJugadaValida(0, 7)).toBe(true);
    expect(esJugadaValida(27, 7)).toBe(true);
    expect(esJugadaValida(44, 9)).toBe(true);
  });

  it('rechaza fuera de rango, floats, strings, NaN y otros tipos', () => {
    expect(esJugadaValida(-1, 7)).toBe(false);
    expect(esJugadaValida(28, 7)).toBe(false);
    expect(esJugadaValida(2.5, 7)).toBe(false);
    expect(esJugadaValida('3', 7)).toBe(false);
    expect(esJugadaValida(null, 7)).toBe(false);
    expect(esJugadaValida({}, 7)).toBe(false);
    expect(esJugadaValida(NaN, 7)).toBe(false);
  });
});

describe('getNeighbors', () => {
  const grado = (r: number, c: number, N: BoardSize) =>
    getNeighbors(indexOf(r, c), N).length;

  it('el ápice (0,0) tiene 2 vecinos', () => {
    for (const N of [7, 9, 11] as BoardSize[]) expect(grado(0, 0, N)).toBe(2);
  });

  it('las esquinas inferiores tienen 2 vecinos (simetría con el ápice)', () => {
    for (const N of [7, 9, 11] as BoardSize[]) {
      expect(grado(N - 1, 0, N)).toBe(2);
      expect(grado(N - 1, N - 1, N)).toBe(2);
    }
  });

  it('un punto medio de lado (no esquina) tiene 4 vecinos', () => {
    // Lado izquierdo (c=0), fila intermedia
    expect(grado(3, 0, 7)).toBe(4);
    // Lado derecho (c=r), fila intermedia
    expect(grado(3, 3, 7)).toBe(4);
    // Lado inferior (r=N-1), columna intermedia
    expect(grado(6, 3, 7)).toBe(4);
  });

  it('una celda interior tiene 6 vecinos', () => {
    expect(grado(3, 1, 7)).toBe(6);
    expect(grado(4, 2, 9)).toBe(6);
  });

  it('getNeighbors es recíproco', () => {
    const N: BoardSize = 7;
    for (let i = 0; i < cellCount(N); i++) {
      for (const v of getNeighbors(i, N)) {
        expect(getNeighbors(v, N)).toContain(i);
      }
    }
  });

  it('el ápice conecta con las dos celdas de la fila 1', () => {
    expect(getNeighbors(indexOf(0, 0), 7).sort((a, b) => a - b)).toEqual(
      [indexOf(1, 0), indexOf(1, 1)].sort((a, b) => a - b)
    );
  });
});

// Coloca una lista de celdas para `player` en un estado, saltándose la
// alternancia (helper de test que manipula el board directamente).
function conFichas(
  size: BoardSize,
  fichas: Array<{ i: number; p: 1 | 2 }>
) {
  let s = createInitialState(size);
  const board = [...s.board];
  for (const { i, p } of fichas) board[i] = p;
  return { ...s, board };
}

describe('playMove — guards', () => {
  it('devuelve el mismo estado si la celda está ocupada', () => {
    let s = createInitialState(7);
    s = playMove(s, 0);
    const antes = s;
    const despues = playMove(s, 0);
    expect(despues).toBe(antes);
  });

  it('devuelve el mismo estado si el índice está fuera de rango', () => {
    const s = createInitialState(7);
    expect(playMove(s, 28)).toBe(s);
    expect(playMove(s, -1)).toBe(s);
  });

  it('devuelve el mismo estado si la partida ya terminó', () => {
    // Cadena de J1 en N=7 que toca los tres lados: columna c=0 de r=0..6
    // toca izq (c=0) e inf (r=6); falta der. Añadimos (6,6) y conectamos por
    // la fila 6: (6,0),(6,1)..(6,6) toca izq, inf y der.
    const fichas: Array<{ i: number; p: 1 | 2 }> = [];
    for (let c = 0; c <= 6; c++) fichas.push({ i: indexOf(6, c), p: 1 });
    // fila 6 completa toca c=0 (izq), r=6 (inf) y c=r=6 (der)
    let s = conFichas(7, fichas.slice(0, 6)); // sin la última ficha aún
    s = { ...s, currentPlayer: 1 };
    s = playMove(s, indexOf(6, 6)); // ficha ganadora
    expect(s.status).toBe('won');
    const congelado = s;
    expect(playMove(s, indexOf(0, 0))).toBe(congelado);
  });

  it('no muta el estado de entrada', () => {
    const s = createInitialState(7);
    const copiaBoard = [...s.board];
    playMove(s, 3);
    expect(s.board).toEqual(copiaBoard);
    expect(s.currentPlayer).toBe(1);
  });
});

describe('playMove — turno', () => {
  it('alterna currentPlayer y fija lastMove tras jugada válida', () => {
    let s = createInitialState(7);
    s = playMove(s, 5);
    expect(s.currentPlayer).toBe(2);
    expect(s.lastMove).toBe(5);
    s = playMove(s, 6);
    expect(s.currentPlayer).toBe(1);
  });
});

describe('playMove — victoria', () => {
  it('J1 gana al conectar los tres lados; winningCells contiene la cadena', () => {
    // Fila 6 completa de J1 en N=7.
    const fichas: Array<{ i: number; p: 1 | 2 }> = [];
    for (let c = 0; c < 6; c++) fichas.push({ i: indexOf(6, c), p: 1 });
    let s = conFichas(7, fichas);
    s = { ...s, currentPlayer: 1 };
    s = playMove(s, indexOf(6, 6));
    expect(s.status).toBe('won');
    expect(s.winner).toBe(1);
    expect(s.currentPlayer).toBe(1); // no alterna al ganar
    for (let c = 0; c <= 6; c++) {
      expect(s.winningCells).toContain(indexOf(6, c));
    }
  });

  it('componentes disjuntos NO cuentan como victoria', () => {
    // Grupo A de J1: (0,0) toca izq+der pero no inf.
    // Grupo B de J1: (6,3) toca inf pero está desconectado de A.
    // Colocar (6,4) (adyacente a (6,3)) no debe ganar.
    let s = conFichas(7, [
      { i: indexOf(0, 0), p: 1 },
      { i: indexOf(6, 3), p: 1 },
    ]);
    s = { ...s, currentPlayer: 1 };
    s = playMove(s, indexOf(6, 4));
    expect(s.status).toBe('playing');
    expect(s.winner).toBeNull();
  });

  it('una sola ficha en el ápice no gana (no toca el lado inferior)', () => {
    let s = createInitialState(7);
    s = playMove(s, indexOf(0, 0));
    expect(s.status).toBe('playing');
  });

  it('colocar la ficha que cerraría la Y del rival no da la victoria a quien mueve', () => {
    // J2 tiene fila 6 casi completa: (6,0)..(6,5). Turno de J1.
    // J1 coloca (6,6): completa geométricamente la fila pero es ficha de J1,
    // el componente de J1 en (6,6) solo toca inf+der, no izq.
    const fichas: Array<{ i: number; p: 1 | 2 }> = [];
    for (let c = 0; c <= 5; c++) fichas.push({ i: indexOf(6, c), p: 2 });
    let s = conFichas(7, fichas);
    s = { ...s, currentPlayer: 1 };
    s = playMove(s, indexOf(6, 6));
    expect(s.status).toBe('playing');
  });
});

describe('tocaLados', () => {
  it('detecta pertenencia a cada lado en N=7', () => {
    expect(tocaLados([indexOf(3, 0)], 7)).toEqual({ izq: true, der: false, inf: false });
    expect(tocaLados([indexOf(3, 3)], 7)).toEqual({ izq: false, der: true, inf: false });
    expect(tocaLados([indexOf(6, 2)], 7)).toEqual({ izq: false, der: false, inf: true });
    expect(tocaLados([indexOf(0, 0)], 7)).toEqual({ izq: true, der: true, inf: false });
  });
});

// Verificación independiente: ¿algún componente conectado de `player`
// toca los tres lados? Recomputa adyacencia y pertenencia a lados inline
// (sin reutilizar getNeighbors ni tocaLados del motor).
function ganadorPorFloodFill(
  board: (1 | 2 | null)[],
  size: BoardSize
): 1 | 2 | null {
  // Convierte índice lineal a índice de fila: i = r*(r+1)/2 + c
  // Por lo tanto r tal que r*(r+1)/2 <= i < (r+1)*(r+2)/2
  const getRowFromIndex = (i: number): number => {
    let r = 0;
    while ((r + 1) * (r + 2) / 2 <= i) r++;
    return r;
  };

  // Dado índice i e índice de fila r, retorna columna c
  const getColFromIndex = (i: number, r: number): number => i - r * (r + 1) / 2;

  // Calcula 6 vecinos directos en (r,c) aritmética, convierte a índices
  const getNeighborsIndependent = (i: number, N: BoardSize): number[] => {
    const r = getRowFromIndex(i);
    const c = getColFromIndex(i, r);
    const neighbors: number[] = [];

    const deltas = [
      [-1, -1], [-1, 0], [0, -1], [0, 1], [1, 0], [1, 1],
    ];

    for (const [dr, dc] of deltas) {
      const nr = r + dr;
      const nc = c + dc;
      // Valida: 0 <= nr < N, 0 <= nc <= nr
      if (nr >= 0 && nr < N && nc >= 0 && nc <= nr) {
        const idx = (nr * (nr + 1)) / 2 + nc;
        neighbors.push(idx);
      }
    }
    return neighbors;
  };

  // Verifica pertenencia a los tres lados sin llamar a tocaLados
  const tocaLadosIndependent = (comp: number[], N: BoardSize): { izq: boolean; der: boolean; inf: boolean } => {
    let izq = false, der = false, inf = false;
    for (const i of comp) {
      const r = getRowFromIndex(i);
      const c = getColFromIndex(i, r);
      if (c === 0) izq = true;
      if (c === r) der = true;
      if (r === N - 1) inf = true;
    }
    return { izq, der, inf };
  };

  for (const player of [1, 2] as const) {
    const visitado = new Set<number>();
    for (let inicio = 0; inicio < cellCount(size); inicio++) {
      if (board[inicio] !== player || visitado.has(inicio)) continue;
      const comp: number[] = [];
      const cola = [inicio];
      visitado.add(inicio);
      while (cola.length > 0) {
        const a = cola.shift()!;
        comp.push(a);
        for (const v of getNeighborsIndependent(a, size)) {
          if (board[v] === player && !visitado.has(v)) {
            visitado.add(v);
            cola.push(v);
          }
        }
      }
      const { izq, der, inf } = tocaLadosIndependent(comp, size);
      if (izq && der && inf) return player;
    }
  }
  return null;
}

function barajar<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe('propiedad: Y no tiene empates', () => {
  for (const N of [7, 9, 11] as BoardSize[]) {
    it(`N=${N}: toda partida aleatoria termina con exactamente un ganador`, () => {
      const iteraciones = 5000;
      for (let it = 0; it < iteraciones; it++) {
        let s = createInitialState(N);
        const orden = barajar([...Array(cellCount(N)).keys()]);
        for (const celda of orden) {
          if (s.status === 'won') break;
          s = playMove(s, celda);
        }
        // Con el tablero lleno (o antes) siempre hay ganador.
        expect(s.status).toBe('won');
        expect(s.winner === 1 || s.winner === 2).toBe(true);
        // El ganador del motor coincide con la verificación independiente.
        expect(ganadorPorFloodFill(s.board, N)).toBe(s.winner);
      }
    });
  }
});
