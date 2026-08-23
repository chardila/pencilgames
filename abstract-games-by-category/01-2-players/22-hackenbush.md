# Hackenbush

## Players
2

## Setup
Draw a graph of colored edges connected to a ground/base.

Each player owns one color of edge.

## Turn
A player removes one edge of their own color.

After removing it, every edge no longer connected to the ground falls away.

## End
If the current player has no legal edge of their color, that player loses.

## Implementation
Represent the position as a graph with a distinguished ground node.

After deleting an edge:
1. Run connectivity from ground.
2. Remove all disconnected edges.
3. Recompute legal moves.

## Variants
There are Blue-Red, Green Hackenbush and other variants. The classic two-color version is enough for the first web implementation.
