# Icosian Game

## Type
Graph puzzle.

## Goal
Find a Hamiltonian cycle: a closed path that visits every vertex exactly once and returns to the start.

## Setup
Use a predefined graph with labeled vertices.

## Turn / puzzle
Select edges to construct a cycle.

A valid solution must:
- use only graph edges;
- visit each vertex exactly once;
- return to the starting vertex.

## Implementation
Represent the graph as:
```ts
type Graph = {
  vertices: number[]
  edges: Array<[number, number]>
}
```

For a puzzle mode, let the player build the cycle interactively and validate it.

## Note
This is primarily a puzzle rather than a conventional alternating-turn game.
