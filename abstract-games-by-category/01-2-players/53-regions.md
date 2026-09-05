# Regions (Regioni)

## Players
2

## Goal
Be the last player able to make a legal move (Normal play) or avoid making the last move (Misère play).

## Setup
Draw a map divided into 20 to 30 adjacent regions on paper, or start with an empty boundary and draw regions dynamically.
Available palette: 4 colors (e.g. Red, Blue, Green, Yellow).

## Turn
On each turn, a player selects one uncolored region and fills it with one of the 4 colors, subject to:
- **Adjacency constraint:** No two regions sharing a common border (more than a single point) may have the same color.

## End
If a player cannot color any remaining region with any of the 4 colors without violating the adjacency constraint, they lose (in normal play).

## History & Mathematics
- Invented in 1964 by Stephen Barr.
- Direct mathematical connection to the **Four Color Theorem** (every planar map can be colored with at most 4 colors).
