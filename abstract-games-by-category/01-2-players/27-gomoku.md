# Gomoku

## Players
2

## Goal
Create five or more consecutive stones in a straight line.

## Setup
Use a square grid. A 15×15 board is a common implementation size.

## Turn
Players alternate placing one stone of their color on an empty intersection.

## Victory
A player wins immediately when they have five consecutive stones horizontally, vertically, or diagonally.

## Variants
Some Gomoku rules require exactly five and others allow five or more. Choose one and expose it in the rules.

## Implementation
After each move, count consecutive stones through the newly placed cell in four axes.
