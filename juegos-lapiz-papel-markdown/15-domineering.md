# Domineering

## Resumen
Juego abstracto para 2 jugadores sobre una cuadrícula. Un jugador coloca dominós verticales y el otro horizontales. Los dominós no pueden solaparse.

## Preparación
- Crear una cuadrícula, por ejemplo 6×6.
- Todas las casillas están libres.
- Asignar orientación a cada jugador:
  - Jugador 1 = vertical;
  - Jugador 2 = horizontal.

## Turno
Jugador vertical:
- debe colocar un dominó ocupando dos casillas verticalmente adyacentes.

Jugador horizontal:
- debe colocar un dominó ocupando dos casillas horizontalmente adyacentes.

En ambos casos:
- ambas casillas deben estar libres;
- la pieza debe permanecer dentro del tablero;
- no puede solaparse con piezas existentes.

## Fin
El jugador que no puede colocar su dominó pierde.

## Modelo
```ts
type Cell = {
  occupied: boolean
}

type Move = {
  a: CellId
  b: CellId
}
```

Generación de movimientos:
```ts
if (player === "vertical") {
  check(row, col, row + 1, col)
} else {
  check(row, col, row, col + 1)
}
```

## Diferencia con Cram
En Cram ambos jugadores pueden colocar el dominó en cualquier orientación. En Domineering, cada jugador tiene una orientación fija.

## Fuente
Reglas de GamesCrafters. citeturn1search8turn1search116
