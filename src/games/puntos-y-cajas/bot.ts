import { elegirAlAzar, type Dificultad, type Rng } from '../../lib/bot/tipos';
import { playLine, type LineId, type PuntosYCajasState } from './engine';

const TOTAL_LINEAS_4 = 24;
const UMBRAL_FIN_EXACTO = 12;

// Para size=4 (9 cajas, 24 líneas): índice 0..11 = H(r*3+c), 12..23 = V(12+r*4+c).
const LINEAS_4: LineId[] = (() => {
  const lista: LineId[] = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) lista.push({ type: 'h', row: r, col: c });
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) lista.push({ type: 'v', row: r, col: c });
  }
  return lista;
})();

const CAJAS_DE_LINEA_4: number[][] = LINEAS_4.map(l => {
  const cajas: number[] = [];
  if (l.type === 'h') {
    if (l.row > 0) cajas.push((l.row - 1) * 3 + l.col);
    if (l.row < 3) cajas.push(l.row * 3 + l.col);
  } else {
    if (l.col > 0) cajas.push(l.row * 3 + (l.col - 1));
    if (l.col < 3) cajas.push(l.row * 3 + l.col);
  }
  return cajas;
});

const LINEAS_DE_CAJA_4: number[][] = Array.from({ length: 9 }, (_, boxIdx) => {
  const r = Math.floor(boxIdx / 3);
  const c = boxIdx % 3;
  return [
    r * 3 + c, // top
    (r + 1) * 3 + c, // bottom
    12 + r * 4 + c, // left
    12 + r * 4 + (c + 1), // right
  ];
});

function obtenerLineasLibres(state: PuntosYCajasState): LineId[] {
  const libres: LineId[] = [];
  for (let r = 0; r < state.size; r++) {
    for (let c = 0; c < state.size - 1; c++) {
      if (!state.horizontalLines[r][c]) libres.push({ type: 'h', row: r, col: c });
    }
  }
  for (let r = 0; r < state.size - 1; r++) {
    for (let c = 0; c < state.size; c++) {
      if (!state.verticalLines[r][c]) libres.push({ type: 'v', row: r, col: c });
    }
  }
  return libres;
}

function ladosTrazadosCaja(state: PuntosYCajasState, row: number, col: number): number {
  let lados = 0;
  if (state.horizontalLines[row][col]) lados++;
  if (state.horizontalLines[row + 1][col]) lados++;
  if (state.verticalLines[row][col]) lados++;
  if (state.verticalLines[row][col + 1]) lados++;
  return lados;
}

function cajasAdyacentes(state: PuntosYCajasState, line: LineId): Array<[number, number]> {
  const maxCaja = state.size - 1;
  const cajas: Array<[number, number]> = [];
  if (line.type === 'h') {
    if (line.row - 1 >= 0) cajas.push([line.row - 1, line.col]);
    if (line.row < maxCaja) cajas.push([line.row, line.col]);
  } else {
    if (line.col - 1 >= 0) cajas.push([line.row, line.col - 1]);
    if (line.col < maxCaja) cajas.push([line.row, line.col]);
  }
  return cajas;
}

function clasificarLineas(state: PuntosYCajasState, libres: readonly LineId[]) {
  const cierran: LineId[] = [];
  const seguras: LineId[] = [];
  const sacrificios: LineId[] = [];

  for (const l of libres) {
    const grados = cajasAdyacentes(state, l).map(([r, c]) => ladosTrazadosCaja(state, r, c));
    if (grados.some(g => g === 3)) {
      cierran.push(l);
    } else if (grados.some(g => g === 2)) {
      sacrificios.push(l);
    } else {
      seguras.push(l);
    }
  }

  return { cierran, seguras, sacrificios };
}

function tamanoCadenaRegalada(state: PuntosYCajasState, sacrificio: LineId): number {
  let s = playLine(state, sacrificio);
  const jugadorInicial = state.currentPlayer;
  if (s.status !== 'playing' || s.currentPlayer === jugadorInicial) return 0;

  let regaladas = 0;
  while (s.status === 'playing' && s.currentPlayer !== jugadorInicial) {
    const { cierran } = clasificarLineas(s, obtenerLineasLibres(s));
    if (cierran.length === 0) break;
    const prev = s.scores[1] + s.scores[2];
    s = playLine(s, cierran[0]);
    regaladas += s.scores[1] + s.scores[2] - prev;
  }
  return regaladas;
}

function maskDeEstado4(state: PuntosYCajasState): number {
  let mask = 0;
  let i = 0;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      if (state.horizontalLines[r][c]) mask |= 1 << i;
      i++;
    }
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (state.verticalLines[r][c]) mask |= 1 << i;
      i++;
    }
  }
  return mask;
}

function ladosMaskCaja(mask: number, boxIdx: number): number {
  let lados = 0;
  for (const lineIdx of LINEAS_DE_CAJA_4[boxIdx]) {
    if ((mask & (1 << lineIdx)) !== 0) lados++;
  }
  return lados;
}

function cajasCompletadasAlTrazar(mask: number, lineIdx: number): number {
  let cerradas = 0;
  for (const boxIdx of CAJAS_DE_LINEA_4[lineIdx]) {
    if (ladosMaskCaja(mask, boxIdx) === 3) cerradas++;
  }
  return cerradas;
}

