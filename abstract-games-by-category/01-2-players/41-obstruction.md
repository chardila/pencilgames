# Obstruction

## Players
2

## Goal
Make the opponent the first player with no legal move.

## Setup
A rectangular grid; 6×6 is a good size. One player is 'O', the other 'X'.

## Turn
Write your symbol in an empty cell that is not blocked.
Placing a symbol immediately blocks all eight neighboring cells (orthogonal and diagonal)
for both players. Blocked cells can be lightly shaded to show they are dead.

## End
If the current player has no legal cell to play, that player loses.

## Implementation
```ts
isLegal(cell) =
  empty(cell) &&
  every(neighbor8(cell), n => empty(n))   // a symbol in any of the 8 neighbors blocks this cell
```
After a move, no state change is needed beyond recording the symbol; legality is derived.
The move count is bounded, so the game always ends.

## Variant
Larger boards (6×5, 7×6, 8×7, 8×8) change who holds the advantage.
