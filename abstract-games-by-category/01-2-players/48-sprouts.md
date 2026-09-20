# Sprouts / The Peruvian Mole

## Players
2

## Goal
Make the last legal move (Normal play) or force the opponent to make the last move (Misère play).

## Setup
Start with $N$ isolated points (dots/circles) drawn on paper (typically $N = 2, 3, 4$ or $5$).

## Turn
1. Draw a continuous line (curve) connecting:
   - two distinct dots, or
   - a dot to itself (a loop).
2. The line must not cross itself or any previously drawn line, and must not pass through any other dots.
3. Place a new dot anywhere along the newly drawn line.

## Constraints
- A dot can have at most 3 line endpoints connected to it (each connection counts as 1 towards its degree, a loop counts as 2).
- When a dot reaches degree 3, it is "dead" (full) and cannot be connected to any further lines.
- The newly added dot already has degree 2 (from the line it splits), so it can accept at most 1 future connection.

## End
When no legal line can be drawn between available dots with remaining capacity (degree < 3), the game ends.
- **Normal play:** The player who made the last legal move wins.
- **Misère play:** The player who made the last legal move loses.

## Mathematical Properties & History
- Invented in 1967 at Cambridge University by John H. Conway and Michael S. Paterson. Known in Europe as *The Peruvian Mole* (*La Talpa Peruviana*).
- A game starting with $N$ dots will always finish in between $2N$ and $3N - 1$ moves.

## Variant: Brussels Sprouts
- Starts with $N$ crosses (each cross has 4 free arms).
- Each move connects two free arms with a non-crossing curve and places a crossbar (creating a new cross with 2 free arms) on the curve.
- Every game of Brussels Sprouts on $N$ crosses always lasts exactly $5N - 2$ moves.

## Implementation
```ts
type SproutsPoint = { id: string; x: number; y: number; degree: number; isAlive: boolean };
type SproutsEdge = { fromId: string; toId: string; path: Array<{ x: number; y: number }>; midDotId: string };
```
