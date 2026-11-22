import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { LARGO, TAMANO, type Move, type OrdenCaosState, type Player } from './engine';

const TOTAL = TAMANO * TAMANO;
const MAX_JUGADAS = TOTAL * 2;
const TOP_K = 8;
const PROFUNDIDAD_DIFICIL = 3; // raíz + 3 plies = 4 plies totales

const EJES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

// Precomputar todas las ventanas de largo 5 que evalúa `buscarLinea` en engine.ts (32 ventanas).
const VENTANAS: Uint8Array[] = (() => {
  const res: Uint8Array[] = [];
  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      for (const [df, dc] of EJES) {
        const ff = f + df * (LARGO - 1);
        const cc = c + dc * (LARGO - 1);
        if (ff < 0 || ff >= TAMANO || cc < 0 || cc >= TAMANO) continue;
        const celdas = new Uint8Array(LARGO);
        for (let k = 0; k < LARGO; k++) {
          celdas[k] = (f + df * k) * TAMANO + (c + dc * k);
        }
        res.push(celdas);
      }
    }
  }
  return res;
})();

// Ventanas que contienen cada casilla (entre 3 y 7 por casilla).
const CELDA_VENTANAS: Uint8Array[] = Array.from({ length: TOTAL }, (_, cell) => {
  const indices: number[] = [];
  for (let w = 0; w < VENTANAS.length; w++) {
    const win = VENTANAS[w];
    for (let k = 0; k < LARGO; k++) {
      if (win[k] === cell) {
        indices.push(w);
        break;
      }
    }
  }
  return Uint8Array.from(indices);
});

// Tablero interno: 0 = vacío, 1 = 'X', 2 = 'O'
const BOARD_SCRATCH = new Uint8Array(TOTAL);

// Scratches por nivel de profundidad para evitar asignaciones en alfa-beta.
const MAX_LEVELS = PROFUNDIDAD_DIFICIL + 2;
const CAND_CELL = Array.from({ length: MAX_LEVELS }, () => new Uint8Array(MAX_JUGADAS));
const CAND_MARCA = Array.from({ length: MAX_LEVELS }, () => new Uint8Array(MAX_JUGADAS));
const CAND_SCORE = Array.from({ length: MAX_LEVELS }, () => new Int32Array(MAX_JUGADAS));

const BLOCK_O_GEN = new Uint32Array(TOTAL);
const BLOCK_X_GEN = new Uint32Array(TOTAL);
let evalGen = 0;

function toMove(cell: number, marcaCode: number): Move {
  return { cell, marca: marcaCode === 1 ? 'X' : 'O' };
}

function cargarTablero(board: OrdenCaosState['board']): number {
  let vacias = 0;
  for (let i = 0; i < TOTAL; i++) {
    const v = board[i];
    if (v === null) {
      BOARD_SCRATCH[i] = 0;
      vacias++;
    } else {
      BOARD_SCRATCH[i] = v === 'X' ? 1 : 2;
    }
  }
  return vacias;
}

/** Comprueba en O(1) si `cell` recién jugada con `marca` completó 5 en línea. */
function completaCincoTrasColocar(board: Uint8Array, cell: number, marca: number): boolean {
  const wins = CELDA_VENTANAS[cell];
  for (let i = 0; i < wins.length; i++) {
    const win = VENTANAS[wins[i]];
    if (
      board[win[0]] === marca &&
      board[win[1]] === marca &&
      board[win[2]] === marca &&
      board[win[3]] === marca &&
      board[win[4]] === marca
    ) {
      return true;
    }
  }
  return false;
}

