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

## Historical Names
- Also known as *Pipopipette* (Édouard Lucas, 1889) in France.
- Known as *La Battaglia dei Quadrati* (The Battle of the Squares) or *The Hunt of the Fox* in Italy.

## Variants (from Angiolino, 1995)
- **Triangles**: Played on a triangular grid of dots. Connecting adjacent dots forms equilateral triangles. Completing a triangle claims it and grants an extra turn.
- **Triad**: Played on a square grid with diagonals. Players can draw horizontal, vertical, or diagonal line segments. Completing right triangles claims them.
- **Nazareno**: Isometric/hexagonal grid variant (popularized in Rome in the 1970s) where both triangles and rhombuses can be completed and captured.

