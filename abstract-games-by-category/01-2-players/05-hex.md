# Hex

## Players
2

## Goal
Connect the two opposite sides assigned to your color.

## Setup
Use a rhombus-shaped hexagonal-cell board. Recommended: 5×5 for the first web version.

Assign one pair of opposite sides to each player.

## Turn
Place one stone of your color on any empty cell.

## Victory
A player wins immediately when their stones form a connected path between their two target sides.

## Connectivity
Each cell has six hexagonal neighbors.

## Implementation
BFS/DFS or Union-Find can detect a winning connection.

## Draws
Standard Hex has no draw on a finite board: one player must connect their two sides.

## History & Variants (Angiolino, 1995)
- Invented independently by Piet Hein (1942, Copenhagen) and John Nash (1948, Princeton).
- **Pie Rule (Swap Rule):** Because the first player has a theoretical winning strategy (proven by Nash via strategy-stealing), the second player may choose to swap colors after the first player's opening move.

