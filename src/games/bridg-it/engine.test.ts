import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  slotAToEdge,
  slotBToEdge,
  getSlotAStatus,
  getSlotBStatus,
  puedeJugar,
  findWinningPath,
  playMove,
  type Edge,
} from './engine';

describe('createInitialState', () => {
  it('crea las cuatro matrices de aristas con las dimensiones correctas, todas en false', () => {
    const state = createInitialState();
    expect(state.redH.length).toBe(6);
    expect(state.redH.every(fila => fila.length === 4 && fila.every(v => v === false))).toBe(true);
    expect(state.redV.length).toBe(5);
    expect(state.redV.every(fila => fila.length === 5 && fila.every(v => v === false))).toBe(true);
    expect(state.blueH.length).toBe(5);
    expect(state.blueH.every(fila => fila.length === 5 && fila.every(v => v === false))).toBe(true);
    expect(state.blueV.length).toBe(4);
    expect(state.blueV.every(fila => fila.length === 6 && fila.every(v => v === false))).toBe(true);
  });

  it('inicia con el jugador 1 (rojo), en juego, sin ganador', () => {
    const state = createInitialState();
    expect(state.currentPlayer).toBe(1);
    expect(state.status).toBe('playing');
    expect(state.winner).toBeNull();
    expect(state.winningPath).toBeNull();
    expect(state.lastMove).toBeNull();
  });
});

describe('esJugadaValida', () => {
  it('acepta un Edge bien formado', () => {
    expect(esJugadaValida({ type: 'h', row: 0, col: 0 })).toBe(true);
    expect(esJugadaValida({ type: 'v', row: 3, col: 2 })).toBe(true);
  });

  it('rechaza payloads mal formados', () => {
    expect(esJugadaValida(null)).toBe(false);
    expect(esJugadaValida(42)).toBe(false);
    expect(esJugadaValida({ type: 'x', row: 0, col: 0 })).toBe(false);
    expect(esJugadaValida({ type: 'h', row: -1, col: 0 })).toBe(false);
    expect(esJugadaValida({ type: 'h', row: 1.5, col: 0 })).toBe(false);
    expect(esJugadaValida({ type: 'h', row: 0 })).toBe(false);
  });
});

describe('slotAToEdge / slotBToEdge', () => {
  it('slot A da la arista roja h para el jugador 1 solo cuando j-1 está en rango', () => {
    expect(slotAToEdge(1, 0, 0)).toBeNull(); // j-1 = -1, fuera de rango
    expect(slotAToEdge(1, 0, 1)).toEqual({ type: 'h', row: 0, col: 0 });
    expect(slotAToEdge(1, 5, 4)).toEqual({ type: 'h', row: 5, col: 3 });
    expect(slotAToEdge(1, 0, 5)).toBeNull(); // j-1 = 4, fuera de rango (redH col máx 3)
  });

  it('slot A da la arista azul v para el jugador 2 solo cuando i-1 está en rango', () => {
    expect(slotAToEdge(2, 0, 0)).toBeNull(); // i-1 = -1, fuera de rango
    expect(slotAToEdge(2, 1, 0)).toEqual({ type: 'v', row: 0, col: 0 });
    expect(slotAToEdge(2, 4, 5)).toEqual({ type: 'v', row: 3, col: 5 });
    expect(slotAToEdge(2, 5, 0)).toBeNull(); // i-1 = 4, fuera de rango (blueV fila máx 3)
  });

  it('slot B da la arista roja v para el jugador 1 en cualquier posición válida', () => {
    expect(slotBToEdge(1, 0, 0)).toEqual({ type: 'v', row: 0, col: 0 });
    expect(slotBToEdge(1, 4, 4)).toEqual({ type: 'v', row: 4, col: 4 });
    expect(slotBToEdge(1, 5, 0)).toBeNull(); // fuera de rango (slot B es 0-4 en ambos ejes)
  });

  it('slot B da la arista azul h para el jugador 2 en cualquier posición válida', () => {
    expect(slotBToEdge(2, 0, 0)).toEqual({ type: 'h', row: 0, col: 0 });
    expect(slotBToEdge(2, 4, 4)).toEqual({ type: 'h', row: 4, col: 4 });
    expect(slotBToEdge(2, 0, 5)).toBeNull(); // fuera de rango
  });
});

