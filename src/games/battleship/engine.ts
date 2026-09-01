export type Player = 1 | 2;
export type Fase = 'colocacion' | 'disparos' | 'finished';
export type Resultado = 'agua' | 'tocado' | 'hundido';

export type Move =
  | { tipo: 'flota'; barcos: number[][] }
  | { tipo: 'disparo'; celda: number };

export interface BattleshipState {
  fase: Fase;
  currentPlayer: Player;
  flotas: Record<Player, number[][] | null>;
  disparos: Record<Player, (Resultado | null)[]>;
  winner: Player | null;
  ultimoDisparo: { por: Player; celda: number; resultado: Resultado } | null;
}

export const TAMANO = 8;
export const FLOTA = [4, 3, 3, 2] as const;
const TOTAL = TAMANO * TAMANO;

export function createInitialState(): BattleshipState {
  return {
    fase: 'colocacion',
    currentPlayer: 1,
    flotas: { 1: null, 2: null },
    disparos: {
      1: Array<Resultado | null>(TOTAL).fill(null),
      2: Array<Resultado | null>(TOTAL).fill(null),
    },
    winner: null,
    ultimoDisparo: null,
  };
}

const esEnteroEnRango = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < TOTAL;

/**
 * ¿Los índices `s` (ya ordenados asc.) forman un barco recto y contiguo dentro
 * del tablero? Horizontal = misma fila e índices consecutivos; vertical = misma
 * columna e índices separados por `TAMANO`. La condición de "misma fila/columna"
 * descarta el envolvimiento de borde.
 */
function esBarcoRecto(s: number[]): boolean {
  const n = s.length;
  if (n < 2) return false; // FLOTA no tiene barcos de longitud < 2
  const filaBase = Math.floor(s[0] / TAMANO);
  const horizontal = s.every(
    (c, k) => Math.floor(c / TAMANO) === filaBase && c === s[0] + k,
  );
  const colBase = s[0] % TAMANO;
  const vertical = s.every(
    (c, k) => c % TAMANO === colBase && c === s[0] + k * TAMANO,
  );
  return horizontal || vertical;
}

export function esColocacionValida(barcos: unknown): boolean {
  if (!Array.isArray(barcos) || barcos.length !== FLOTA.length) return false;

  const ocupadas = new Set<number>();
  const longitudes: number[] = [];

  for (const barco of barcos) {
    if (!Array.isArray(barco) || !barco.every(esEnteroEnRango)) return false;
    const s = [...barco].sort((a, b) => a - b);
    if (new Set(s).size !== s.length) return false; // celdas repetidas dentro del barco
    if (!esBarcoRecto(s)) return false;
    for (const c of s) {
      if (ocupadas.has(c)) return false; // solape entre barcos
      ocupadas.add(c);
    }
    longitudes.push(s.length);
  }

  const esperadas = [...FLOTA].sort((a, b) => a - b);
  return longitudes.sort((a, b) => a - b).every((l, i) => l === esperadas[i]);
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  if (p.tipo === 'disparo') return esEnteroEnRango(p.celda);
  if (p.tipo === 'flota') return esColocacionValida(p.barcos);
  return false;
}

/**
 * Reparte una flota 4/3/3/2 al azar: barcos rectos, dentro del tablero, sin
 * solaparse (tocarse permitido). IMPURA: usa `Math.random`. Solo debe llamarse
 * desde el handler del botón "Barajar" — su salida viaja en el payload
 * `{tipo:'flota', barcos}` y nunca se re-genera en el receptor.
 */
export function generarFlotaAleatoria(): number[][] {
  for (;;) {
    const ocupadas = new Set<number>();
    const barcos: number[][] = [];
    let completo = true;

    for (const long of FLOTA) {
      let elegido: number[] | null = null;
      for (let intento = 0; intento < 200 && elegido === null; intento++) {
        const horizontal = Math.random() < 0.5;
        const filas = horizontal ? TAMANO : TAMANO - long + 1;
        const cols = horizontal ? TAMANO - long + 1 : TAMANO;
        const fila = Math.floor(Math.random() * filas);
        const col = Math.floor(Math.random() * cols);
        const celdas = Array.from({ length: long }, (_, k) =>
          horizontal ? fila * TAMANO + col + k : (fila + k) * TAMANO + col,
        );
        if (celdas.some(c => ocupadas.has(c))) continue;
        elegido = celdas;
      }
      if (elegido === null) {
        completo = false;
        break;
      }
      elegido.forEach(c => ocupadas.add(c));
      barcos.push(elegido);
    }

    if (completo) return barcos;
  }
}

export function barcosAFlote(state: BattleshipState, player: Player): number {
  const flota = state.flotas[player];
  if (flota === null) return FLOTA.length;
  const rival: Player = player === 1 ? 2 : 1;
  const tirosDelRival = state.disparos[rival]; // disparos del rival sobre `player`
  return flota.filter(barco => barco.some(c => tirosDelRival[c] === null)).length;
}
