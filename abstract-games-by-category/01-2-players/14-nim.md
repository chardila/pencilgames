# Nim

## Players
2

## Goal
Normal play: take the last object and win.

## Setup
Create several piles. Example:
`3, 5, 7`

## Turn
Choose exactly one non-empty pile and remove one or more objects from it.

## End
When a player removes the last object, that player wins.

## Misère variant
In misère Nim, taking the last object loses.

## Implementation
```ts
type GameState = {
  piles: number[]
  currentPlayer: Player
  mode: "normal" | "misere"
}
```

## AI
Normal Nim has a perfect strategy based on the XOR (nim-sum) of pile sizes.
