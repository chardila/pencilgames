# Triangle Game

## Players
2

## Type
Graph / connection game.

## Setup
Draw a finite set of points. A common implementation uses six points arranged as a complete graph.

## Turn
Players alternately claim an unclaimed edge between two points.

## Recommended variant
Use the standard Ramsey-style triangle game: a player loses if their claimed edges complete a triangle.

This is closely related to Sim; the exact target condition must be stated in the UI.

## Implementation
Use:
```ts
type Edge = { a: number; b: number; owner: Player | null }
```

## Note
“Triangle Game” is used for several related games. Treat the chosen variant as part of the game's metadata.
