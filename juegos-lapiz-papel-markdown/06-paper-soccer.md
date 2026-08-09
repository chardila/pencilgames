# Paper Soccer

## Resumen
Juego de lápiz y papel que simula fútbol mediante un punto que se desplaza por una red de intersecciones. Cada movimiento dibuja una línea hacia una intersección vecina. Las líneas no pueden reutilizarse.

## Preparación
Una configuración común usa:
- campo de 8×10 casillas;
- una portería de 2×1 en el centro de cada lado corto;
- balón en el punto central.

## Turno
1. Desde la posición actual, dibujar una línea hacia una intersección vecina.
2. El movimiento puede ser horizontal, vertical o diagonal.
3. La línea no puede haber sido utilizada previamente.
4. Si el balón llega a un punto que ya había visitado, rebota y el mismo jugador vuelve a jugar.
5. Si llega al borde del campo, también rebota y vuelve a jugar.
6. Si llega a una posición nueva interior, termina el turno.

No se permite recorrer una arista ya utilizada.

## Victoria
Un jugador gana al introducir el balón en la portería rival.

Otra regla común de la versión de puntos: si el jugador actual llega a una posición desde la que no tiene ninguna jugada legal, el rival gana el punto.

## Modelo
```ts
type Vertex = { row: number; col: number }
type Edge = { a: VertexId; b: VertexId }
type State = {
  ball: VertexId
  usedEdges: Set<EdgeId>
  visited: Set<VertexId>
}
```

## Fuente
Reglas de Paper Soccer actualizadas en 2026. citeturn0search1turn0search3
