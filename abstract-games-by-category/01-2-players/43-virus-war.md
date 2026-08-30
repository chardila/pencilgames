# Virus War

Also known as: Voyna Virusov.

## Players
2

## Goal
Leave the opponent with no legal move.

## Setup
An 8×8 grid (6×6 and 7×7 are shorter variants). One player is 'O' (blue), the other 'X' (red).
'O' starts with a virus in the bottom-left corner; 'X' starts with a virus in the top-right corner.

## Turn
'O' plays first and makes only **one** move on the opening turn (to offset first-move advantage).
Every turn after that is **three** moves in a row by the same player.

Each of the three moves is one of:
- **Create**: write your symbol in an accessible empty cell.
- **Kill**: shade over one of the opponent's live viruses in an accessible cell (it becomes a dead enemy virus of your color's "kill").

A cell is **accessible** to a player if it is:
- adjacent (horizontal, vertical, or diagonal) to one of that player's live viruses, or
- connected to one of their live viruses through a chain of the opponent's viruses that this player has killed.

Your own viruses that the opponent has killed do **not** conduct — they block you.

## End
A player must make all three moves. If a player cannot complete their move, the opponent wins.

## Implementation
Each cell has a state: empty, live-O, live-X, killed-by-O, killed-by-X.
Accessibility for player P: flood from every live-P virus across neighbors, passing freely through
`killed-by-P` cells, stopping at empty cells (reachable, playable), live cells, and `killed-by-opponent` cells.
Resolve the three sub-moves sequentially — accessibility can change after each one.

## Variant
6×6 or 7×7 grid for a faster game.
