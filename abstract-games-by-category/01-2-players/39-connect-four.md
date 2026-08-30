# Connect Four

Also known as: Four in a Row, Four in a Line.

## Players
2

## Goal
Be the first to line up four of your own pieces.

## Setup
A grid of 6 rows by 7 columns, drawn upright. One player is 'O', the other 'X'.

## Turn
Choose a column. Your piece drops to the lowest empty cell in that column (gravity).
A full column cannot be chosen.

## Victory
A player wins immediately on making four consecutive pieces of their color, horizontally, vertically, or diagonally.

## End
If the grid fills with no line of four, the game is a draw.

## Implementation
Track a fill height per column (0..6). A move on column `c` places at row `height[c]`, then increments it.
After each move, count consecutive same-color pieces through the new cell along the four axes; four or more wins.
