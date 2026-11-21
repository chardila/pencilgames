import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { PARA_GANAR, TAMANO, type CellValue, type GomokuState, type Player } from './engine';

const TOTAL = TAMANO * TAMANO;
const CENTRO = Math.floor(TAMANO / 2) * TAMANO + Math.floor(TAMANO / 2);

const DIRECCIONES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Precomputar las 36 líneas de longitud >= 5 para evaluación rápida sin asignaciones.
const LINEAS: number[][] = (() => {
  const res: number[][] = [];
  // Filas y columnas
  for (let i = 0; i < TAMANO; i++) {
    res.push(Array.from({ length: TAMANO }, (_, c) => i * TAMANO + c));
    res.push(Array.from({ length: TAMANO }, (_, f) => f * TAMANO + i));
  }
  // Diagonales ↘
  for (let start = 0; start <= TAMANO - PARA_GANAR; start++) {
    const d1: number[] = [];
    for (let k = 0; start + k < TAMANO; k++) d1.push(k * TAMANO + (start + k));
    res.push(d1);
    if (start > 0) {
      const d2: number[] = [];
      for (let k = 0; start + k < TAMANO; k++) d2.push((start + k) * TAMANO + k);
      res.push(d2);
    }
  }
  // Diagonales ↗
  for (let start = PARA_GANAR - 1; start < TAMANO; start++) {
    const d1: number[] = [];
    for (let k = 0; start - k >= 0; k++) d1.push(k * TAMANO + (start - k));
    res.push(d1);
    if (start < TAMANO - 1) {
      const baseF = TAMANO - 1 - start;
      const d2: number[] = [];
      for (let k = 0; baseF + k < TAMANO; k++) {
        d2.push((baseF + k) * TAMANO + (TAMANO - 1 - k));
      }
      res.push(d2);
    }
  }
  return res;
})();

function obtenerCandidatas(board: readonly CellValue[]): number[] {
  const marcadas = new Uint8Array(TOTAL);
  let hayFichas = false;

  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === null) continue;
    hayFichas = true;
    const f0 = Math.floor(i / TAMANO);
    const c0 = i % TAMANO;
    for (let df = -2; df <= 2; df++) {
      const f = f0 + df;
      if (f < 0 || f >= TAMANO) continue;
      for (let dc = -2; dc <= 2; dc++) {
        const c = c0 + dc;
        if (c < 0 || c >= TAMANO) continue;
        const idx = f * TAMANO + c;
        if (board[idx] === null) marcadas[idx] = 1;
      }
    }
  }

  if (!hayFichas) return [CENTRO];

  const candidatas: number[] = [];
  for (let i = 0; i < TOTAL; i++) {
    if (marcadas[i] === 1) candidatas.push(i);
  }
  if (candidatas.length > 0) return candidatas;

  for (let i = 0; i < TOTAL; i++) {
    if (board[i] === null) candidatas.push(i);
  }
  return candidatas;
}

function esVictoriaEn(board: readonly CellValue[], idx: number, player: Player): boolean {
  const f0 = Math.floor(idx / TAMANO);
  const c0 = idx % TAMANO;
  for (const [df, dc] of DIRECCIONES) {
    let cuenta = 1;
    let f = f0 - df;
    let c = c0 - dc;
    while (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO && board[f * TAMANO + c] === player) {
      cuenta++;
      f -= df;
      c -= dc;
    }
    f = f0 + df;
    c = c0 + dc;
    while (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO && board[f * TAMANO + c] === player) {
      cuenta++;
      f += df;
      c += dc;
    }
    if (cuenta >= PARA_GANAR) return true;
  }
  return false;
}

function puntuarRacha(largo: number, abiertos: number): number {
  if (largo >= 5) return 100_000;
  if (abiertos === 0) return 0;
  if (largo === 4) return abiertos === 2 ? 15_000 : 2_500;
  if (largo === 3) return abiertos === 2 ? 1_200 : 180;
  if (largo === 2) return abiertos === 2 ? 90 : 18;
  return abiertos === 2 ? 6 : 1;
}

