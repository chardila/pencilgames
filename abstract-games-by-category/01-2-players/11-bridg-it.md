# Bridg-It / Gale

> ✅ **Implementado** — en vivo en https://games.cardila.com/juegos/bridg-it/
> Retículas 5×6 roja y 6×5 azul entrelazadas (30 puntos cada una), 2 jugadores, bloqueo por cruce de aristas, sin empates.

## Players
2

## Goal
Connect your two opposite target sides with your own network.

## Setup
Create the standard interleaved two-color point layout. Each player owns one set of points and a pair of opposite borders.

## Turn
Draw one edge between two adjacent points belonging to the current player's network.

The edge must not already exist and must not cross an existing edge.

## Victory
The first player with a continuous path connecting their two target borders wins.

## Implementation
Represent each player's points as a graph. Edge intersection must be tested if arbitrary geometry is used.

## Note
The standard Bridg-It layout is not the same as a normal square-grid Hex board.

## Background & Variants (Angiolino, 1995)
- Invented by David Gale (1958). Known in Europe (Italy, France) as **Brigitte**.
- **Scaffold (*Impalcatura*):** A traditional variant played on a dot grid where players alternately connect orthogonal neighbor dots to build paths across the sheet or wall off the opponent.
- **Shannon Switching Game connection:** Gale formulated Bridg-It as a planar graph realization of Claude Shannon's switching game. Gale proved that player 1 has a pairing strategy that guarantees victory.

