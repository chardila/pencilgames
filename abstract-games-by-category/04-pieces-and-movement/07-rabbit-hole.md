# Rabbit Hole

## Players
2

## Designer
Walter Joris

## Board
6×6 grid with a designated hole/goal region.

## Core idea
Players place their stones and can move by jumping over their own stones. The objective is to finish with more stones in the hole than the opponent.

## Implementation warning
Rabbit Hole has published rule descriptions and variants whose exact board markings and move restrictions should be preserved as a selectable ruleset. Before coding, encode the board layout and jump rules as data rather than hard-coding assumptions.

## Recommended architecture
```ts
type Cell = { id: number; row: number; col: number; region: "board" | "hole" }
type Move =
  | { type: "place"; cell: number }
  | { type: "jump"; from: number; over: number; to: number }
```

## Source
Walter Joris's Rabbit Hole rules.
