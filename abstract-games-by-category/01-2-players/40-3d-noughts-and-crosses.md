# 3D Noughts and Crosses

Also known as: 3D Tic-tac-toe, Qubic.

## Players
2

## Goal
Be the first to make a line of four in the 4×4×4 cube.

## Setup
A 4×4×4 cube, represented as four stacked 4×4 grids (layers 0..3). One player is 'O', the other 'X'.

## Turn
Write your symbol in any empty cell of any layer.

## Victory
A player wins immediately on making four cells in a straight line in any direction:
- within one layer: horizontal, vertical, or diagonal
- straight up through the layers (same row and column across all four layers)
- diagonal across the layers (a plane diagonal)
- a full space diagonal of the cube (corner to opposite corner)

## End
If all 64 cells fill with no line of four, the game is a draw.

## Implementation
Index cells as `(x, y, z)` with each coordinate in 0..3. Precompute the 76 winning lines
(sets of four coordinates) once. After each move, check the lines through the placed cell.
