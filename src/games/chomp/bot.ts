import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import {
  COLUMNAS,
  FILAS,
  INDICE_VENENO,
  TOTAL_CASILLAS,
  type ChompState,
} from './engine';

type Filas = readonly [number, number, number, number];

const memoGanadora = new Map<number, boolean>();

function empaquetar(r: Filas): number {
  return (r[0] << 9) | (r[1] << 6) | (r[2] << 3) | r[3];
}

function morderFilas(r: Filas, row: number, col: number): [number, number, number, number] {
  return [
    row <= 0 ? Math.min(r[0], col) : r[0],
    row <= 1 ? Math.min(r[1], col) : r[1],
    row <= 2 ? Math.min(r[2], col) : r[2],
    row <= 3 ? Math.min(r[3], col) : r[3],
  ];
}

function esPosicionGanadora(r: Filas): boolean {
  if (r[0] === 1 && r[1] === 0 && r[2] === 0 && r[3] === 0) {
    return false;
  }
  const clave = empaquetar(r);
  const cacheado = memoGanadora.get(clave);
  if (cacheado !== undefined) return cacheado;

  for (let row = 0; row < FILAS; row++) {
    for (let col = 0; col < r[row]; col++) {
      if (row === 0 && col === 0) continue;
      const siguiente = morderFilas(r, row, col);
      if (!esPosicionGanadora(siguiente)) {
        memoGanadora.set(clave, true);
        return true;
      }
    }
  }

  memoGanadora.set(clave, false);
  return false;
}

function extraerFilas(board: readonly boolean[]): [number, number, number, number] {
  const filas: [number, number, number, number] = [0, 0, 0, 0];
  for (let r = 0; r < FILAS; r++) {
    let largo = 0;
    for (let c = 0; c < COLUMNAS; c++) {
      if (board[r * COLUMNAS + c]) largo++;
    }
    filas[r] = largo;
  }
  return filas;
}

function jugadasLegales(state: ChompState): number[] {
  const legales: number[] = [];
  for (let i = 1; i < TOTAL_CASILLAS; i++) {
    if (i !== INDICE_VENENO && state.board[i]) legales.push(i);
  }
  return legales;
}

function esVictoriaInmediata(filas: Filas, indice: number): boolean {
  const row = Math.floor(indice / COLUMNAS);
  const col = indice % COLUMNAS;
  const s = morderFilas(filas, row, col);
  return s[0] === 1 && s[1] === 0 && s[2] === 0 && s[3] === 0;
}

function regalaVictoriaEnUno(filas: Filas, indice: number): boolean {
  const row = Math.floor(indice / COLUMNAS);
  const col = indice % COLUMNAS;
  const s = morderFilas(filas, row, col);
  if (s[0] === 1 && s[1] === 0) return false; // ya ganó quien mueve
  return s[1] === 0 || s[0] === 1;
}

/** Elige el índice de la casilla a morder en Chomp según el nivel de dificultad. */
export function elegirMovimiento(
  state: ChompState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const legales = jugadasLegales(state);
  if (legales.length === 0) return 1;

  const filas = extraerFilas(state.board);
  const inmediatas = legales.filter(i => esVictoriaInmediata(filas, i));

  if (dificultad === 'facil') {
    if (inmediatas.length > 0 && (legales.length === inmediatas.length || rng() < 0.35)) {
      return elegirAlAzar(inmediatas, rng);
    }
    return elegirAlAzar(legales, rng);
  }

  if (dificultad === 'medio') {
    if (inmediatas.length > 0) return elegirAlAzar(inmediatas, rng);
    const seguras = legales.filter(i => !regalaVictoriaEnUno(filas, i));
    const pool = seguras.length > 0 ? seguras : legales;
    const ganadoras = pool.filter(i => {
      const row = Math.floor(i / COLUMNAS);
      const col = i % COLUMNAS;
      return !esPosicionGanadora(morderFilas(filas, row, col));
    });
    if (ganadoras.length > 0 && rng() < 0.4) {
      return elegirAlAzar(ganadoras, rng);
    }
    return elegirAlAzar(pool, rng);
  }

  const ganadorasExactas: number[] = [];
  let maxVivas = -1;
  let perdedorasLargas: number[] = [];

  for (const i of legales) {
    const row = Math.floor(i / COLUMNAS);
    const col = i % COLUMNAS;
    const siguiente = morderFilas(filas, row, col);
    if (!esPosicionGanadora(siguiente)) {
      ganadorasExactas.push(i);
    } else {
      const vivas = siguiente[0] + siguiente[1] + siguiente[2] + siguiente[3];
      if (vivas > maxVivas) {
        maxVivas = vivas;
        perdedorasLargas = [i];
      } else if (vivas === maxVivas) {
        perdedorasLargas.push(i);
      }
    }
  }

  if (ganadorasExactas.length > 0) {
    return elegirAlAzar(ganadorasExactas, rng);
  }
  return elegirAlAzar(perdedorasLargas, rng);
}