describe('getSlotAStatus / getSlotBStatus', () => {
  it('reporta vacío cuando no hay arista dibujada', () => {
    const state = createInitialState();
    expect(getSlotAStatus(state, 2, 2)).toEqual({ drawn: false, owner: null });
    expect(getSlotBStatus(state, 2, 2)).toEqual({ drawn: false, owner: null });
  });

  it('reporta el dueño rojo cuando redH está marcada (slot A)', () => {
    const state = createInitialState();
    state.redH[2][1] = true; // slot A en i=2,j=2 aloja redH(2, j-1=1)
    expect(getSlotAStatus(state, 2, 2)).toEqual({ drawn: true, owner: 1 });
  });

  it('reporta el dueño azul cuando blueV está marcada (slot A)', () => {
    const state = createInitialState();
    state.blueV[1][2] = true; // slot A en i=2,j=2 aloja blueV(i-1=1, 2)
    expect(getSlotAStatus(state, 2, 2)).toEqual({ drawn: true, owner: 2 });
  });

  it('reporta el dueño rojo cuando redV está marcada (slot B)', () => {
    const state = createInitialState();
    state.redV[2][2] = true;
    expect(getSlotBStatus(state, 2, 2)).toEqual({ drawn: true, owner: 1 });
  });

  it('reporta el dueño azul cuando blueH está marcada (slot B, mismos índices)', () => {
    const state = createInitialState();
    state.blueH[0][1] = true; // slot B en (0,1) aloja blueH(0,1) directamente
    expect(getSlotBStatus(state, 0, 1)).toEqual({ drawn: true, owner: 2 });
  });
});

describe('puedeJugar', () => {
  it('permite la primera jugada de rojo en cualquier arista propia', () => {
    const state = createInitialState();
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(true);
  });

  it('rechaza redibujar una arista propia ya trazada', () => {
    const state = createInitialState();
    state.redH[0][0] = true;
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(false);
  });

  it('bloquea la arista roja h cruzada una vez trazada la azul v correspondiente', () => {
    const state = createInitialState();
    state.currentPlayer = 2;
    state.blueV[0][1] = true; // redH(1,0) cruza blueV(0,1)
    state.currentPlayer = 1;
    expect(puedeJugar(state, { type: 'h', row: 1, col: 0 })).toBe(false);
  });

  it('bloquea la arista azul v cruzada una vez trazada la roja h correspondiente', () => {
    const state = createInitialState();
    state.redH[1][0] = true;
    state.currentPlayer = 2;
    expect(puedeJugar(state, { type: 'v', row: 0, col: 1 })).toBe(false);
  });

  it('bloquea la arista azul h cruzada una vez trazada la roja v correspondiente (índices directos)', () => {
    const state = createInitialState();
    state.redV[0][0] = true;
    state.currentPlayer = 2;
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(false);
  });

  it('bloquea la arista roja v cruzada una vez trazada la azul h correspondiente (índices directos)', () => {
    const state = createInitialState();
    state.currentPlayer = 2;
    state.blueH[4][4] = true;
    state.currentPlayer = 1;
    expect(puedeJugar(state, { type: 'v', row: 4, col: 4 })).toBe(false);
  });

  it('permite jugar redH en la fila 0 (borde superior rojo, sin arista cruzada posible)', () => {
    const state = createInitialState();
    // redH(0,0): br = -1, fuera de rango de blueV — no hay cruce posible.
    expect(puedeJugar(state, { type: 'h', row: 0, col: 0 })).toBe(true);
  });

  it('permite jugar redH en la fila 5 (borde inferior rojo, sin arista cruzada posible)', () => {
    const state = createInitialState();
    // redH(5,0): br = 4, fuera de rango de blueV (máx 3) — no hay cruce posible.
    expect(puedeJugar(state, { type: 'h', row: 5, col: 0 })).toBe(true);
  });

  it('permite jugar blueV en la columna 0 (borde izquierdo azul, sin arista cruzada posible)', () => {
    const state = createInitialState();
    state.currentPlayer = 2;
    // blueV(0,0): bc = -1, fuera de rango de redH — no hay cruce posible.
    expect(puedeJugar(state, { type: 'v', row: 0, col: 0 })).toBe(true);
  });

  it('permite jugar blueV en la columna 5 (borde derecho azul, sin arista cruzada posible)', () => {
    const state = createInitialState();
    state.currentPlayer = 2;
    // blueV(0,5): bc = 4, fuera de rango de redH (máx 3) — no hay cruce posible.
    expect(puedeJugar(state, { type: 'v', row: 0, col: 5 })).toBe(true);
  });

  it('rechaza coordenadas fuera de rango para el jugador activo', () => {
    const state = createInitialState();
    expect(puedeJugar(state, { type: 'h', row: 0, col: 4 })).toBe(false); // redH col máx es 3
    state.currentPlayer = 2;
    expect(puedeJugar(state, { type: 'h', row: 0, col: 5 })).toBe(false); // blueH col máx es 4
  });
});

