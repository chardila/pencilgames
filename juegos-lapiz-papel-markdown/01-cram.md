# Cram

## Resumen
Juego abstracto para 2 jugadores basado en colocar piezas de dominó sobre una cuadrícula. Cada jugador coloca una pieza que ocupa exactamente dos casillas ortogonalmente adyacentes. Quien no pueda realizar una jugada legal pierde.

## Preparación
- Crear una cuadrícula rectangular; 5×5 o 6×6 son buenos tamaños para una implementación inicial.
- Todas las casillas comienzan vacías.
- Elegir al jugador inicial.

## Turno
1. El jugador selecciona dos casillas vacías ortogonalmente adyacentes.
2. Coloca un dominó cubriendo ambas.
3. El turno pasa al rival.

No se permiten:
- diagonales;
- piezas fuera del tablero;
- solapamientos;
- ocupar casillas ya usadas.

## Fin
Si un jugador no tiene ninguna pareja de casillas vacías ortogonalmente adyacentes, pierde.

## Modelo
```ts
type Cell = { row: number; col: number; occupied: boolean }
type Move = { a: Cell; b: Cell }
```

`getLegalMoves()` debe devolver todas las parejas de casillas vacías adyacentes.

## Criterios de aceptación
- Nunca se puede solapar una pieza.
- Toda jugada ocupa exactamente 2 casillas.
- La partida termina cuando `legalMoves.length === 0`.
- El jugador que no puede mover pierde.

## Fuente
Reglas de Domineering/Cram y juegos combinatorios; la mecánica de Cram usa dominós que pueden colocarse en cualquier orientación.
