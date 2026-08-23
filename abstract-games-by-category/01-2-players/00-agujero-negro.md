# Agujero Negro (Black Hole)

## Players
2

## Goal
Finish with the highest total of surviving numbers.

## Setup
Draw 21 circles in six rows:

```text
          ○
        ○   ○
      ○   ○   ○
    ○   ○   ○   ○
  ○   ○   ○   ○   ○
○   ○   ○   ○   ○   ○
```

Each player owns the numbers 1–10.

## Turn
Players alternate. On each turn, place the next number in your sequence in any empty circle.

Order is mandatory:
`1 → 2 → 3 → ... → 10`

After 20 moves, exactly one circle is empty.

## Black Hole
The empty circle becomes the Black Hole. Every circle touching it is destroyed.

For implementation, define adjacency explicitly according to the triangular grid. An interior cell can have up to six neighbors.

## Scoring
Each player adds the values of their numbers that survived. Highest score wins.

## Implementation notes
Represent the 21 cells with stable IDs and an explicit neighbor graph. Do not infer adjacency from DOM distances.

## Source
Rules reconstructed from descriptions of Walter Joris's Black Hole.
