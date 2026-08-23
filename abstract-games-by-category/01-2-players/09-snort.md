# Snort

## Players
2

## Goal
Make the opponent the first player with no legal move.

## Setup
Use a graph or rectangular grid. For a simple web version, use a 6×6 grid with orthogonal adjacency.

## Turn
Place one stone in an empty position.

The move is legal only if none of the neighboring positions contains an opponent stone.

A player's own neighboring stones are allowed.

## End
If the current player has no legal placement, that player loses.

## Implementation
```ts
isLegal(cell, player) =
  empty(cell) &&
  every(neighbor(cell), n => owner(n) !== opponent(player))
```
