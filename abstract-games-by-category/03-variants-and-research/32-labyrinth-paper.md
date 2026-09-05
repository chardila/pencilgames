# Labyrinth (paper-and-pencil)

## Type
Hidden-map exploration game.

## Players
3 or more

## Roles
One player is the game master. The others are explorers.

## Setup
The game master creates a hidden labyrinth on graph paper and defines its rules, objective, and hazards.

## Turn
Explorers announce movement choices. The game master reveals whether each move is legal and provides the information permitted by the chosen rules.

## Goal
Usually find a treasure/objective and escape.

## End
The game ends when an explorer completes the objective or only one viable player remains, depending on the scenario.

## Web suitability
Competitive 2-player symmetric versions (similar to Battleship) are fully viable for local and remote play with hidden boards and fog of war.

## 2-Player Competitive Formats (Angiolino, 1995)

### 1. The Francoprussian Labyrinth (*Labirinto Franco-Prussiano*)
- **Setup:** Both players secretly draw an identical $10 \times 10$ (French) or $9 \times 9$ (Prussian) grid with at least 40 internal wall segments, a start cell (e.g. `A1`), and an exit cell (e.g. `J10`).
- **Turn:** Player announces a direction (Up, Down, Left, Right). The explorer pawn moves straight forward one square at a time until the opponent shouts *"Stop at [Cell]"* because a wall was hit.
- **Next Turn:** The player may resume movement from any cell traversed on their previous turn (including the start of that turn).
- **Victory:** First explorer to reach the opponent's exit square wins.

### 2. The English Labyrinth (*Labirinto Inglese*)
- **Setup:** Both players design a hidden labyrinth on a grid (e.g. $6 \times 6$).
- **Turn:**
  1. *Question phase:* The player asks a yes/no question about walls (e.g., *"Is there a wall between D1 and C1?"*). The opponent must answer truthfully.
  2. *Movement phase:* The player announces a path of 1, 2, or 3 contiguous orthogonal steps. The opponent responds with *"Legal"* or *"Blocked"* (without disclosing the exact wall location if blocked).
- **Victory:** First player to reach the exit cell.

## Recommendation
Implement the 2-player symmetric hidden-grid formats (Francoprussian / English) using the Battleship hidden-board state engine.

