# Sim

## Resumen
Juego de conexión para 2 jugadores. Los jugadores dibujan aristas entre puntos y cada uno intenta evitar ser quien complete un triángulo formado exclusivamente por sus propias aristas.

## Preparación
- Dibujar un conjunto de puntos; 6 puntos es un tamaño clásico sencillo.
- Todas las parejas de puntos pueden conectarse.
- Cada jugador recibe un color.

## Turno
1. Elegir dos puntos que todavía no estén conectados.
2. Dibujar una arista del color del jugador.
3. Comprobar si las aristas de ese jugador forman un triángulo cuyos tres lados sean del mismo color.

## Fin
El jugador que completa un triángulo de su propio color pierde inmediatamente.

No hay empate en la versión estándar de Sim: toda partida termina cuando un jugador completa un triángulo propio.

## Modelo
```ts
type Edge = { a: number; b: number; owner: Player | null }
```

Una función útil:
```ts
hasMonochromaticTriangle(player): boolean
```

## Nota
Sim es especialmente adecuado para una implementación web porque el estado puede representarse como un grafo completo de aristas coloreadas.
