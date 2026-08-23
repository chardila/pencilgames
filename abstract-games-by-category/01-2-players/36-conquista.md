# Conquista

## Players
2 or more

## Goal
Claim more territory than any other player.

## Setup
Draw a grid of dots of any size — the larger the grid, the more unpredictable the game. The grid may also be irregular (non-uniform spacing). Assign each player a distinct color.

## Legal fences
A fence is a line connecting two points considered "adjacent":
- the four orthogonal neighbors (up, down, left, right), and
- the two diagonal neighbors within any 2×2 block of points.

The diagonal across a 2×2 block is the longest legal fence.

## Turn
1. Draw one unused legal fence, in your color.
2. If the fence closes off one or more regions, claim those regions.
3. If you claimed at least one region, draw another fence (repeat from step 1).
4. Otherwise, the turn passes to the next player.

## End
When no legal fence remains, count each player's claimed territory. The player with the most territory wins.

## Implementation
- Model the dot grid as a graph. Generate legal fences as: orthogonal edges between adjacent points, plus both diagonals of every 2×2 block of points.
- Track drawn fences in a set, keyed by a canonical ID per fence (e.g. a sorted point-pair).
- After each fence is drawn, detect newly closed regions: find the smallest enclosed face(s) whose boundary is fully drawn and not yet owned. Because diagonals are legal, regions are not limited to unit squares — they can be triangles or other polygons formed by combinations of orthogonal and diagonal fences.
- Award each newly closed region to the player who drew the completing fence, and grant that player another turn.
- Support 2+ players, each with an assigned color; store the owner (or "unclaimed") per region.
- Track territory per player as region count or total enclosed area, depending on how ties/scoring should be displayed.

## Important rule
Completing a region grants an extra turn, and this can chain: if the extra fence completes another region too, the player keeps playing until a drawn fence fails to close anything.

## Variant note
The reference example uses a 6×6 grid of dots, but any size, and even an irregular grid, is valid.

## Source
Pencil-and-paper territory game for two or more players, played by drawing colored fences between adjacent points (including the diagonals of a 2×2 block) on a dot grid.
