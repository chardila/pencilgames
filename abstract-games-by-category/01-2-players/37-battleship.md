# Battleship

## Players
2

## Goal
Sink the opponent's entire fleet before they sink yours.

## Setup
Each player draws two square grids (e.g. 10×10) on paper: an "Ocean" grid (own fleet, hidden from the opponent) and a "Tracking" grid (records own guesses at the opponent's fleet). Grids are labeled with coordinates, e.g. columns A–J and rows 1–10.

Each player secretly places a fixed fleet on their Ocean grid, without showing the other player. Standard fleet (5 ships):
- Carrier — 5 cells
- Battleship — 4 cells
- Cruiser — 3 cells
- Submarine — 3 cells
- Destroyer — 2 cells

Ships are placed horizontally or vertically (not diagonally), occupying contiguous cells, and may not overlap. (Optional house rule: ships may not touch each other, including diagonally — not enforced by default.)

## State
Each player has:
- `fleet`: the set of cells occupied by their own ships, with a ship ID and hit/not-hit status per cell.
- `shotsFired`: the set of coordinates the player has already guessed, each marked `hit`, `miss`, or `sunk-<shipId>`.

## Turn
1. The active player announces one coordinate on the opponent's grid that hasn't been guessed yet.
2. The opponent reveals whether that coordinate is a `hit` (a ship occupies it) or a `miss` (empty water).
3. If it's a hit and it was the ship's last unhit cell, the opponent announces the ship is `sunk` and names it.
4. The active player marks the result on their own Tracking grid.
5. The turn passes to the other player.

(Optional variant: a hit grants an extra turn instead of passing — not standard; if implemented, state clearly which rule is active.)

## End
The game ends when one player has hit every cell of every enemy ship (all ships sunk). That player wins.

## Implementation
- Represent each player's board as a grid of cells, each storing `shipId | null`.
- Enforce placement legality at setup: contiguous, straight (horizontal or vertical only), in-bounds, non-overlapping.
- On a guess, look up the cell on the opponent's board; mark it hit or miss; if hit, check whether every cell of that ship is now hit, and if so mark the ship `sunk`.
- Keep the opponent's ship positions hidden from the guessing player: for a web implementation, the server/authoritative state should resolve hit/miss and only return that result (plus "sunk" + ship name when applicable) to the client, never the full opponent board.
- Track each player's remaining (unsunk) ships to detect end of game.
- For local/hotseat web play (two players sharing one device), use a "pass and confirm" screen between turns so each player only sees their own Ocean grid before handing over, and only their own Tracking grid while guessing.

## Important rule
A coordinate that has already been guessed cannot be targeted again; hit/miss markers are permanent.

## Variant note
Grid size and fleet composition vary by edition; 10×10 with the 5-ship fleet listed above is the most common pencil-and-paper/board version. Smaller grids (e.g. 8×8) with fewer/smaller ships are a common simplified variant.

## Source
Classic two-player pencil-and-paper guessing/deduction game, later also sold as a board/pegboard game; played by secretly placing ships on a grid and calling coordinates to locate and sink the opponent's fleet.
