# Chomp

> ✅ **Implementado** — en vivo en https://games.cardila.com/juegos/chomp/
> Tableta fija 4×7, 2 jugadores, onza envenenada en (0,0) / casilla 0, mordiscos por sub-rectángulos y modo online peer-to-peer.

## Players
2

## Goal
Avoid taking the poisoned square (force the opponent to be left with only the poisoned square).

## Setup
Create a rectangular chocolate-bar grid of 4×7 (4 rows, 7 columns, 28 squares).
Mark the top-left corner square (0,0 / index 0) as poisoned (☠️).

## Turn
Select any remaining non-poisoned square `(r, c)`.

The selected square and every square in the sub-rectangle extending from it toward the bottom-right corner `(row >= r, col >= c)` are eaten / removed.

The remaining chocolate shape stays monotone with respect to the poisoned corner.

## End
The player who leaves only the poisoned square wins immediately (the opponent is forced to take it and loses).

## Implementation
Represented as a 28-element boolean array (`eaten: boolean[]`) where eating cell `(r, c)` eats all cells `(r2, c2)` with `r2 >= r` and `c2 >= c`.

## Variant
Misère-like interpretation is inherent: taking the poisoned square is the losing outcome.

