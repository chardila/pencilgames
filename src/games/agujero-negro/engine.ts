export const TOTAL_POSITIONS = 21;
export const TOTAL_ROWS = 6;
export const MAX_VALUE = 10;

export interface Cell {
  id: number;
  row: number;
  column: number;
  player: 1 | 2 | null;
  value: number | null;
}

export type AgujeroNegroStatus = 'playing' | 'finished';

export interface AgujeroNegroState {
  cells: Cell[];
  currentPlayer: 1 | 2;
  nextValue: Record<1 | 2, number>;
  status: AgujeroNegroStatus;
  blackHole: number | null;
  destroyedCells: number[];
  scores: Record<1 | 2, number>;
}

function rowStart(row: number): number {
  return (row * (row + 1)) / 2;
}

export function rowOf(id: number): number {
  let row = 0;
  while (rowStart(row + 1) <= id) row++;
  return row;
}

export function columnOf(id: number): number {
  return id - rowStart(rowOf(id));
}

export function cellId(row: number, column: number): number {
  return rowStart(row) + column;
}

export function getNeighbors(idParaVecinos: number): number[] {
  const row = rowOf(idParaVecinos);
  const col = columnOf(idParaVecinos);
  const neighbors: number[] = [];
  const rowSize = (r: number) => r + 1;

  // misma fila
  if (col - 1 >= 0) neighbors.push(cellId(row, col - 1));
  if (col + 1 < rowSize(row)) neighbors.push(cellId(row, col + 1));

  // fila de arriba
  if (row - 1 >= 0) {
    if (col - 1 >= 0 && col - 1 < rowSize(row - 1)) neighbors.push(cellId(row - 1, col - 1));
    if (col < rowSize(row - 1)) neighbors.push(cellId(row - 1, col));
  }

  // fila de abajo (siempre en rango: rowSize(row+1) = row+2 > col, porque col <= row)
  if (row + 1 < TOTAL_ROWS) {
    neighbors.push(cellId(row + 1, col));
    neighbors.push(cellId(row + 1, col + 1));
  }

  return neighbors;
}

export function createInitialState(): AgujeroNegroState {
  const cells: Cell[] = [];
  for (let row = 0; row < TOTAL_ROWS; row++) {
    for (let column = 0; column <= row; column++) {
      cells.push({ id: cellId(row, column), row, column, player: null, value: null });
    }
  }

  return {
    cells,
    currentPlayer: 1,
    nextValue: { 1: 1, 2: 1 },
    status: 'playing',
    blackHole: null,
    destroyedCells: [],
    scores: { 1: 0, 2: 0 },
  };
}

export function esJugadaValida(payload: unknown): payload is number {
  return (
    typeof payload === 'number' &&
    Number.isInteger(payload) &&
    payload >= 0 &&
    payload < TOTAL_POSITIONS
  );
}

export function placeNumber(state: AgujeroNegroState, positionId: number): AgujeroNegroState {
  if (state.status !== 'playing') return state;

  const cell = state.cells.find(c => c.id === positionId);
  if (!cell || cell.value !== null) return state;

  const cells = state.cells.map(c =>
    c.id === positionId ? { ...c, player: state.currentPlayer, value: state.nextValue[state.currentPlayer] } : c
  );

  const nextValue = { ...state.nextValue };
  nextValue[state.currentPlayer] += 1;

  const occupiedCount = cells.filter(c => c.value !== null).length;

  if (occupiedCount === TOTAL_POSITIONS - 1) {
    const blackHoleCell = cells.find(c => c.value === null)!;
    const destroyedCells = getNeighbors(blackHoleCell.id);

    const scores: Record<1 | 2, number> = { 1: 0, 2: 0 };
    for (const c of cells) {
      if (c.value !== null && c.player !== null && !destroyedCells.includes(c.id)) {
        scores[c.player] += c.value;
      }
    }

    return {
      cells,
      currentPlayer: state.currentPlayer,
      nextValue,
      status: 'finished',
      blackHole: blackHoleCell.id,
      destroyedCells,
      scores,
    };
  }

  return {
    cells,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    nextValue,
    status: 'playing',
    blackHole: null,
    destroyedCells: [],
    scores: state.scores,
  };
}