interface EntradaMemo {
  valor: number;
  tipo: 'EXACT' | 'LOWER' | 'UPPER';
}

function negamax4(
  mask: number,
  alpha: number,
  beta: number,
  memo: Map<number, EntradaMemo>
): number {
  if (mask === (1 << TOTAL_LINEAS_4) - 1) return 0;

  const alphaOrig = alpha;
  const hit = memo.get(mask);
  if (hit) {
    if (hit.tipo === 'EXACT') return hit.valor;
    if (hit.tipo === 'LOWER' && hit.valor > alpha) alpha = hit.valor;
    else if (hit.tipo === 'UPPER' && hit.valor < beta) beta = hit.valor;
    if (alpha >= beta) return hit.valor;
  }

  // Ordenar: primero las que cierran caja, luego el resto.
  const cierres: number[] = [];
  const otras: number[] = [];
  for (let i = 0; i < TOTAL_LINEAS_4; i++) {
    if ((mask & (1 << i)) !== 0) continue;
    if (cajasCompletadasAlTrazar(mask, i) > 0) cierres.push(i);
    else otras.push(i);
  }
  const ordenadas = cierres.length > 0 ? [...cierres, ...otras] : otras;

  let mejor = -Infinity;
  for (const i of ordenadas) {
    const cerradas = cajasCompletadasAlTrazar(mask, i);
    const nextMask = mask | (1 << i);
    const valor =
      cerradas > 0
        ? cerradas + negamax4(nextMask, alpha - cerradas, beta - cerradas, memo)
        : -negamax4(nextMask, -beta, -alpha, memo);

    if (valor > mejor) mejor = valor;
    if (valor > alpha) alpha = valor;
    if (alpha >= beta) break;
  }

  memo.set(mask, {
    valor: mejor,
    tipo: mejor <= alphaOrig ? 'UPPER' : mejor >= beta ? 'LOWER' : 'EXACT',
  });
  return mejor;
}

function elegirEndgame4(mask: number, rng: Rng): LineId {
  const memo = new Map<number, EntradaMemo>();
  let mejor = -Infinity;
  let mejores: number[] = [];

  for (let i = 0; i < TOTAL_LINEAS_4; i++) {
    if ((mask & (1 << i)) !== 0) continue;
    const cerradas = cajasCompletadasAlTrazar(mask, i);
    const nextMask = mask | (1 << i);
    const valor =
      cerradas > 0
        ? cerradas + negamax4(nextMask, -100, 100, memo)
        : -negamax4(nextMask, -100, 100, memo);

    if (valor > mejor) {
      mejor = valor;
      mejores = [i];
    } else if (valor === mejor) {
      mejores.push(i);
    }
  }

  return LINEAS_4[elegirAlAzar(mejores, rng)];
}

/**
 * Elige la siguiente línea a trazar para el bot de Puntos y cajas según la dificultad.
 */
export function elegirMovimiento(
  state: PuntosYCajasState,
  dificultad: Dificultad,
  rng: Rng = Math.random
): LineId {
  const libres = obtenerLineasLibres(state);
  if (libres.length === 0) return { type: 'h', row: 0, col: 0 };

  const { cierran, seguras, sacrificios } = clasificarLineas(state, libres);

  if (dificultad === 'facil') {
    if (cierran.length > 0 && rng() < 0.15) {
      return elegirAlAzar(cierran, rng);
    }
    return elegirAlAzar(libres, rng);
  }

  if (dificultad === 'medio') {
    if (cierran.length > 0) return elegirAlAzar(cierran, rng);
    if (seguras.length > 0) return elegirAlAzar(seguras, rng);
    return elegirAlAzar(sacrificios, rng);
  }

  if (state.size === 4 && libres.length <= UMBRAL_FIN_EXACTO) {
    return elegirEndgame4(maskDeEstado4(state), rng);
  }

  if (cierran.length > 0) return elegirAlAzar(cierran, rng);

  if (seguras.length > 0) {
    // Preferir líneas seguras que menos cajas dejan con 1 lado previo (para no construir cadenas).
    let mejorSuma = Infinity;
    let candidatas: LineId[] = [];
    for (const l of seguras) {
      const suma = cajasAdyacentes(state, l).reduce(
        (acc, [r, c]) => acc + ladosTrazadosCaja(state, r, c),
        0
      );
      if (suma < mejorSuma) {
        mejorSuma = suma;
        candidatas = [l];
      } else if (suma === mejorSuma) {
        candidatas.push(l);
      }
    }
    return elegirAlAzar(candidatas, rng);
  }

  let menorRegalo = Infinity;
  let mejoresSacrificios: LineId[] = [];
  for (const s of sacrificios) {
    const regalo = tamanoCadenaRegalada(state, s);
    if (regalo < menorRegalo) {
      menorRegalo = regalo;
      mejoresSacrificios = [s];
    } else if (regalo === menorRegalo) {
      mejoresSacrificios.push(s);
    }
  }
  return elegirAlAzar(mejoresSacrificios, rng);
}
