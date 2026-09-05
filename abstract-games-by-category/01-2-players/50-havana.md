# Havana

## Players
2

## Goal
Be the first player to complete any one of three winning structures:
1. **A Bridge:** A continuous path connecting any two of the 6 corner vertices of the board.
2. **A Fork:** A continuous path connecting any three of the 6 edges of the board (corner vertices do not count as part of an edge for this condition).
3. **A Ring:** A closed loop of connected stones enclosing at least one cell (empty or occupied).

## Setup
A hexagonal board made of hexagonal cells (base size typically 8 cells per side).

## Turn
Players take turns placing one stone of their color on any empty hexagonal cell.

## End
The game ends immediately when a player's move creates a Bridge, a Fork, or a Ring.

## History & Properties
- Invented in 1979 by Dutch game designer Christian Freeling.
- Like Hex, Havana cannot end in a draw on a filled board.
- The Pie Rule (Swap Rule) is recommended for competitive balance.

## Implementation
Use Union-Find or Breadth-First Search (BFS) to check:
- Component touches $\ge 2$ corner indices.
- Component touches $\ge 3$ distinct non-corner edge sets.
- Graph cycle detection (or flood fill from board perimeter to check for trapped enclosed cells).
