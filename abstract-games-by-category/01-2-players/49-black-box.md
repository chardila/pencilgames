# Black Box

## Players
2 (or Solo deduction)

## Goal
The Experimenter must locate all hidden atoms inside the Black Box using the fewest possible probe beams and penalty points.

## Setup
- An $8 \times 8$ grid surrounded by 32 numbered probe ports (numbered 1 to 32 counterclockwise around the perimeter).
- The Challenger (or computer) secretly places 4 "atoms" on the grid.

## Turn
The Experimenter selects a numbered port ($1..32$) to fire a probe beam into the box. The Challenger reports the outcome:
1. **Absorbed (A):** The beam directly hits an atom and disappears.
2. **Deflected (Exit Port $K$):** The beam passes adjacent to an atom (diagonal or orthogonal detour). An atom exerts a field: entering an adjacent cell turns the beam $90^\circ$ away from the atom. The beam exits at port $K$.
3. **Reflected (R):**
   - The beam is deflected right back out of the port it entered (e.g. if an atom is adjacent to the entrance port or between two symmetric deflecting atoms).
   - If a beam enters between two atoms on adjacent lines, their deflections cancel and reflect the beam back.
4. **Miss / Straight through:** If no atoms affect the path, the beam exits directly on the opposite side.

## End & Scoring
When the Experimenter believes they know all 4 atom positions, they submit their guesses.
- **Beam cost:** 1 point per absorbed beam, 1 point per reflected beam, 2 points per deflected beam (exit $\ne$ entry).
- **Penalty:** 10 penalty points for each incorrectly identified atom.
- Roles swap after round 1; lowest total score wins.

## Implementation
Simulate ray marching through the $8 \times 8$ discrete vector field with 4-neighbor deflection rules.

## History
Invented by Eric Solomon in 1976; published by Waddingtons and Parker Brothers.
