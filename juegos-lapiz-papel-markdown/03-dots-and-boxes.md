# Dots and Boxes

## Resumen
Juego para 2 jugadores en el que se dibujan líneas entre puntos vecinos. Completar el cuarto lado de un cuadrado otorga un punto y permite jugar otra vez.

## Preparación
Crear una cuadrícula de puntos. Para una primera implementación:
- 5×5 puntos = 4×4 cuadrados.

## Turno
1. El jugador elige una arista horizontal o vertical entre dos puntos adyacentes.
2. La arista no puede estar dibujada previamente.
3. Si la jugada completa uno o dos cuadrados, el jugador reclama esos cuadrados.
4. Si completó al menos un cuadrado, vuelve a jugar.
5. Si no completó ninguno, pasa el turno.

## Fin
Cuando todas las aristas están dibujadas, gana quien haya reclamado más cuadrados.

## Modelo
```ts
type Edge = { a: PointId; b: PointId; owner: Player | null }
type Box = { top: EdgeId; right: EdgeId; bottom: EdgeId; left: EdgeId; owner: Player | null }
```

## Criterios
- Solo líneas horizontales/verticales.
- Una arista solo puede dibujarse una vez.
- Una jugada puede cerrar como máximo dos cuadrados en una cuadrícula normal.
- Cerrar un cuadrado concede otro turno.
- Gana la mayor puntuación.

## Fuente
Reglas estándar de Dots and Boxes. citeturn0search4turn0youtube192
