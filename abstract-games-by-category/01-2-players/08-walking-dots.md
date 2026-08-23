# Walking Dots

## Players
2

## Designer
Walter Joris

## Core rule
Players build groups of their own dots on a grid. A turn can add a dot adjacent to one of the player's existing dots, or the player may pass.

## End
When both players pass consecutively, the game ends.

## Scoring
Published descriptions include region/area considerations. Treat territory capture as a distinct rules module so the core placement game can be tested independently.

## Implementation warning
Use an explicit ruleset version. Do not silently combine variants.

## Suggested state
```ts
type GameState = {
  cells: Cell[]
  currentPlayer: Player
  consecutivePasses: number
}
```
