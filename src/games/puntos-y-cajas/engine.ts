export type PuntosPlayer = 1 | 2;
export type LineType = 'h' | 'v';

export interface LineId {
  type: LineType;
  row: number;
  col: number;
}

export interface PuntosYCajasState {
  size: number;
  horizontalLines: boolean[][];
  verticalLines: boolean[][];
  horizontalLineOwners: (PuntosPlayer | null)[][];
  verticalLineOwners: (PuntosPlayer | null)[][];
  boxOwners: (PuntosPlayer | null)[][];
  currentPlayer: PuntosPlayer;
  scores: Record<PuntosPlayer, number>;
  status: 'playing' | 'finished';
}

export function createInitialState(size = 4): PuntosYCajasState {
  const horizontalLines = Array.from({ length: size }, () => Array(size - 1).fill(false));
  const verticalLines = Array.from({ length: size - 1 }, () => Array(size).fill(false));
  const horizontalLineOwners: (PuntosPlayer | null)[][] = Array.from({ length: size }, () =>
    Array(size - 1).fill(null)
  );
  const verticalLineOwners: (PuntosPlayer | null)[][] = Array.from({ length: size - 1 }, () =>
    Array(size).fill(null)
  );
  const boxOwners: (PuntosPlayer | null)[][] = Array.from({ length: size - 1 }, () =>
    Array(size - 1).fill(null)
  );

  return {
    size,
    horizontalLines,
    verticalLines,
    horizontalLineOwners,
    verticalLineOwners,
    boxOwners,
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
  };
}

function isLineInBounds(state: PuntosYCajasState, line: LineId): boolean {
  if (line.type === 'h') {
    return line.row >= 0 && line.row < state.size && line.col >= 0 && line.col < state.size - 1;
  }
  return line.row >= 0 && line.row < state.size - 1 && line.col >= 0 && line.col < state.size;
}

function isLineDrawn(state: PuntosYCajasState, line: LineId): boolean {
  if (line.type === 'h') {
    return state.horizontalLines[line.row][line.col];
  }
  return state.verticalLines[line.row][line.col];
}

function boxSides(boxRow: number, boxCol: number) {
  return {
    top: { type: 'h' as const, row: boxRow, col: boxCol },
    bottom: { type: 'h' as const, row: boxRow + 1, col: boxCol },
    left: { type: 'v' as const, row: boxRow, col: boxCol },
    right: { type: 'v' as const, row: boxRow, col: boxCol + 1 },
  };
}

function isBoxComplete(state: PuntosYCajasState, boxRow: number, boxCol: number): boolean {
  const sides = boxSides(boxRow, boxCol);
  return (
    isLineDrawn(state, sides.top) &&
    isLineDrawn(state, sides.bottom) &&
    isLineDrawn(state, sides.left) &&
    isLineDrawn(state, sides.right)
  );
}

function adjacentBoxes(state: PuntosYCajasState, line: LineId): Array<{ row: number; col: number }> {
  const boxCount = state.size - 1;
  const boxes: Array<{ row: number; col: number }> = [];

  if (line.type === 'h') {
    if (line.row - 1 >= 0 && line.row - 1 < boxCount) boxes.push({ row: line.row - 1, col: line.col });
    if (line.row >= 0 && line.row < boxCount) boxes.push({ row: line.row, col: line.col });
  } else {
    if (line.col - 1 >= 0 && line.col - 1 < boxCount) boxes.push({ row: line.row, col: line.col - 1 });
    if (line.col >= 0 && line.col < boxCount) boxes.push({ row: line.row, col: line.col });
  }

  return boxes;
}

export function playLine(state: PuntosYCajasState, line: LineId): PuntosYCajasState {
  if (state.status !== 'playing') return state;
  if (!isLineInBounds(state, line)) return state;
  if (isLineDrawn(state, line)) return state;

  const horizontalLines = state.horizontalLines.map(row => [...row]);
  const verticalLines = state.verticalLines.map(row => [...row]);
  const horizontalLineOwners = state.horizontalLineOwners.map(row => [...row]);
  const verticalLineOwners = state.verticalLineOwners.map(row => [...row]);
  const boxOwners = state.boxOwners.map(row => [...row]);
  const scores = { ...state.scores };

  if (line.type === 'h') {
    horizontalLines[line.row][line.col] = true;
    horizontalLineOwners[line.row][line.col] = state.currentPlayer;
  } else {
    verticalLines[line.row][line.col] = true;
    verticalLineOwners[line.row][line.col] = state.currentPlayer;
  }

  const nextState: PuntosYCajasState = {
    ...state,
    horizontalLines,
    verticalLines,
    horizontalLineOwners,
    verticalLineOwners,
    boxOwners,
    scores,
  };

  let completedABox = false;
  for (const box of adjacentBoxes(nextState, line)) {
    if (boxOwners[box.row][box.col] === null && isBoxComplete(nextState, box.row, box.col)) {
      boxOwners[box.row][box.col] = state.currentPlayer;
      scores[state.currentPlayer] += 1;
      completedABox = true;
    }
  }

  const totalBoxes = (state.size - 1) * (state.size - 1);
  const boxesFilled = scores[1] + scores[2];

  if (boxesFilled === totalBoxes) {
    nextState.status = 'finished';
    nextState.currentPlayer = state.currentPlayer;
  } else {
    nextState.status = 'playing';
    nextState.currentPlayer = completedABox
      ? state.currentPlayer
      : state.currentPlayer === 1
      ? 2
      : 1;
  }

  return nextState;
}
