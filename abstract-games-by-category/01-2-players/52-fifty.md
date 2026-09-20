# Fifty (Cinquanta)

## Players
2

## Goal
Be the player who adds a number that brings the running total to exactly **50** (or target $N$).

## Setup
Start with a running total of $0$ (or target written at top of paper).

## Turn
On each turn, a player chooses an integer from $1$ to $6$ (inclusive) and adds it to the running sum.

## Rule Constraints
- The choice must be between $1$ and $6$.
- You cannot make a move that exceeds the target ($50$).

## Victory
The player who reaches exactly $50$ wins.

## Mathematical Strategy (Angiolino, 1995)
- Since the allowed step range is $1..6$, the key winning positions are numbers congruent to $50 \pmod{1 + 6}$, i.e., $50 \pmod 7 = 1$.
- Winning milestones: $1, 8, 15, 22, 29, 36, 43, 50$.
- Player 1 can guarantee a win by choosing $1$ on the first turn, and on every subsequent turn choosing $(7 - k)$, where $k$ is the opponent's choice.

## Variants
- **Target 100:** Target sum 100 with step range $1..10$ (winning numbers $\equiv 100 \pmod{11} = 1$).
- **Misère Fifty:** The player who reaches or exceeds 50 loses.