/**
 * Evalúa el tablero por rachas en las 36 líneas, diferenciando extremos abiertos
 * y detectando victoria inmediata en turno si el jugador activo ya tiene 4 abiertos.
 */
function evaluarTablero(board: readonly CellValue[], jugadorTurno: Player): number {
  let score = 0;

  for (const linea of LINEAS) {
    let i = 0;
    const n = linea.length;
    while (i < n) {
      const ficha = board[linea[i]];
      if (ficha === null) {
        i++;
        continue;
      }
      const izqLibre = i > 0 && board[linea[i - 1]] === null;
      let j = i + 1;
      while (j < n && board[linea[j]] === ficha) j++;
      const derLibre = j < n && board[linea[j]] === null;
      const abiertos = (izqLibre ? 1 : 0) + (derLibre ? 1 : 0);
      const largo = j - i;
      if (ficha === jugadorTurno && largo >= 4 && abiertos >= 1) {
        return 90_000;
      }
      const pts = puntuarRacha(largo, abiertos);
      if (ficha === jugadorTurno) {
        score += pts;
      } else {
        // Ponderar ligeramente al rival en amenazas altas porque ya le toca pronto.
        score -= pts >= 1_200 ? Math.round(pts * 1.15) : pts;
      }
      i = j;
    }
  }

  return score;
}

/**
 * Puntúa localmente el impacto de colocar una ficha de `player` en `idx`,
 * inspeccionando solo las 4 direcciones que cruzan la casilla.
 */
function puntuarCasillaLocal(board: readonly CellValue[], idx: number, player: Player): number {
  const rival: Player = player === 1 ? 2 : 1;
  const f0 = Math.floor(idx / TAMANO);
  const c0 = idx % TAMANO;
  let total = 0;

  for (const [df, dc] of DIRECCIONES) {
    let cuenta = 1;

    let f = f0 - df;
    let c = c0 - dc;
    while (f >= 0 && f < TAMANO && c >= 0 && c < TAMANO && board[f * TAMANO + c] === player) {
      cuenta++;
      f -= df;
      c -= dc;
    }
    const izqLibre = f >= 0 && f < TAMANO && c >= 0 && c < TAMANO && board[f * TAMANO + c] === null;

    let f2 = f0 + df;
    let c2 = c0 + dc;
    while (f2 >= 0 && f2 < TAMANO && c2 >= 0 && c2 < TAMANO && board[f2 * TAMANO + c2] === player) {
      cuenta++;
      f2 += df;
      c2 += dc;
    }
    const derLibre = f2 >= 0 && f2 < TAMANO && c2 >= 0 && c2 < TAMANO && board[f2 * TAMANO + c2] === null;

    let espacio = cuenta;
    while (
      f >= 0 &&
      f < TAMANO &&
      c >= 0 &&
      c < TAMANO &&
      board[f * TAMANO + c] !== rival &&
      espacio < PARA_GANAR
    ) {
      espacio++;
      f -= df;
      c -= dc;
    }
    while (
      f2 >= 0 &&
      f2 < TAMANO &&
      c2 >= 0 &&
      c2 < TAMANO &&
      board[f2 * TAMANO + c2] !== rival &&
      espacio < PARA_GANAR
    ) {
      espacio++;
      f2 += df;
      c2 += dc;
    }

    if (cuenta >= PARA_GANAR) {
      total += 100_000;
    } else if (espacio >= PARA_GANAR) {
      const abiertos = (izqLibre ? 1 : 0) + (derLibre ? 1 : 0);
      total += puntuarRacha(cuenta, abiertos);
    }
  }

  return total;
}

