import { MAPAS, adyacentesDe } from './maps';

export type Player = 1 | 2;
export type RegionColor = 0 | 1 | 2; // 0 = sin color
export type Fase = 'seleccion' | 'jugando' | 'terminado';

export type ColMove =
  | { tipo: 'mapa'; mapaId: number }
  | { tipo: 'color'; region: number };

export interface ColState {
  mapaId: number | null;
  fase: Fase;
  colores: RegionColor[];
  currentPlayer: Player;
  jugadorInicial: Player;
  status: 'playing' | 'won';
  winner: Player | null;
  lastMove: number | null;
}

export function createInitialState(jugadorInicial: Player = 1): ColState {
  return {
    mapaId: null,
    fase: 'seleccion',
    colores: [],
    currentPlayer: jugadorInicial,
    jugadorInicial,
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

const otro = (p: Player): Player => (p === 1 ? 2 : 1);

export function esJugadaValida(payload: unknown): payload is ColMove {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return false;
  }
  const p = payload as Record<string, unknown>;
  if (p.tipo === 'mapa') {
    return (
      typeof p.mapaId === 'number' &&
      Number.isInteger(p.mapaId) &&
      p.mapaId >= 0 &&
      p.mapaId < MAPAS.length
    );
  }
  if (p.tipo === 'color') {
    return typeof p.region === 'number' && Number.isInteger(p.region) && p.region >= 0;
  }
  return false;
}

export function regionesLegales(state: ColState, player: Player): number[] {
  if (state.fase !== 'jugando' || state.mapaId === null) return [];
  const mapa = MAPAS[state.mapaId];
  const res: number[] = [];
  for (const region of mapa.regiones) {
    if (state.colores[region.id] !== 0) continue;
    const tocaMiColor = adyacentesDe(mapa, region.id).some(
      v => state.colores[v] === player
    );
    if (!tocaMiColor) res.push(region.id);
  }
  return res;
}

export function playMove(state: ColState, move: ColMove): ColState {
  if (state.status !== 'playing') return state;
  if (!esJugadaValida(move)) return state;

  if (move.tipo === 'mapa') {
    if (state.fase !== 'seleccion') return state;
    const mapa = MAPAS[move.mapaId];
    if (!mapa) return state;
    return {
      ...state,
      mapaId: move.mapaId,
      fase: 'jugando',
      colores: Array(mapa.regiones.length).fill(0) as RegionColor[],
      lastMove: null,
    };
  }

  // move.tipo === 'color'
  if (state.fase !== 'jugando' || state.mapaId === null) return state;
  const mapa = MAPAS[state.mapaId];
  if (move.region >= mapa.regiones.length) return state;
  if (!regionesLegales(state, state.currentPlayer).includes(move.region)) {
    return state;
  }

  const colores = [...state.colores];
  colores[move.region] = state.currentPlayer;
  const siguiente: ColState = {
    ...state,
    colores,
    lastMove: move.region,
  };

  const rival = otro(state.currentPlayer);
  if (regionesLegales(siguiente, rival).length === 0) {
    return {
      ...siguiente,
      status: 'won',
      winner: state.currentPlayer,
      fase: 'terminado',
    };
  }

  return { ...siguiente, currentPlayer: rival };
}

export { otro };
