# Notakto

## Resumen
Variante de Tic-Tac-Toe para 2 jugadores en la que ambos jugadores colocan **X**. Se puede jugar con uno o varios tableros de 3×3.

## Preparación
- Crear uno o más tableros 3×3 vacíos.
- Todos los jugadores usan el mismo símbolo: X.
- Elegir quién empieza.

## Turno
1. Elegir cualquier casilla vacía de cualquier tablero que todavía esté activo.
2. Colocar una X.
3. Si ese tablero ahora contiene tres X en línea:
   - horizontal;
   - vertical; o
   - diagonal,
   el tablero queda **muerto** y ya no se puede jugar en él.

## Condición de derrota
Si el jugador actual coloca una X que forma tres en línea en el **último tablero activo**, pierde.

Por tanto, el objetivo es forzar al rival a cerrar el último tablero.

## Implementación
```ts
type Board = {
  cells: Cell[]
  dead: boolean
}

type GameState = {
  boards: Board[]
  currentPlayer: Player
}
```

Una partida puede comenzar con 1, 2, 3 o más tableros. La versión clásica estratégica suele usar 2 o 3.

## Fuente
Reglas de GamesCrafters. citeturn2search0turn2search7
