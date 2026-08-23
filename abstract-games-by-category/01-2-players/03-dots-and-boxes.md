# Dots and Boxes

## Players
2

## Goal
Claim more boxes than the opponent.

## Setup
Draw a rectangular grid of dots. Recommended: 5×5 dots, producing 4×4 boxes.

## Turn
1. Draw one horizontal or vertical edge between adjacent dots.
2. The edge must be unused.
3. If the move completes one or two boxes, claim those boxes and play again.
4. Otherwise, the turn passes.

## End
When every possible edge has been drawn, the player with the most claimed boxes wins.

## Implementation
Store horizontal and vertical edges separately or give every edge a canonical ID.

## Important rule
Completing a box grants another turn, including when the same move completes two boxes.
