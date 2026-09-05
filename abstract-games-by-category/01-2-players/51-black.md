# Black

## Players
2

## Goal
Be the player who draws the road segment entering the bottom-right corner square of the board.

## Setup
A $6 \times 6$ square grid (or any $N \times N$ grid).

## Tiles / Symbols
There are 3 legal road segments:
1. **Straight:** Connects two opposite edges of the square.
2. **Curve ($90^\circ$):** Connects two adjacent edges of the square.
3. **Crossing:** Connects both pairs of opposite edges.

## Turn
- **Move 1 (Player 1):** Selects one of the 3 symbols and draws it in the top-left square `(0, 0)`, connecting to the entrance.
- **Subsequent Moves:** The current player selects any one of the 3 symbols and places it in the cell indicated by the outgoing road end of the current continuous track.
- The newly placed segment must connect seamlessly with the incoming path.

## End
The player whose placed segment connects the road into the bottom-right goal square wins the game immediately.

## History
Invented by William Black; featured in *Super Sharp Pencil & Paper Games* by Andrea Angiolino.
