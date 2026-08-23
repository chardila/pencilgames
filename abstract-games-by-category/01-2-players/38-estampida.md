# Estampida

## Players
2

## Goal
End the game with more occupied cells than the opponent.

## Setup
Draw a 10×10 grid. Players alternate turns placing one of their own symbols (`X` for Player 1, `O` for Player 2) on any empty cell, until each has placed exactly 8 symbols (16 cells filled, 84 empty). A symbol cannot be placed on an occupied cell.

## Turn
1. The active player chooses one direction: up, down, left, or right (no diagonals).
2. Using the board state as it was *before* this turn, find every cell containing the active player's own symbol.
3. For each such symbol, check the cell immediately adjacent to it in the chosen direction.
4. If that target cell is inside the board and was empty in the pre-turn state, mark it to receive a copy of the symbol.
5. Once every symbol has been checked, place a copy in every marked cell — all at once, not one at a time.
6. The original symbols never move or disappear; only new copies are added.
7. If no symbol could copy in the chosen direction, the board is unchanged and the turn is simply lost — the player cannot pick another direction on the same turn.
8. The turn passes to the other player.

## Important rule
All copies in a turn must be computed from a single snapshot of the board taken before the turn started. A cell that starts the turn empty and gets filled by a copy during this same turn must NOT trigger a further copy in the same turn (no chaining). A target cell blocks a copy whether it holds the mover's own symbol or the opponent's; symbols never jump over occupied cells, and a player never copies the opponent's symbols.

## End
The game ends when every cell of the grid is occupied (0 empty cells; 100/100 on a 10×10 board). Count each player's occupied cells; the player with more occupied cells wins (draw if equal).

## Implementation
```text
function executeTurn(board, player, direction):
    newBoard = copy(board)
    targets = []
    for each cell (row, col) in board:
        if board[row][col] != player: continue
        target = adjacent(row, col, direction)
        if target is outside board: continue
        if board[target.row][target.col] != empty: continue
        targets.push(target)
    for t in targets:
        newBoard[t.row][t.col] = player
    return newBoard
```
- Represent the board as a 2D array of `'empty' | 'X' | 'O'`.
- Track a `phase`: `'setup' | 'playing' | 'finished'`, plus a per-player placed-count during setup (stop allowing placements once each player reaches 8).
- Recompute scores (occupied-cell counts per symbol) after every turn and after setup.
- End the game and lock further input once `emptyCells === 0`.

## UI note
During `setup`, cells are clickable to place the active player's symbol. During `playing`, cells are not clickable; the player instead picks a direction from four controls (↑ ↓ ← →). Show the current phase, current player and symbol, both scores, and — during setup — each player's placed-count out of 8. Copy animations (a symbol sliding or fading into its new cell) are purely visual and must not change the simultaneous-copy logic above.

## Test cases
- Simple copy: `X..` + RIGHT → `XX.`.
- Edge: `X..` + LEFT (X already in column 1) → unchanged.
- Obstacle: `XO.` + RIGHT → unchanged (target occupied, own or opponent's symbol).
- No chaining: `X...` + RIGHT → `XX..`, never `XXXX`.
- Multiple symbols copy simultaneously in one turn whenever each has a free target cell in the chosen direction.
- Full board (`emptyCells === 0`) → `phase` becomes `finished` and the winner is computed from occupied-cell counts.

## Source
Adapted from a video demonstrating a two-player pencil-and-paper grid game on a 10×10 board: each player starts by placing 8 symbols, then takes turns choosing a cardinal direction to simultaneously duplicate every one of their symbols that has an empty adjacent cell in that direction, until the board is full; most occupied cells wins (example match shown in the source: X = 44, O = 56, O wins).
