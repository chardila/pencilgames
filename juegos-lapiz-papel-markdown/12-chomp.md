# Chomp

## Resumen
Juego matemático para 2 jugadores sobre una cuadrícula rectangular. Una casilla está envenenada. Cada turno un jugador selecciona una casilla y “muerde” esa casilla y todas las casillas situadas por encima y a la derecha.

## Preparación
- Crear una cuadrícula rectangular.
- La casilla inferior izquierda es la casilla venenosa.
- Todas las casillas comienzan disponibles.

## Turno
El jugador selecciona cualquier casilla disponible excepto la venenosa.

La jugada elimina:
- la casilla seleccionada;
- todas las casillas en su misma región que estén en o por encima de su fila;
- todas las casillas en o a la derecha de su columna.

Equivalentemente, usando coordenadas con origen en la esquina inferior izquierda, al seleccionar `(x,y)` se eliminan todas las casillas con:
```text
x' >= x
y' >= y
```

La forma resultante debe mantenerse como una región rectangular-monótona.

## Fin
Si solo queda la casilla venenosa, el jugador que debe mover no tiene una jugada legal y pierde.

## Modelo
Una representación eficiente es almacenar la altura de cada columna, manteniendo las alturas no crecientes/monótonas según la orientación elegida.

## Fuente
Reglas de GamesCrafters. citeturn1search5
