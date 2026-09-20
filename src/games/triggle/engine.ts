export type TrigglePlayer = 1 | 2;
export type Direccion = 'H' | 'D1' | 'D2';

/**
 * Jugada: punto de partida en coordenadas axiales `(q, r)` sobre el hexágono
 * de puntos (radio 3) más una de las 3 direcciones. Cubre 4 puntos colineales.
 * - H  : +q        → (q,r) (q+1,r) (q+2,r) (q+3,r)
 * - D1 : +r        → (q,r) (q,r+1) (q,r+2) (q,r+3)
 * - D2 : +(1,-1)   → (q,r) (q+1,r-1) (q+2,r-2) (q+3,r-3)
 */
export interface Move {
  q: number;
  r: number;
  dir: Direccion;
}

export interface TriggleState {
  /** Aristas unitarias activas: clave `"<dir>:q,r"` → jugador que la trazó primero. */
  edges: Record<string, TrigglePlayer>;
  /** Puntos ya tocados por alguna arista: clave `"q,r"`. */
  touched: Record<string, true>;
  /** Dueño de cada triángulo, alineado con `TRIANGULOS`. */
  triangleOwners: (TrigglePlayer | null)[];
  currentPlayer: TrigglePlayer;
  scores: Record<TrigglePlayer, number>;
  status: 'playing' | 'finished';
  winner: TrigglePlayer | null;
  lastMove: Move | null;
  jugadaCount: number;
}

export const RADIO = 3;

export interface Punto {
  q: number;
  r: number;
}

export function puntoEnTablero(q: number, r: number): boolean {
  return (
    Number.isInteger(q) &&
    Number.isInteger(r) &&
    Math.abs(q) <= RADIO &&
    Math.abs(r) <= RADIO &&
    Math.abs(q + r) <= RADIO
  );
}

/** Los 37 puntos del hexágono, orden estable (por r y luego q). */
export function puntosValidos(): Punto[] {
  const puntos: Punto[] = [];
  for (let r = -RADIO; r <= RADIO; r++) {
    for (let q = -RADIO; q <= RADIO; q++) {
      if (puntoEnTablero(q, r)) puntos.push({ q, r });
    }
  }
  return puntos;
}

const PASO: Record<Direccion, Punto> = {
  H: { q: 1, r: 0 },
  D1: { q: 0, r: 1 },
  D2: { q: 1, r: -1 },
};

export type AristaRef = { dir: Direccion; q: number; r: number };

function claveArista(a: AristaRef): string {
  return `${a.dir}:${a.q},${a.r}`;
}

function clavePunto(p: Punto): string {
  return `${p.q},${p.r}`;
}

/** Los 4 puntos colineales que abarca la jugada. */
export function puntosDe(move: Move): Punto[] {
  const paso = PASO[move.dir];
  return [0, 1, 2, 3].map(k => ({ q: move.q + paso.q * k, r: move.r + paso.r * k }));
}

/** Las 3 aristas unitarias que activa la jugada. */
export function aristasDe(move: Move): AristaRef[] {
  const paso = PASO[move.dir];
  return [0, 1, 2].map(k => ({
    dir: move.dir,
    q: move.q + paso.q * k,
    r: move.r + paso.r * k,
  }));
}

/** Una arista existe si sus dos extremos están en el tablero. */
function aristaEnTablero(a: AristaRef): boolean {
  const paso = PASO[a.dir];
  return (
    puntoEnTablero(a.q, a.r) && puntoEnTablero(a.q + paso.q, a.r + paso.r)
  );
}

type Triangulo = { aristas: [AristaRef, AristaRef, AristaRef] };

/** Lista estable de los 54 triángulos unitarios y sus 3 aristas. */
export const TRIANGULOS: Triangulo[] = (() => {
  const lista: Triangulo[] = [];
  const vistos = new Set<string>();

  for (let r = -RADIO - 1; r <= RADIO; r++) {
    for (let q = -RADIO - 1; q <= RADIO; q++) {
      // △ : vértices (q,r) (q+1,r) (q,r+1)
      const arriba: [AristaRef, AristaRef, AristaRef] = [
        { dir: 'H', q, r },
        { dir: 'D1', q, r },
        { dir: 'D2', q, r: r + 1 },
      ];
      // ▽ : vértices (q+1,r) (q,r+1) (q+1,r+1)
      const abajo: [AristaRef, AristaRef, AristaRef] = [
        { dir: 'D1', q: q + 1, r },
        { dir: 'H', q, r: r + 1 },
        { dir: 'D2', q, r: r + 1 },
      ];

      for (const aristas of [arriba, abajo]) {
        if (!aristas.every(aristaEnTablero)) continue;
        const clave = aristas.map(claveArista).sort().join('|');
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        lista.push({ aristas });
      }
    }
  }

  return lista;
})();

export const TOTAL_TRIANGULOS = TRIANGULOS.length;

/** Todas las aristas unitarias del tablero (ambos extremos dentro). */
export function aristasValidas(): AristaRef[]  {
  const lista: AristaRef[] = [];
  for (const { q, r } of puntosValidos()) {
    for (const dir of ['H', 'D1', 'D2'] as Direccion[]) {
      const a: AristaRef = { dir, q, r };
      if (aristaEnTablero(a)) lista.push(a);
    }
  }
  return lista;
}

/** El segundo extremo de una arista (el primero es `(a.q, a.r)`). */
export function otroExtremo(a: AristaRef): Punto {
  const paso = PASO[a.dir];
  return { q: a.q + paso.q, r: a.r + paso.r };
}

export function claveDeArista(a: AristaRef): string {
  return claveArista(a);
}