function ordenarCandidatas(
  board: readonly CellValue[],
  candidatas: number[],
  jugador: Player
): Array<{ idx: number; score: number }> {
  const rival: Player = jugador === 1 ? 2 : 1;
  const evaluadas = candidatas.map(idx => {
    const ataque = puntuarCasillaLocal(board, idx, jugador);
    const defensa = puntuarCasillaLocal(board, idx, rival);
    const distCentro =
      Math.abs(Math.floor(idx / TAMANO) - 4) + Math.abs((idx % TAMANO) - 4);
    return { idx, score: ataque + Math.round(defensa * 0.9) - distCentro };
  });
  evaluadas.sort((a, b) => b.score - a.score);
  return evaluadas;
}

function negamax(
  board: CellValue[],
  profundidad: number,
  alpha: number,
  beta: number,
  turno: Player
): number {
  if (profundidad === 0) {
    return evaluarTablero(board, turno);
  }

  const candidatas = obtenerCandidatas(board);
  if (candidatas.length === 0) return 0;

  const rival: Player = turno === 1 ? 2 : 1;
  const ordenadas = ordenarCandidatas(board, candidatas, turno);
  const jugadas =
    ordenadas[0].score >= 85_000
      ? ordenadas.filter(c => c.score >= 85_000).slice(0, 2)
      : ordenadas.slice(0, profundidad >= 2 ? 7 : 6);

  let mejor = -Infinity;
  for (const { idx } of jugadas) {
    board[idx] = turno;
    if (esVictoriaEn(board, idx, turno)) {
      board[idx] = null;
      return 100_000 + profundidad;
    }
    const valor = -negamax(board, profundidad - 1, -beta, -alpha, rival);
    board[idx] = null;
    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }
  return mejor;
}

/**
 * Elige la siguiente casilla del bot de Gomoku según la dificultad indicada.
 */
export function elegirMovimiento(
  state: GomokuState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): number {
  const board = [...state.board];
  const yo = state.currentPlayer;
  const rival: Player = yo === 1 ? 2 : 1;
  const candidatas = obtenerCandidatas(board);
  if (candidatas.length === 0) return CENTRO;

  // Tablero vacío: en Fácil variar alrededor del centro; en Medio/Difícil ir al centro.
  if (candidatas.length === 1 && candidatas[0] === CENTRO && board.every(c => c === null)) {
    if (dificultad === 'facil') {
      const vecindadCentro = [30, 31, 32, 39, 40, 41, 48, 49, 50];
      return elegirAlAzar(vecindadCentro, rng);
    }
    return CENTRO;
  }

  const ganadoras = candidatas.filter(i => esVictoriaEn(board, i, yo));

  if (dificultad === 'facil') {
    if (ganadoras.length > 0 && (candidatas.length === ganadoras.length || rng() < 0.35)) {
      return elegirAlAzar(ganadoras, rng);
    }
    const ordenadas = ordenarCandidatas(board, candidatas, yo);
    const conRuido = ordenadas.map(c => ({
      idx: c.idx,
      puntaje: c.score * 0.05 + rng() * 1_200,
    }));
    conRuido.sort((a, b) => b.puntaje - a.puntaje);
    return conRuido[0].idx;
  }

  if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);

  const bloqueos4 = candidatas.filter(i => esVictoriaEn(board, i, rival));
  if (bloqueos4.length > 0) return elegirAlAzar(bloqueos4, rng);

  const ordenadas = ordenarCandidatas(board, candidatas, yo);

  if (dificultad === 'medio') {
    const top = ordenadas.slice(0, Math.min(3, ordenadas.length)).map(c => c.idx);
    return elegirAlAzar(top, rng);
  }

  const top = ordenadas.slice(0, Math.min(8, ordenadas.length));
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (const { idx } of top) {
    board[idx] = yo;
    const beta = mejor === -Infinity ? Infinity : -(mejor - 1);
    const valor = -negamax(board, 2, -Infinity, beta, rival);
    board[idx] = null;
    if (valor > mejor) {
      mejor = valor;
      mejores = [idx];
    } else if (valor === mejor) {
      mejores.push(idx);
    }
  }

  return elegirAlAzar(mejores, rng);
}
