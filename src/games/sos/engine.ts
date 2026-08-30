export type Player = 1 | 2;
export type Letter = 'S' | 'O';
export type CellValue = Letter | null;
export type GameStatus = 'playing' | 'finished';

export interface Point {
  row: number;
  col: number;
}

export interface SOSLine {
  from: Point;
  to: Point;
  player: Player;
}

export interface Move {
  row: number;
  col: number;
  letter: Letter;
}

export interface SOSState {
  size: number;
  board: CellValue[][];
  completedLines: SOSLine[];
  currentPlayer: Player;
  scores: Record<Player, number>;
  status: GameStatus;
  winner: Player | 'draw' | null;
  lastMove: Move | null;
}

export function esJugadaValida(payload: unknown): payload is Move {
  if (typeof payload !== 'object' || payload === null) return false;
  const c = payload as Record<string, unknown>;
  return (
    typeof c.row === 'number' &&
    Number.isInteger(c.row) &&
    c.row >= 0 &&
    c.row < 6 &&
    typeof c.col === 'number' &&
    Number.isInteger(c.col) &&
    c.col >= 0 &&
    c.col < 6 &&
    (c.letter === 'S' || c.letter === 'O')
  );
}

export function createInitialState(size = 6): SOSState {
  const board: CellValue[][] = Array.from({ length: size }, () =>
    Array(size).fill(null)
  );
  return {
    size,
    board,
    completedLines: [],
    currentPlayer: 1,
    scores: { 1: 0, 2: 0 },
    status: 'playing',
    winner: null,
    lastMove: null,
  };
}

function normalizeLine(p1: Point, p2: Point, player: Player): SOSLine {
  if (p1.row < p2.row || (p1.row === p2.row && p1.col <= p2.col)) {
    return { from: p1, to: p2, player };
  }
  return { from: p2, to: p1, player };
}

function areLinesEqual(l1: SOSLine, l2: SOSLine): boolean {
  return (
    l1.from.row === l2.from.row &&
    l1.from.col === l2.from.col &&
    l1.to.row === l2.to.row &&
    l1.to.col === l2.to.col
  );
}

function findNewLines(
  board: CellValue[][],
  size: number,
  move: Move,
  player: Player
): SOSLine[] {
  const newLines: SOSLine[] = [];
  const { row: r, col: c, letter } = move;

  const inBounds = (row: number, col: number) =>
    row >= 0 && row < size && col >= 0 && col < size;

  if (letter === 'O') {
    // Check 4 axes centered at (r, c)
    const axes = [
      { dr: 0, dc: 1 },  // Horizontal
      { dr: 1, dc: 0 },  // Vertical
      { dr: 1, dc: 1 },  // Diagonal ↘
      { dr: 1, dc: -1 }, // Diagonal ↗
    ];

    for (const { dr, dc } of axes) {
      const r1 = r - dr, c1 = c - dc;
      const r2 = r + dr, c2 = c + dc;
      if (inBounds(r1, c1) && inBounds(r2, c2)) {
        if (board[r1][c1] === 'S' && board[r2][c2] === 'S') {
          const line = normalizeLine({ row: r1, col: c1 }, { row: r2, col: c2 }, player);
          if (!newLines.some(l => areLinesEqual(l, line))) {
            newLines.push(line);
          }
        }
      }
    }
  } else if (letter === 'S') {
    // Check all 8 directions from (r, c)
    const directions = [
      { dr: 0, dc: 1 },
      { dr: 0, dc: -1 },
      { dr: 1, dc: 0 },
      { dr: -1, dc: 0 },
      { dr: 1, dc: 1 },
      { dr: 1, dc: -1 },
      { dr: -1, dc: 1 },
      { dr: -1, dc: -1 },
    ];

    for (const { dr, dc } of directions) {
      const ro = r + dr, co = c + dc;
      const rs = r + 2 * dr, cs = c + 2 * dc;
      if (inBounds(ro, co) && inBounds(rs, cs)) {
        if (board[ro][co] === 'O' && board[rs][cs] === 'S') {
          const line = normalizeLine({ row: r, col: c }, { row: rs, col: cs }, player);
          if (!newLines.some(l => areLinesEqual(l, line))) {
            newLines.push(line);
          }
        }
      }
    }
  }

  return newLines;
}

export function playMove(state: SOSState, move: Move): SOSState {
  if (state.status !== 'playing') return state;
  const { row, col, letter } = move;

  if (row < 0 || row >= state.size || col < 0 || col >= state.size) return state;
  if (state.board[row][col] !== null) return state;

  const nextBoard = state.board.map(r => [...r]);
  nextBoard[row][col] = letter;

  const newLines = findNewLines(nextBoard, state.size, move, state.currentPlayer);
  const nextCompletedLines = [...state.completedLines, ...newLines];
  const nextScores = { ...state.scores };
  nextScores[state.currentPlayer] += newLines.length;

  const isFull = nextBoard.every(r => r.every(cell => cell !== null));

  let nextStatus: GameStatus = 'playing';
  let nextWinner: Player | 'draw' | null = null;
  let nextPlayer: Player = state.currentPlayer;

  if (isFull) {
    nextStatus = 'finished';
    if (nextScores[1] > nextScores[2]) {
      nextWinner = 1;
    } else if (nextScores[2] > nextScores[1]) {
      nextWinner = 2;
    } else {
      nextWinner = 'draw';
    }
  } else {
    // If completed at least 1 SOS, player retains turn; otherwise toggle
    nextPlayer = newLines.length > 0 ? state.currentPlayer : state.currentPlayer === 1 ? 2 : 1;
  }

  return {
    size: state.size,
    board: nextBoard,
    completedLines: nextCompletedLines,
    currentPlayer: nextPlayer,
    scores: nextScores,
    status: nextStatus,
    winner: nextWinner,
    lastMove: move,
  };
}