/** Los 3 vértices de cada triángulo, alineado con `TRIANGULOS`. */
export function verticesDeTriangulos(): [Punto, Punto, Punto][] {
  return TRIANGULOS.map(t => {
    const puntos: Punto[] = [];
    for (const a of t.aristas) {
      for (const p of [{ q: a.q, r: a.r }, otroExtremo(a)]) {
        if (!puntos.some(x => x.q === p.q && x.r === p.r)) puntos.push(p);
      }
    }
    return puntos as unknown as [Punto, Punto, Punto];
  });
}

export function createInitialState(): TriggleState {
  return {
    edges: {},
    touched: {},
    triangleOwners: Array(TOTAL_TRIANGULOS).fill(null),
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
    winner: null,
    lastMove: null,
    jugadaCount: 0,
  };
}

export function esMove(payload: unknown): payload is Move {
  if (typeof payload !== 'object' || payload === null) return false;
  const c = payload as Record<string, unknown>;
  return (
    (c.dir === 'H' || c.dir === 'D1' || c.dir === 'D2') &&
    typeof c.q === 'number' &&
    Number.isInteger(c.q) &&
    typeof c.r === 'number' &&
    Number.isInteger(c.r)
  );
}

export function esJugadaValida(state: TriggleState, move: Move): boolean {
  if (state.status !== 'playing') return false;
  if (!esMove(move)) return false;

  const puntos = puntosDe(move);
  if (!puntos.every(p => puntoEnTablero(p.q, p.r))) return false;

  const aristas = aristasDe(move);
  // No duplicar: si las 3 aristas ya están activas, la jugada no aporta nada.
  // Un poco más estricto que la regla literal del doc (que solo prohíbe
  // repetir una línea idéntica): también rechaza rehacer una línea cuyas 3
  // aristas quedaron cubiertas por 3 jugadas distintas. Es lo correcto —el
  // movimiento no añade nada— y además garantiza que la partida termina.
  if (aristas.every(a => state.edges[claveArista(a)] !== undefined)) return false;

  // Conexión: desde la 2.ª jugada, un punto debe coincidir con alguno ya
  // tocado por una línea existente.
  if (state.jugadaCount > 0 && !puntos.some(p => state.touched[clavePunto(p)])) {
    return false;
  }

  return true;
}

/**
 * Traduce dos puntos tocados a la jugada canónica que los une, o `null` si no
 * forman una línea recta de 4 puntos en una de las 3 direcciones. Único
 * constructor de `Move` en la UI: así el objeto siempre tiene el mismo orden
 * de claves y el hash del registro remoto coincide entre pares.
 */
export function moveEntrePuntos(a: Punto, b: Punto): Move | null {
  const dq = b.q - a.q;
  const dr = b.r - a.r;

  if (dr === 0 && Math.abs(dq) === 3) {
    return { q: Math.min(a.q, b.q), r: a.r, dir: 'H' };
  }
  if (dq === 0 && Math.abs(dr) === 3) {
    return { q: a.q, r: Math.min(a.r, b.r), dir: 'D1' };
  }
  if (dq === -dr && Math.abs(dq) === 3) {
    // start = extremo con menor q (⇒ mayor r) para el eje +(1,-1)
    return dq > 0 ? { q: a.q, r: a.r, dir: 'D2' } : { q: b.q, r: b.r, dir: 'D2' };
  }
  return null;
}

function candidatos(): Move[] {
  const movs: Move[] = [];
  for (const { q, r } of puntosValidos()) {
    movs.push({ q, r, dir: 'H' }, { q, r, dir: 'D1' }, { q, r, dir: 'D2' });
  }
  return movs;
}

export function movimientosValidos(state: TriggleState): Move[] {
  if (state.status !== 'playing') return [];
  return candidatos().filter(m => esJugadaValida(state, m));
}

function trianguloCompleto(edges: Record<string, TrigglePlayer>, t: Triangulo): boolean {
  return t.aristas.every(a => edges[claveArista(a)] !== undefined);
}

export function contarTriangulos(state: TriggleState): Record<TrigglePlayer, number> {
  const conteo: Record<TrigglePlayer, number> = { 1: 0, 2: 0 };
  for (const owner of state.triangleOwners) {
    if (owner !== null) conteo[owner] += 1;
  }
  return conteo;
}

export function playMove(state: TriggleState, move: Move): TriggleState {
  if (!esJugadaValida(state, move)) return state;

  const jugador = state.currentPlayer;
  const edges = { ...state.edges };
  const touched = { ...state.touched };
  const triangleOwners = [...state.triangleOwners];
  const scores = { ...state.scores };

  for (const a of aristasDe(move)) {
    const clave = claveArista(a);
    if (edges[clave] === undefined) edges[clave] = jugador;
  }
  for (const p of puntosDe(move)) touched[clavePunto(p)] = true;

  for (let t = 0; t < TRIANGULOS.length; t++) {
    if (triangleOwners[t] === null && trianguloCompleto(edges, TRIANGULOS[t])) {
      triangleOwners[t] = jugador;
      scores[jugador] += 1;
    }
  }

  const next: TriggleState = {
    edges,
    touched,
    triangleOwners,
    currentPlayer: jugador === 1 ? 2 : 1, // el turno pasa siempre
    scores,
    status: 'playing',
    winner: null,
    lastMove: move,
    jugadaCount: state.jugadaCount + 1,
  };

  if (movimientosValidos(next).length === 0) {
    next.status = 'finished';
    next.winner = scores[1] > scores[2] ? 1 : scores[2] > scores[1] ? 2 : null;
  }

  return next;
}
