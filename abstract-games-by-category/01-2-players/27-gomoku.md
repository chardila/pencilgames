# Gomoku

## Players
2

## Goal
Create five or more consecutive stones in a straight line.

## Setup
Use a 9×9 square grid (chosen for touch play on a tablet).

## Turn
Players alternate placing one stone of their color on an empty intersection.

## Victory
A player wins immediately when they have five or more consecutive stones horizontally, vertically, or diagonally.

## Variants
This implementation uses 'five or more' (freestyle): an overline of six also wins. A 15×15 board and an 'exactly five' rule are known variants, not implemented here.

## Implementation
After each move, count consecutive stones through the newly placed cell in four axes.
