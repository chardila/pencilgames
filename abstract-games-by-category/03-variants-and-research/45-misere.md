# Misère (variant concept)

## Status
Not a game in its own right — a modifier that can be applied to many games.

## Definition
In a misère variant, the winner is whoever would **lose** under the normal rules.
Example: in Sim, completing a triangle in your own color normally loses; in Misère Sim it wins.

## Applies to (games already in this backlog)
- [Cram](../01-2-players/01-cram.md)
- [Domineering](../01-2-players/15-domineering.md)
- [Sim](../01-2-players/04-sim.md)
- also any other "last player to move wins / loses" game here (Obstruction, Snort, Snakes, Chomp)

## Implementation
For an engine that already computes a terminal winner, misère is a one-line flip of the result
at game end. Expose it as a per-game toggle rather than a separate game entry.

## Note
Misère versions are usually harder to analyse than the normal game, so optimal-play notes for the
base game do not carry over.
