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
