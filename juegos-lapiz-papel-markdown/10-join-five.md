# Join Five / Morpion Solitaire

## Resumen
Puzzle de lápiz y papel, normalmente para un solo jugador, aunque algunas variantes se pueden competir entre jugadores. El objetivo es realizar tantos movimientos como sea posible formando líneas de exactamente cinco puntos.

**Importante:** a diferencia de la mayoría de los juegos de esta colección, la versión estándar es principalmente un juego solitario.

## Preparación
Una configuración estándar comienza con puntos formando una cruz sobre una cuadrícula.

## Turno
1. Añadir un nuevo punto.
2. El nuevo punto debe permitir formar una línea recta de exactamente 5 puntos consecutivos.
3. La línea puede ser horizontal, vertical o diagonal.
4. La línea correspondiente se marca/cruza para impedir reutilizar ese segmento en la misma dirección.
5. El jugador obtiene 1 punto.

## Fin
La partida termina cuando no existe ninguna posición donde se pueda añadir un punto y formar una línea válida de cinco.

La puntuación es el número de movimientos realizados.

## Implementación
El tablero debe poder crecer virtualmente alrededor del origen.

Una representación robusta:
```ts
type Point = { x: number; y: number }
type Line = {
  points: Point[]
  direction: Direction
}
```

Para cada posición candidata, comprobar las cuatro direcciones:
- horizontal;
- vertical;
- diagonal principal;
- diagonal secundaria.

## Fuente
Reglas de Join Five/Morpion Solitaire. citeturn1search6turn1search115
