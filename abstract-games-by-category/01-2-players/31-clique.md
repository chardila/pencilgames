# Clique Game

## Type
Graph-building game.

## Players
2

## Recommended finite variant
Use a complete graph on a configurable number of vertices. Players alternately claim unclaimed edges.

## Goal
Maker tries to create a complete subgraph of a target size `k`.

Breaker tries to prevent it.

## Turn
Claim one unused edge.

## Victory
Maker wins as soon as all edges among some `k` vertices belong to Maker.

If the board is exhausted without the target clique, Breaker wins.

## Implementation
Precompute every k-subset of vertices and its required edge set.

After each Maker move, test affected candidate cliques.

## Note
The name describes a family of graph games; make `k` and the board graph explicit configuration.
