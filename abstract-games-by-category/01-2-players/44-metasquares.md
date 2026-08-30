# MetaSquares

## Players
2

## Goal
Form more squares than the opponent with your own pieces.

## Setup
An 8×8 grid (6×6 or 7×7 for shorter games). One player is 'O', the other 'X'.

## Turn
Write your symbol in an empty cell.

When four of your pieces sit at the corners of a perfect square, that square is completed and
drawn in. The square may be any size and slanted at any angle, as long as it is a true square.

## Victory
**Simple game (recommended default):** score one point per completed square, regardless of size.
On an 8×8 board the first player to 8 squares wins.

## End
If the grid fills before anyone reaches the target, the higher score wins.

## Implementation
Store each player's occupied cells as a set of `(x, y)`.
After placing at `p`, for every other same-color pair `(a, b)`, the two points that would complete
a square with `a` and `b` are `a + rot90(b - a)` and `b + rot90(b - a)` (and the opposite rotation).
If `p` is one of those and the other three cells are all the same color, a square is formed.
Deduplicate squares by their sorted corner set so each is scored once.

## Variant
**Advanced (area) scoring** — uses numeric side lengths, so keep it optional: a completed square
scores `side × side`, where `side` is the number of cells along one edge (for slanted squares,
counted along the L-step between adjacent corners). First to 150 points and 15+ ahead wins.
