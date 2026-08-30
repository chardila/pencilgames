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
