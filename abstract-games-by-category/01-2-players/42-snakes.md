# Snakes

## Players
2

## Goal
Be the last player able to extend your snake.

## Setup
A matrix of dots, 5×5 or larger. Each player owns one snake with a fixed starting dot:
- Blue starts at the second row, second column.
- Red starts at the second-to-last row, second-to-last column.

## Turn
Extend your own snake by one segment: draw a horizontal or vertical line from your snake's
current head to an adjacent dot.

The target dot must be free: a segment may not cross or touch any dot already used by
either snake, and may not reuse a segment.

## End
If the current player cannot extend their snake, that player loses.

## Implementation
Track used dots (a set) and each snake's head position. A move from head `h` to neighbor `n`
is legal when `n` is orthogonally adjacent, in bounds, and not in the used set. Apply: mark `n`
used, set head = `n`.

## Variant
Larger boards (7×5, 7×7 dots) lengthen the game.

## Related Variants (Angiolino, 1995)
- **The Big Snake (*Il Serpentone*)**: Light-Cycles / Tron-like pencil game on a graph paper grid. Players delineate any shape board and start at opposite corners. Each turn a player shades one orthogonally adjacent square extending their snake. Squares cannot be revisited. Obstacle squares (pre-blackened blocks) can be placed before starting.
- **Parton's Snake (Vernon R. Parton, 1970)**: Played on a grid (e.g. $6 \times 6$). Each player takes turns writing sequential numbers ($1, 2, 3, \dots, N$) in adjacent empty squares to build an expanding numbered snake path while trying to trap and cut off the opponent's snake.