describe('findWinningPath', () => {
  it('retorna null si no hay conexión', () => {
    const state = createInitialState();
    expect(findWinningPath(state, 1)).toBeNull();
  });

  it('encuentra la conexión roja fila 0 a fila 5 por una columna recta', () => {
    const state = createInitialState();
    for (let r = 0; r < 5; r++) state.redV[r][0] = true; // columna 0 completa
    const camino = findWinningPath(state, 1);
    expect(camino).not.toBeNull();
    expect(camino![0]).toEqual({ r: 0, c: 0 });
    expect(camino![camino!.length - 1]).toEqual({ r: 5, c: 0 });
  });

  it('encuentra la conexión azul columna 0 a columna 5 por una fila recta', () => {
    const state = createInitialState();
    for (let c = 0; c < 5; c++) state.blueH[0][c] = true; // fila 0 completa
    const camino = findWinningPath(state, 2);
    expect(camino).not.toBeNull();
    expect(camino![0]).toEqual({ r: 0, c: 0 });
    expect(camino![camino!.length - 1]).toEqual({ r: 0, c: 5 });
  });

  it('no confunde la grilla roja con la azul', () => {
    const state = createInitialState();
    for (let c = 0; c < 5; c++) state.blueH[0][c] = true;
    expect(findWinningPath(state, 1)).toBeNull();
  });
});

describe('playMove', () => {
  it('ignora una jugada inválida y retorna el mismo estado', () => {
    const state = createInitialState();
    state.redH[0][0] = true;
    const resultado = playMove(state, { type: 'h', row: 0, col: 0 });
    expect(resultado).toBe(state);
  });

  it('marca la arista y pasa el turno cuando no hay victoria', () => {
    const state = createInitialState();
    const resultado = playMove(state, { type: 'h', row: 0, col: 0 });
    expect(resultado.redH[0][0]).toBe(true);
    expect(resultado.currentPlayer).toBe(2);
    expect(resultado.status).toBe('playing');
    expect(resultado.lastMove).toEqual({ player: 1, edge: { type: 'h', row: 0, col: 0 } });
    // no debe mutar el estado original
    expect(state.redH[0][0]).toBe(false);
  });

  // Las jugadas azules intercaladas usan columna 1 (no columna 0) a propósito:
  // redV(r,0) cruza blueH(r,0) directamente (mismos índices), así que una
  // jugada azul en blueH(r,0) quedaría bloqueada apenas rojo jugara
  // redV(r,0) en esa misma fila. Usando blueH(r,1) se evita ese cruce por
  // completo, y al estar cada una en una fila distinta tampoco forman nunca
  // un camino azul columna 0 a columna 5.
  it('declara ganador a rojo al completar fila 0 a fila 5', () => {
    let state = createInitialState();
    for (let r = 0; r < 4; r++) {
      state = playMove(state, { type: 'v', row: r, col: 0 });
      state = playMove(state, { type: 'h', row: r, col: 1 });
    }
    state = playMove(state, { type: 'v', row: 4, col: 0 });
    expect(state.status).toBe('won');
    expect(state.winner).toBe(1);
    expect(state.winningPath).not.toBeNull();
  });

  it('no cambia de turno ni de estado tras la jugada ganadora', () => {
    let state = createInitialState();
    for (let r = 0; r < 4; r++) {
      state = playMove(state, { type: 'v', row: r, col: 0 });
      state = playMove(state, { type: 'h', row: r, col: 1 });
    }
    const antes = state.currentPlayer;
    state = playMove(state, { type: 'v', row: 4, col: 0 });
    expect(state.currentPlayer).toBe(antes);
    expect(puedeJugar(state, { type: 'h', row: 4, col: 2 })).toBe(false); // status ya no es 'playing'
  });
});

