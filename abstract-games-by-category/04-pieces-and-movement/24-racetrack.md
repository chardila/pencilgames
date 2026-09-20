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
Racetrack is a paper-and-pencil racing game whose movement can be represented by velocity vectors. Known as *La Pista* (The Track) or *Vector Race* in Europe.

## Variants (Angiolino, 1995)
- **Motocross**: Track sections feature varying terrain properties:
  - *Asphalt/Road*: standard acceleration `(-1, 0, +1)` in each axis.
  - *Dirt/Mud/Grass*: maximum speed capped or forced deceleration by 1 unit each turn.
  - *Oil Slicks*: car cannot change its velocity vector on the turn it enters an oil square (`ax = 0, ay = 0`).
  - *Jump Ramps*: car launches forward with boosted velocity, skipping intermediate squares.
- **Multiple Cars Collision**: If two cars land on the exact same vertex, both cars crash and reset velocity to 0 (or suffer penalties).

