import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  esJugadaValida,
  playMove,
  type SOSState,
  type Move,
} from './engine';

describe('SOS Engine', () => {
  describe('createInitialState', () => {
    it('creates a 6x6 empty board by default', () => {
      const state = createInitialState();
      expect(state.size).toBe(6);
      expect(state.board).toHaveLength(6);
      state.board.forEach(row => {
        expect(row).toHaveLength(6);
        expect(row.every(cell => cell === null)).toBe(true);
      });
      expect(state.currentPlayer).toBe(1);
      expect(state.scores).toEqual({ 1: 0, 2: 0 });
      expect(state.completedLines).toEqual([]);
      expect(state.status).toBe('playing');
      expect(state.winner).toBeNull();
      expect(state.lastMove).toBeNull();
    });

    it('allows custom board sizes', () => {
      const state = createInitialState(4);
      expect(state.size).toBe(4);
      expect(state.board).toHaveLength(4);
      state.board.forEach(row => {
        expect(row).toHaveLength(4);
        expect(row.every(cell => cell === null)).toBe(true);
      });
    });
  });

  describe('esJugadaValida', () => {
    it('accepts valid move payloads', () => {
      expect(esJugadaValida({ row: 0, col: 0, letter: 'S' })).toBe(true);
      expect(esJugadaValida({ row: 5, col: 5, letter: 'O' })).toBe(true);
      expect(esJugadaValida({ row: 2, col: 3, letter: 'S' })).toBe(true);
    });

    it('rejects non-object or null payloads', () => {
      expect(esJugadaValida(null)).toBe(false);
      expect(esJugadaValida(undefined)).toBe(false);
      expect(esJugadaValida(42)).toBe(false);
      expect(esJugadaValida('S')).toBe(false);
      expect(esJugadaValida([])).toBe(false);
    });

    it('rejects invalid row and col coordinates', () => {
      expect(esJugadaValida({ row: -1, col: 0, letter: 'S' })).toBe(false);
      expect(esJugadaValida({ row: 6, col: 0, letter: 'S' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: -1, letter: 'S' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: 6, letter: 'S' })).toBe(false);
      expect(esJugadaValida({ row: 1.5, col: 0, letter: 'S' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: 2.2, letter: 'S' })).toBe(false);
      expect(esJugadaValida({ row: '0', col: 0, letter: 'S' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: '0', letter: 'S' })).toBe(false);
    });

    it('rejects invalid letters', () => {
      expect(esJugadaValida({ row: 0, col: 0, letter: 'X' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: 0, letter: 's' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: 0, letter: 'o' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: 0, letter: '' })).toBe(false);
      expect(esJugadaValida({ row: 0, col: 0 })).toBe(false);
    });
  });

  describe('playMove basic flow', () => {
    it('places a letter and alternates turn if no SOS is formed', () => {
      const s0 = createInitialState(6);
      const s1 = playMove(s0, { row: 0, col: 0, letter: 'S' });

      expect(s1.board[0][0]).toBe('S');
      expect(s1.currentPlayer).toBe(2);
      expect(s1.scores).toEqual({ 1: 0, 2: 0 });
      expect(s1.completedLines).toHaveLength(0);
      expect(s1.lastMove).toEqual({ row: 0, col: 0, letter: 'S' });
      expect(s0.board[0][0]).toBeNull(); // immutability check
    });

    it('ignores move on occupied cell and preserves state reference', () => {
      const s0 = createInitialState(6);
      const s1 = playMove(s0, { row: 0, col: 0, letter: 'S' });
      const s2 = playMove(s1, { row: 0, col: 0, letter: 'O' });

      expect(s2).toBe(s1);
      expect(s2.board[0][0]).toBe('S');
      expect(s2.currentPlayer).toBe(2);
    });

    it('ignores out-of-bounds moves and preserves state reference', () => {
      const s0 = createInitialState(6);
      expect(playMove(s0, { row: -1, col: 0, letter: 'S' })).toBe(s0);
      expect(playMove(s0, { row: 6, col: 0, letter: 'S' })).toBe(s0);
      expect(playMove(s0, { row: 0, col: -1, letter: 'S' })).toBe(s0);
      expect(playMove(s0, { row: 0, col: 6, letter: 'S' })).toBe(s0);
    });

    it('ignores move if game status is finished', () => {
      const state: SOSState = {
        ...createInitialState(6),
        status: 'finished',
      };
      const next = playMove(state, { row: 0, col: 0, letter: 'S' });
      expect(next).toBe(state);
    });
  });

  describe('SOS Detection when placing O', () => {
    it('detects horizontal S-O-S and grants bonus turn', () => {
      let state = createInitialState(6);
      // P1 places S at (0,0)
      state = playMove(state, { row: 0, col: 0, letter: 'S' });
      // P2 places S at (0,2)
      state = playMove(state, { row: 0, col: 2, letter: 'S' });
      // P1 places O at (0,1) -> forms S-O-S!
      state = playMove(state, { row: 0, col: 1, letter: 'O' });

      expect(state.scores[1]).toBe(1);
      expect(state.scores[2]).toBe(0);
      expect(state.completedLines).toEqual([
        { from: { row: 0, col: 0 }, to: { row: 0, col: 2 }, player: 1 },
      ]);
      // P1 keeps the turn
      expect(state.currentPlayer).toBe(1);
    });

    it('detects vertical S-O-S', () => {
      let state = createInitialState(6);
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1
      state = playMove(state, { row: 2, col: 0, letter: 'S' }); // P2
      state = playMove(state, { row: 1, col: 0, letter: 'O' }); // P1 -> forms vertical SOS

      expect(state.scores[1]).toBe(1);
      expect(state.scores[2]).toBe(0);
      expect(state.completedLines).toEqual([
        { from: { row: 0, col: 0 }, to: { row: 2, col: 0 }, player: 1 },
      ]);
      expect(state.currentPlayer).toBe(1);
    });

    it('detects diagonal ↘ and ↗ S-O-S', () => {
      let state = createInitialState(6);
      // Diagonal ↘: (0,0), (1,1), (2,2)
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1
      state = playMove(state, { row: 2, col: 2, letter: 'S' }); // P2
      state = playMove(state, { row: 1, col: 1, letter: 'O' }); // P1 -> diagonal ↘

      expect(state.scores[1]).toBe(1);
      expect(state.completedLines).toEqual([
        { from: { row: 0, col: 0 }, to: { row: 2, col: 2 }, player: 1 },
      ]);
      expect(state.currentPlayer).toBe(1);

      // Diagonal ↗: (2,0), (1,1), (0,2) - P1 plays at (2,0)
      state = playMove(state, { row: 2, col: 0, letter: 'S' }); // P1
      // P2 plays at (0,2) -> forming diagonal ↗ because (1,1) already has 'O'
      state = playMove(state, { row: 0, col: 2, letter: 'S' }); // P2

      expect(state.scores[2]).toBe(1);
      expect(state.completedLines).toHaveLength(2);
      expect(state.completedLines[1]).toEqual({
        from: { row: 0, col: 2 },
        to: { row: 2, col: 0 },
        player: 2,
      });
      expect(state.currentPlayer).toBe(2);
    });

    it('detects multiple simultaneous SOS with a single O (horizontal + vertical + 2 diagonals)', () => {
      let state = createInitialState(6);
      // Setup surrounding S letters around (2,2)
      state = playMove(state, { row: 2, col: 1, letter: 'S' }); // P1
      state = playMove(state, { row: 2, col: 3, letter: 'S' }); // P2
      state = playMove(state, { row: 1, col: 2, letter: 'S' }); // P1
      state = playMove(state, { row: 3, col: 2, letter: 'S' }); // P2
      state = playMove(state, { row: 1, col: 1, letter: 'S' }); // P1
      state = playMove(state, { row: 3, col: 3, letter: 'S' }); // P2
      state = playMove(state, { row: 1, col: 3, letter: 'S' }); // P1
      state = playMove(state, { row: 3, col: 1, letter: 'S' }); // P2

      // P1 places O at (2,2) -> completes 4 SOS lines simultaneously!
      state = playMove(state, { row: 2, col: 2, letter: 'O' }); // P1

      expect(state.scores[1]).toBe(4);
      expect(state.completedLines).toHaveLength(4);
      expect(state.currentPlayer).toBe(1);
    });
  });

  describe('SOS Detection when placing S', () => {
    it('detects S-O-S when placing the ending S', () => {
      let state = createInitialState(6);
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1
      state = playMove(state, { row: 0, col: 1, letter: 'O' }); // P2
      state = playMove(state, { row: 0, col: 2, letter: 'S' }); // P1 -> forms SOS!

      expect(state.scores[1]).toBe(1);
      expect(state.completedLines).toEqual([
        { from: { row: 0, col: 0 }, to: { row: 0, col: 2 }, player: 1 },
      ]);
      expect(state.currentPlayer).toBe(1);
    });

    it('detects S-O-S when placing the starting S', () => {
      let state = createInitialState(6);
      state = playMove(state, { row: 0, col: 2, letter: 'S' }); // P1
      state = playMove(state, { row: 0, col: 1, letter: 'O' }); // P2
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1 -> forms SOS!

      expect(state.scores[1]).toBe(1);
      expect(state.completedLines).toEqual([
        { from: { row: 0, col: 0 }, to: { row: 0, col: 2 }, player: 1 },
      ]);
      expect(state.currentPlayer).toBe(1);
    });

    it('detects multiple S-O-S formed simultaneously when placing S', () => {
      let state = createInitialState(6);
      // We want to form SOS horizontally (0,0)-(0,2) and vertically (0,0)-(2,0)
      // Set up (0,1)='O', (0,2)='S', (1,0)='O', (2,0)='S'
      state = playMove(state, { row: 0, col: 1, letter: 'O' }); // P1
      state = playMove(state, { row: 0, col: 2, letter: 'S' }); // P2
      state = playMove(state, { row: 1, col: 0, letter: 'O' }); // P1
      state = playMove(state, { row: 2, col: 0, letter: 'S' }); // P2

      // P1 places S at (0,0) -> completes horizontal AND vertical SOS!
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1

      expect(state.scores[1]).toBe(2);
      expect(state.completedLines).toHaveLength(2);
      expect(state.currentPlayer).toBe(1);
    });
  });

  describe('Grid limits and no wrap-around', () => {
    it('does not detect false SOS across row boundaries', () => {
      let state = createInitialState(6);
      // Row 0 end: (0, 5)='S', Row 1 start: (1, 0)='O', (1, 1)='S'
      state = playMove(state, { row: 0, col: 5, letter: 'S' }); // P1
      state = playMove(state, { row: 1, col: 0, letter: 'O' }); // P2
      state = playMove(state, { row: 1, col: 1, letter: 'S' }); // P1
      expect(state.completedLines).toHaveLength(0);
      expect(state.scores).toEqual({ 1: 0, 2: 0 });
    });
  });

  describe('Game completion and winner', () => {
    it('declares finished and computes draw when board is full with equal scores', () => {
      // 2x2 board
      let state = createInitialState(2);
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1
      state = playMove(state, { row: 0, col: 1, letter: 'O' }); // P2
      state = playMove(state, { row: 1, col: 0, letter: 'S' }); // P1
      state = playMove(state, { row: 1, col: 1, letter: 'O' }); // P2

      expect(state.status).toBe('finished');
      expect(state.winner).toBe('draw');
    });

    it('declares finished and sets winner to Player 1 when P1 has more points', () => {
      // 3x3 board:
      // Row 0: S O S (P1 gets 1 point on col 2, keeps turn!)
      let state = createInitialState(3);
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1 -> turn goes to P2
      state = playMove(state, { row: 0, col: 1, letter: 'O' }); // P2 -> turn goes to P1
      state = playMove(state, { row: 0, col: 2, letter: 'S' }); // P1 -> forms SOS! P1 keeps turn!

      expect(state.scores[1]).toBe(1);
      expect(state.scores[2]).toBe(0);
      expect(state.currentPlayer).toBe(1);

      // Fill remaining 6 cells without forming more SOS:
      // (1,0)='O', (1,1)='O', (1,2)='O'
      // (2,0)='O', (2,1)='O', (2,2)='O'
      state = playMove(state, { row: 1, col: 0, letter: 'O' }); // P1 -> turn goes to P2
      state = playMove(state, { row: 1, col: 1, letter: 'O' }); // P2 -> turn goes to P1
      state = playMove(state, { row: 1, col: 2, letter: 'O' }); // P1 -> turn goes to P2
      state = playMove(state, { row: 2, col: 0, letter: 'O' }); // P2 -> turn goes to P1
      state = playMove(state, { row: 2, col: 1, letter: 'O' }); // P1 -> turn goes to P2
      state = playMove(state, { row: 2, col: 2, letter: 'O' }); // P2 -> board full

      expect(state.status).toBe('finished');
      expect(state.winner).toBe(1);
      expect(state.scores).toEqual({ 1: 1, 2: 0 });
    });

    it('declares finished and sets winner to Player 2 when P2 has more points', () => {
      // 3x3 board: P2 forms the SOS
      let state = createInitialState(3);
      state = playMove(state, { row: 0, col: 0, letter: 'S' }); // P1 -> turn P2
      state = playMove(state, { row: 0, col: 1, letter: 'O' }); // P2 -> turn P1
      state = playMove(state, { row: 1, col: 1, letter: 'O' }); // P1 -> turn P2
      state = playMove(state, { row: 0, col: 2, letter: 'S' }); // P2 -> forms SOS at (0,0)-(0,2)! P2 keeps turn!

      expect(state.scores[2]).toBe(1);
      expect(state.scores[1]).toBe(0);
      expect(state.currentPlayer).toBe(2);

      // Fill remaining cells:
      state = playMove(state, { row: 1, col: 0, letter: 'O' }); // P2 -> turn P1
      state = playMove(state, { row: 1, col: 2, letter: 'O' }); // P1 -> turn P2
      state = playMove(state, { row: 2, col: 0, letter: 'O' }); // P2 -> turn P1
      state = playMove(state, { row: 2, col: 1, letter: 'O' }); // P1 -> turn P2
      state = playMove(state, { row: 2, col: 2, letter: 'O' }); // P2 -> board full

      expect(state.status).toBe('finished');
      expect(state.winner).toBe(2);
    });
  });
});