// Candidatas: type 'h' con r:0-5,c:0-4 cubre tanto el rango propio de rojo
// (r:0-5,c:0-3) como el de azul (r:0-4,c:0-4); type 'v' con r:0-4,c:0-5
// cubre tanto el de rojo (r:0-4,c:0-4) como el de azul (r:0-3,c:0-5). Ambos
// jugadores quedan representados sin necesidad de generar sus rangos por
// separado (evita duplicados y mantiene una única fuente de candidatas).
function todasLasAristasPosibles(): Edge[] {
  const aristas: Edge[] = [];
  for (let r = 0; r <= 5; r++) for (let c = 0; c <= 4; c++) aristas.push({ type: 'h', row: r, col: c });
  for (let r = 0; r <= 4; r++) for (let c = 0; c <= 5; c++) aristas.push({ type: 'v', row: r, col: c });
  return aristas;
}

describe('partidas aleatorias', () => {
  it('siempre terminan con exactamente un ganador, sin excepciones', () => {
    const candidatas = todasLasAristasPosibles();
    for (let partida = 0; partida < 2000; partida++) {
      let state = createInitialState();
      let intentosSinExito = 0;
      while (state.status === 'playing' && intentosSinExito < 1000) {
        const candidata = candidatas[Math.floor(Math.random() * candidatas.length)];
        const antes = state;
        state = playMove(state, candidata);
        intentosSinExito = state === antes ? intentosSinExito + 1 : 0;
      }
      expect(state.status).toBe('won');
      expect(state.winner === 1 || state.winner === 2).toBe(true);

      // El camino ganador debe estar formado enteramente por aristas propias
      // realmente trazadas, y sus extremos deben tocar los bordes correctos.
      const ganador = state.winner!;
      const camino = state.winningPath!;
      expect(camino).not.toBeNull();
      expect(camino.length).toBeGreaterThan(0);
      const matrizH = ganador === 1 ? state.redH : state.blueH;
      const matrizV = ganador === 1 ? state.redV : state.blueV;
      for (let i = 0; i < camino.length - 1; i++) {
        const p1 = camino[i];
        const p2 = camino[i + 1];
        if (p1.r === p2.r) {
          const col = Math.min(p1.c, p2.c);
          expect(matrizH[p1.r]?.[col]).toBe(true);
        } else if (p1.c === p2.c) {
          const fila = Math.min(p1.r, p2.r);
          expect(matrizV[fila]?.[p1.c]).toBe(true);
        } else {
          throw new Error('Puntos consecutivos del camino no son adyacentes');
        }
      }
      const primero = camino[0];
      const ultimo = camino[camino.length - 1];
      if (ganador === 1) {
        expect(primero.r).toBe(0);
        expect(ultimo.r).toBe(5);
      } else {
        expect(primero.c).toBe(0);
        expect(ultimo.c).toBe(5);
      }
    }
  });
});
