# Walking Dots

## Resumen
Juego de Walter Joris para 2 jugadores sobre un tablero de 8×8. Cada jugador construye una colección de piedras. Al final, gana quien tenga más piedras.

## Preparación
Cada jugador coloca dos piedras propias en casillas vacías.

## Turno
El jugador puede:
- pasar; o
- colocar una piedra propia en una casilla vacía ortogonalmente adyacente a otra piedra propia.

Los jugadores pueden pasar aunque tengan una jugada disponible.

## Fin
Cuando ambos jugadores pasan consecutivamente, la partida termina.

Gana quien tenga más piedras.

## Regla de áreas
La descripción original señala que un jugador que encierra una región de casillas vacías puede reclamar automáticamente esa región.

Para una implementación inicial, esta regla debe especificarse y probarse por separado antes de automatizarla, porque la detección de regiones encerradas es una parte distinta de la lógica básica.

## Fuente
Reglas de Walter Joris. citeturn1search3
