# Cram

## Players
2

## Goal
Be the player who makes the last legal move.

## Setup
Use a rectangular grid. Recommended default: 6×6.

## Turn
Place one domino covering two orthogonally adjacent empty cells.

Unlike Domineering, both players may place the domino horizontally or vertically.

## Illegal moves
- Diagonal cells.
- Occupied cells.
- Cells outside the board.

## End
If the current player has no legal domino placement, that player loses.

## Implementation
Generate every pair of orthogonally adjacent empty cells. Treat each pair as one legal move.

## Suggested state
```ts
type Move = { a: CellId; b: CellId }
```
