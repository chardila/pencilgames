# Racetrack

## Players
2 or more

## Goal
Complete the race track first without leaving the track.

## Setup
Draw a closed racing circuit on a grid. Each player starts at the starting line.

## State
Each car has:
- position `(x,y)`;
- velocity `(vx,vy)`.

## Turn
Choose an acceleration in each axis, normally from:
`-1, 0, +1`.

New velocity:
```text
vx' = vx + ax
vy' = vy + ay
```

New position:
```text
x' = x + vx'
y' = y + vy'
```

The trajectory segment must remain within the legal track area.

## Victory
Cross the finish line after completing the required circuit.

## Implementation
Treat each move as a vector transition and reject moves whose segment leaves the track.

## Source
Racetrack is a paper-and-pencil racing game whose movement can be represented by velocity vectors.
