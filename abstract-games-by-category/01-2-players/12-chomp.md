# Chomp

## Players
2

## Goal
Avoid taking the poisoned square.

## Setup
Create a rectangular chocolate-bar grid. Mark one corner square as poisoned.

A convenient coordinate system is origin at the poisoned corner.

## Turn
Select any remaining non-poisoned square.

The selected square and every square in the rectangle extending from it toward the opposite corner are removed.

The remaining shape stays monotone with respect to the poisoned corner.

## End
If only the poisoned square remains, the player to move loses.

## Implementation
For a rectangular board, represent the remaining height/width boundary rather than deleting arbitrary cells.

## Variant
Misère-like interpretation is inherent: taking the poisoned square is the losing outcome.
