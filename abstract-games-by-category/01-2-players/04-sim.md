# Sim

## Players
2

## Goal
Avoid being the player who creates a triangle whose three edges are all your color.

## Setup
Draw a set of points. A complete graph on 6 points is a common compact implementation.

## Turn
1. Select two points that are not already connected.
2. Draw an edge in the current player's color.
3. If that creates a triangle consisting entirely of the current player's edges, that player loses immediately.

## End
The first player to complete a monochromatic triangle loses.

## Implementation
Maintain an undirected edge set. After each move, inspect triples containing the newly added edge.

## Suggested function
```ts
hasMonochromaticTriangle(player: Player): boolean
```

## Mathematical Context & Strategy (Angiolino, 1995)
- Invented in 1969 by Gustavus J. Simmons.
- **Ramsey's Theorem ($R(3,3) = 6$):** Any 2-coloring of the complete graph $K_6$ (15 edges) must contain at least one monochromatic triangle. Thus, a game of Sim on 6 vertices can never end in a draw.
- **Strategy tips:** The total number of edges is 15. The second player makes the last move (move 14 or 15). Good play involves keeping degrees of vertices balanced and avoiding creating forced traps (lines that force a triangle on the next turn).

