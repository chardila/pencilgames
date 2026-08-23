# Order and Chaos

## Players
2

## Setup
Use a 6×6 grid.

One player is **Order**; the other is **Chaos**.

## Turn
On every turn, the player chooses either X or O and places it in an empty square.

Both players can choose either symbol.

## Victory
Order wins immediately if the board contains five identical symbols consecutively:
- horizontal;
- vertical; or
- diagonal.

Chaos wins if the board becomes completely full without Order achieving five in a row.

## Strategic asymmetry
Order is trying to create a pattern; Chaos is trying to prevent it.

## Implementation
After every move, scan all length-5 windows.
