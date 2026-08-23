# SOS

## Players
2

## Goal
Score more SOS patterns.

## Setup
Draw a square grid, e.g. 5×5.

## Turn
On each turn, place either S or O in any empty cell.

Whenever the move completes an `S-O-S` sequence in a straight horizontal, vertical, or diagonal line, score one point for that player.

A move can create multiple SOS patterns.

If at least one SOS is created, the player plays again. Otherwise the turn passes.

## End
When the grid is full, highest score wins.

## Implementation
After each placement, inspect all lines passing through the new cell.
