# Notakto

## Players
2

## Setup
Use one or more 3×3 tic-tac-toe boards.

Both players use the same mark: X.

## Turn
1. Choose an empty square on any board that is still active.
2. Place X.
3. If that board now contains three Xs in a row, the board becomes dead and can no longer be played.

## Losing condition
If your move creates three-in-a-row on the final active board, you lose.

## End
The game ends immediately when the last active board is killed.

## Implementation
A board has:
```ts
type Board = {
  cells: Array<Player | null>
  dead: boolean
}
```

The number of boards should be configurable.
