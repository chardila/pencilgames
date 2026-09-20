# Phutball

## Players
2

## Goal
Move the white ball into the opponent's end zone.

## Board
The canonical board is a 19×15 grid of intersections.

Use one white ball and black “men”.

## Turn
A player may either:
1. place a black man on an empty board intersection; or
2. move the ball by jumping over one or more adjacent black men.

During a jump:
- the ball travels in a straight horizontal, vertical, or diagonal direction;
- it jumps over a contiguous run of black men;
- it must land on the first empty intersection beyond that run;
- the jumped men are removed.

A player may chain multiple jumps during the same turn.

## Victory
Reach the opponent's end zone.

## Implementation warning
Phutball has detailed edge/end-zone rules. Implement a tested canonical ruleset before adding variants.
