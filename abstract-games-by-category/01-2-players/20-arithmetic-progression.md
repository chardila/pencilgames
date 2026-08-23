# Arithmetic Progression Game

## Status
Abstract mathematical game; several different games use this name.

## Recommended web variant
Use a finite set of integers, for example `{1,2,...,15}`.

Players alternately claim one unclaimed integer.

## Goal
Maker tries to create a 3-term arithmetic progression among their claimed numbers:
`a, b, c` where `b-a = c-b`.

Breaker tries to prevent Maker from doing so.

## Turn
Claim one unused number.

## End
Maker wins immediately when their set contains a 3-term arithmetic progression.

If all numbers are claimed without one, Breaker wins.

## Implementation
Precompute all triples:
```ts
a < b < c
b - a === c - b
```

After each Maker move, check whether all three members of any triple are owned by Maker.

## Important
This is a deliberately specified finite variant. Other “Arithmetic Progression” games exist.