/** Comprueba en O(1) si colocar `marca` en `cell` (aún vacía) completa 5 en línea. */
function completaCincoEn(board: Uint8Array, cell: number, marca: number): boolean {
  const wins = CELDA_VENTANAS[cell];
  for (let i = 0; i < wins.length; i++) {
    const win = VENTANAS[wins[i]];
    let ok = true;
    for (let k = 0; k < LARGO; k++) {
      const p = win[k];
      if (p !== cell && board[p] !== marca) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** Comprueba si colocar `marca` en `cell` (aún vacía) bloquea 4 de la marca opuesta. */
function bloqueaCuatroEn(board: Uint8Array, cell: number, marca: number): boolean {
  const otra = marca === 1 ? 2 : 1;
  return completaCincoEn(board, cell, otra);
}

/**
 * Puntúa localmente colocar `marca` (1 o 2) en `cell` vacía para ordenación y 1-ply.
 */
function puntuarJugadaLocal(
  board: Uint8Array,
  cell: number,
  marca: number,
  turno: Player
): number {
  const otra = marca === 1 ? 2 : 1;
  const wins = CELDA_VENTANAS[cell];
  let score = turno === 1 ? wins.length * 2 : wins.length;

  for (let i = 0; i < wins.length; i++) {
    const win = VENTANAS[wins[i]];
    let cSelf = 0;
    let cOther = 0;
    for (let k = 0; k < LARGO; k++) {
      const v = board[win[k]];
      if (v === marca) cSelf++;
      else if (v === otra) cOther++;
    }

    if (cSelf === 4 && cOther === 0) {
      score += turno === 1 ? 1_000_000 : -1_000_000;
    } else if (cOther === 4 && cSelf === 0) {
      score += turno === 2 ? 500_000 : -2_000;
    } else if (cOther === 0) {
      if (turno === 1) {
        if (cSelf === 3) score += 12_000;
        else if (cSelf === 2) score += 1_200;
        else if (cSelf === 1) score += 160;
        else score += 20;
      } else {
        if (cSelf === 3) score -= 20_000;
        else if (cSelf === 2) score -= 1_500;
        else if (cSelf === 1) score -= 80;
        else score -= 5;
      }
    } else if (cSelf === 0) {
      if (turno === 2) {
        if (cOther === 3) score += 4_000;
        else if (cOther === 2) score += 450;
        else score += 60;
      } else {
        if (cOther === 3) score -= 500;
        else if (cOther === 2) score -= 60;
        else score -= 8;
      }
    }
  }

  return score;
}

/**
 * Evaluación estática desde el punto de vista de Orden (> 0 favorece a Orden, < 0 a Caos).
 */
function evaluarOrden(board: Uint8Array, turno: Player): number {
  evalGen++;
  const gen = evalGen;
  let score = 0;
  let scoreX = 0;
  let scoreO = 0;
  let bloqueosNecesarios = 0;

  for (let w = 0; w < VENTANAS.length; w++) {
    const win = VENTANAS[w];
    let cx = 0;
    let co = 0;
    let ultimaVacia = -1;

    for (let k = 0; k < LARGO; k++) {
      const idx = win[k];
      const v = board[idx];
      if (v === 1) cx++;
      else if (v === 2) co++;
      else ultimaVacia = idx;
    }

    if (cx === 5 || co === 5) return 990_000;

    if (cx > 0 && co > 0) {
      // Ventana mixta (muerta): objetivo principal de Caos.
      score -= 80;
      continue;
    }

    if (cx === 4) {
      if (turno === 1) return 900_000;
      if (BLOCK_O_GEN[ultimaVacia] !== gen) {
        BLOCK_O_GEN[ultimaVacia] = gen;
        bloqueosNecesarios++;
      }
      score += 2_200;
      scoreX += 2_200;
    } else if (co === 4) {
      if (turno === 1) return 900_000;
      if (BLOCK_X_GEN[ultimaVacia] !== gen) {
        BLOCK_X_GEN[ultimaVacia] = gen;
        bloqueosNecesarios++;
      }
      score += 2_200;
      scoreO += 2_200;
    } else if (cx === 3) {
      score += 300;
      scoreX += 300;
    } else if (co === 3) {
      score += 300;
      scoreO += 300;
    } else if (cx === 2) {
      score += 45;
      scoreX += 45;
    } else if (co === 2) {
      score += 45;
      scoreO += 45;
    } else if (cx === 1) {
      score += 6;
      scoreX += 6;
    } else if (co === 1) {
      score += 6;
      scoreO += 6;
    } else {
      score += 1;
    }
  }

  if (turno === 2 && bloqueosNecesarios >= 2) {
    return 800_000;
  }

  score += Math.round(Math.max(scoreX, scoreO) * 0.25);
  return score;
}

function generarTopCandidatas(
  board: Uint8Array,
  turno: Player,
  level: number,
  limite: number
): number {
  const cells = CAND_CELL[level];
  const marcas = CAND_MARCA[level];
  const scores = CAND_SCORE[level];
  let n = 0;

  for (let cell = 0; cell < TOTAL; cell++) {
    if (board[cell] !== 0) continue;
    for (let marca = 1; marca <= 2; marca++) {
      cells[n] = cell;
      marcas[n] = marca;
      scores[n] = puntuarJugadaLocal(board, cell, marca, turno);
      n++;
    }
  }

  const kMax = Math.min(limite, n);
  for (let i = 0; i < kMax; i++) {
    let bestPos = i;
    let bestVal = scores[i];
    for (let j = i + 1; j < n; j++) {
      if (scores[j] > bestVal) {
        bestVal = scores[j];
        bestPos = j;
      }
    }
    if (bestPos !== i) {
      const tc = cells[i];
      const tm = marcas[i];
      const ts = scores[i];
      cells[i] = cells[bestPos];
      marcas[i] = marcas[bestPos];
      scores[i] = scores[bestPos];
      cells[bestPos] = tc;
      marcas[bestPos] = tm;
      scores[bestPos] = ts;
    }
  }

  return kMax;
}

function alphabeta(
  board: Uint8Array,
  profundidad: number,
  alpha: number,
  beta: number,
  turno: Player,
  vacias: number
): number {
  if (vacias === 0) return -990_000;
  if (profundidad === 0) return evaluarOrden(board, turno);

  const level = profundidad;
  const limite = profundidad >= 2 ? 6 : 5;
  const k = generarTopCandidatas(board, turno, level, limite);
  const cells = CAND_CELL[level];
  const marcas = CAND_MARCA[level];
  const scores = CAND_SCORE[level];

  if (turno === 1 && scores[0] >= 900_000) {
    return 990_000 + profundidad;
  }

  const siguiente: Player = turno === 1 ? 2 : 1;

  if (turno === 1) {
    let mejor = -Infinity;
    for (let i = 0; i < k; i++) {
      const cell = cells[i];
      const marca = marcas[i];
      board[cell] = marca;
      const valor = completaCincoTrasColocar(board, cell, marca)
        ? 990_000 + profundidad
        : alphabeta(board, profundidad - 1, alpha, beta, siguiente, vacias - 1);
      board[cell] = 0;
      if (valor > mejor) mejor = valor;
      if (valor > alpha) alpha = valor;
      if (alpha >= beta) break;
    }
    return mejor;
  }

  const limiteCaos = scores[0] >= 400_000 ? Math.min(k, 2) : k;
  let mejor = Infinity;
  for (let i = 0; i < limiteCaos; i++) {
    const cell = cells[i];
    const marca = marcas[i];
    board[cell] = marca;
    const valor = completaCincoTrasColocar(board, cell, marca)
      ? 990_000 + profundidad
      : alphabeta(board, profundidad - 1, alpha, beta, siguiente, vacias - 1);
    board[cell] = 0;
    if (valor < mejor) mejor = valor;
    if (valor < beta) beta = valor;
    if (alpha >= beta) break;
  }
  return mejor;
}

function elegirFacil(board: Uint8Array, turno: Player, rng: Rng): Move {
  const todas: Move[] = [];
  const urgentes: Move[] = [];

  for (let cell = 0; cell < TOTAL; cell++) {
    if (board[cell] !== 0) continue;
    for (let marca = 1; marca <= 2; marca++) {
      const mov = toMove(cell, marca);
      todas.push(mov);
      if (turno === 1) {
        if (completaCincoEn(board, cell, marca)) urgentes.push(mov);
      } else if (bloqueaCuatroEn(board, cell, marca) && !completaCincoEn(board, cell, marca)) {
        urgentes.push(mov);
      }
    }
  }

  if (urgentes.length > 0 && (todas.length === urgentes.length || rng() < 0.35)) {
    return elegirAlAzar(urgentes, rng);
  }

  const esUrgente = new Set(urgentes.map(m => `${m.cell}:${m.marca}`));
  const pool =
    urgentes.length > 0 ? todas.filter(m => !esUrgente.has(`${m.cell}:${m.marca}`)) : todas;
  return elegirAlAzar(pool.length > 0 ? pool : todas, rng);
}

function elegirMedio(board: Uint8Array, turno: Player, rng: Rng): Move {
  const candidatas: { move: Move; score: number }[] = [];

  for (let cell = 0; cell < TOTAL; cell++) {
    if (board[cell] !== 0) continue;
    for (let marca = 1; marca <= 2; marca++) {
      candidatas.push({
        move: toMove(cell, marca),
        score: puntuarJugadaLocal(board, cell, marca, turno),
      });
    }
  }

  candidatas.sort((a, b) => b.score - a.score);
  const mejorScore = candidatas[0].score;

  // En jugadas tácticas urgentes (ganar en 1, bloquear 4, neutralizar 3), tomar las empatadas en la cima.
  const esTacticaUrgente =
    (turno === 1 && mejorScore >= 10_000) || (turno === 2 && mejorScore >= 3_500);

  if (esTacticaUrgente) {
    const empatadas = candidatas.filter(c => c.score === mejorScore).map(c => c.move);
    return elegirAlAzar(empatadas, rng);
  }

  // En jugadas posicionales tranquilas (1-ply), variar entre las mejores 3.
  const top = candidatas.slice(0, Math.min(3, candidatas.length)).map(c => c.move);
  return elegirAlAzar(top, rng);
}

function elegirDificil(board: Uint8Array, turno: Player, vacias: number, rng: Rng): Move {
  // Victoria inmediata en 1 para Orden
  if (turno === 1) {
    const ganadoras: Move[] = [];
    for (let cell = 0; cell < TOTAL; cell++) {
      if (board[cell] !== 0) continue;
      for (let marca = 1; marca <= 2; marca++) {
        if (completaCincoEn(board, cell, marca)) ganadoras.push(toMove(cell, marca));
      }
    }
    if (ganadoras.length > 0) return elegirAlAzar(ganadoras, rng);
  }

  const rootLevel = MAX_LEVELS - 1;
  const k = generarTopCandidatas(board, turno, rootLevel, TOP_K);
  const cells = CAND_CELL[rootLevel];
  const marcas = CAND_MARCA[rootLevel];
  const scores = CAND_SCORE[rootLevel];

  if (turno === 2 && scores[0] >= 400_000 && (k === 1 || scores[1] < 400_000)) {
    return toMove(cells[0], marcas[0]);
  }

  const profundidad = vacias <= 26 ? PROFUNDIDAD_DIFICIL : 2;
  const siguiente: Player = turno === 1 ? 2 : 1;

  let mejorValor = turno === 1 ? -Infinity : Infinity;
  let mejores: Move[] = [];

  for (let i = 0; i < k; i++) {
    const cell = cells[i];
    const marca = marcas[i];
    board[cell] = marca;
    let valor: number;
    if (completaCincoTrasColocar(board, cell, marca)) {
      valor = 990_000 + profundidad + 1;
    } else if (turno === 1) {
      const alpha = mejorValor === -Infinity ? -Infinity : mejorValor - 1;
      valor = alphabeta(board, profundidad, alpha, Infinity, siguiente, vacias - 1);
    } else {
      const beta = mejorValor === Infinity ? Infinity : mejorValor + 1;
      valor = alphabeta(board, profundidad, -Infinity, beta, siguiente, vacias - 1);
    }
    board[cell] = 0;

    if (turno === 1) {
      if (valor > mejorValor) {
        mejorValor = valor;
        mejores = [toMove(cell, marca)];
      } else if (valor === mejorValor) {
        mejores.push(toMove(cell, marca));
      }
    } else {
      if (valor < mejorValor) {
        mejorValor = valor;
        mejores = [toMove(cell, marca)];
      } else if (valor === mejorValor) {
        mejores.push(toMove(cell, marca));
      }
    }
  }

  return elegirAlAzar(mejores, rng);
}

/**
 * Elige la siguiente jugada `(cell, marca)` del bot de Orden y Caos según la dificultad.
 */
export function elegirMovimiento(
  state: OrdenCaosState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): Move {
  const vacias = cargarTablero(state.board);
  if (vacias === 0) return { cell: 0, marca: 'X' };

  if (dificultad === 'facil') return elegirFacil(BOARD_SCRATCH, state.currentPlayer, rng);
  if (dificultad === 'medio') return elegirMedio(BOARD_SCRATCH, state.currentPlayer, rng);
  return elegirDificil(BOARD_SCRATCH, state.currentPlayer, vacias, rng);
}
