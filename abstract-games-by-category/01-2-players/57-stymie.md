# Stymie

## Players
2

## Goal
Block your opponent so that they cannot place a valid number on any remaining vertex of a 3D cube.

## Setup
Draw a perspective 3D cube with 8 vertices.

## Turn
Players take turns writing an integer ($1, 2, 3, \dots$) on an unoccupied vertex of the cube.

## Rule Constraint
- Any two numbers placed at opposite ends of the same face diagonal or cube edge must sum to a **prime number** (or satisfy the parity / prime constraint).

## Strategy (Silverman & Angiolino)
- Since all prime numbers $> 2$ are odd, the sum of two numbers must be odd, which requires one number to be even and the other to be odd.
- If an even number and an odd number occupy opposite corners of a face, the other two corners of that face are effectively locked/restricted.

## History
Invented in 1971 by David L. Silverman.
