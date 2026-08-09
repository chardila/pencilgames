# Snort

## Resumen
Juego de colocación sobre un grafo o una cuadrícula. Cada jugador coloca piedras de su color. Una piedra no puede colocarse en una posición adyacente a una piedra del rival.

## Preparación
Para una implementación sencilla:
- usar una cuadrícula rectangular;
- todas las casillas comienzan vacías;
- elegir quién empieza.

## Turno
1. Elegir una casilla vacía.
2. La casilla es legal si ninguna casilla vecina contiene una piedra del rival.
3. Colocar la piedra propia.
4. Pasar el turno.

La adyacencia depende de la variante. Para una cuadrícula estándar, usar adyacencia ortogonal de 4 vecinos.

## Fin
Si el jugador actual no tiene ninguna casilla legal, pierde.

## Modelo
```ts
type Cell = {
  owner: Player | null
}

function isLegal(cell, player) {
  return cell.owner === null &&
    neighbors(cell).every(n => n.owner !== opponent(player))
}
```

## Nota
Snort es un juego combinatorio imparcial en cuanto a estructura, pero con movimientos dependientes del color de cada jugador. Conviene permitir elegir explícitamente el tipo de grafo/tablero.

## Implementación
La lógica esencial es pequeña y es un buen candidato para IA mediante búsqueda minimax en tableros pequeños.
