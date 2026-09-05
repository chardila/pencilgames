# Paper Soccer

## Players
2

## Goal
Move the ball into the opponent's goal.

## Setup
Draw a rectangular grid representing a soccer field. Place the ball at the center.

## Turn
Move the ball to an adjacent grid intersection using a horizontal, vertical, or diagonal segment that has not previously been used.

If the ball reaches:
- a point that was already visited, or
- the boundary of the field,

the player gets another move.

Otherwise the turn passes.

The same edge may not be traversed twice.

## Victory
A player wins by reaching the opponent's goal.

## Implementation
Represent the field as a graph. Store used edges as undirected canonical pairs.

## Note
Paper Soccer has several house-rule variants. Freeze one ruleset before implementing multiplayer/AI.
