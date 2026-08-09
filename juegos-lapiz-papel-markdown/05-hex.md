# Hex

## Resumen
Juego de conexión para 2 jugadores. Cada jugador intenta construir una cadena continua que conecte sus dos lados opuestos del tablero.

## Preparación
- Usar un tablero hexagonal, por ejemplo 5×5 para una primera versión.
- Un jugador conecta norte-sur.
- El otro conecta este-oeste.
- Se elige al jugador inicial.

## Turno
1. El jugador coloca una piedra en una casilla vacía.
2. La piedra permanece allí.
3. El turno pasa al rival.

Las casillas vecinas son las 6 posiciones hexagonalmente adyacentes.

## Victoria
- Jugador A gana si existe una cadena de sus piedras conectando sus dos lados objetivo.
- Jugador B gana si existe una cadena conectando sus lados.
- No hay empates en Hex.

## Modelo
```ts
type Cell = {
  row: number
  col: number
  owner: Player | null
}
```

Usar búsqueda BFS/DFS o Union-Find para detectar conexión.

## Implementación
La detección de victoria debe considerar solo las 6 direcciones hexagonales.

## Fuente
Hex es un juego de conexión en una cuadrícula hexagonal; sus reglas básicas consisten en ocupar casillas y conectar lados opuestos. citeturn0news173
