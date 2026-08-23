# Connect6

## Players
2

## Setup
Use a 19×19 grid in the standard rules.

Black moves first and places one stone on the first move only.

## Turn
After Black's opening move, every player places exactly two stones on each turn.

Stones are permanent and occupy empty intersections.

## Victory
The first player to create six or more consecutive stones horizontally, vertically, or diagonally wins.

## Draw
If the board fills without a winning line, the result is a draw.

## Implementation
The first move is a special case. Every subsequent turn contains two atomic placements but should be treated as one turn for win checking and UI.
