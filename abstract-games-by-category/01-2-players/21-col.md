# Col

## Type
Connection / graph game.

## Players
2

## Core idea
Players claim edges of a graph and attempt to create the target monochromatic structure defined by the Col ruleset.

## Implementation recommendation
Because the name “Col” is used for more than one abstract-game description, encode:
- board graph;
- legal edges;
- winning pattern;
- whether the winning pattern is a goal or forbidden structure

as explicit configuration.

## Suggested architecture
```ts
type GraphGameRules = {
  nodes: Node[]
  edges: Edge[]
  winCondition: WinCondition
}
```

## Status
Needs a fixed published ruleset before being promoted to a canonical implementation.
