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

## Additional Variants (Angiolino, 1995)
- **Big Nim**: Played across multiple rounds. The winner of each round scores points equal to the remaining items or items taken in that game.
- **Nimclock**: A single pile/track of 12 numbers arranged like a clock face. On each turn, a player may take 1, 2, or 3 consecutive remaining numbers on the clock dial.
- **Fibonacci Nim** (Robert E. Gaskell, 1966): Starts with a single pile of $N$ counters (e.g. $N = 20$). On the first move, player 1 may take any number $k$ ($1 \le k < N$). On subsequent moves, the current player may take at most $2k$ counters, where $k$ is the number taken on the immediately preceding move. Winning strategy relates to the Zeckendorf theorem (Fibonacci base decomposition).

