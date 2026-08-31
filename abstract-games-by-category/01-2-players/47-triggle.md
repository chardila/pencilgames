# Triggle / Chain Triangle Game

## Players
2 (expandible a 3–4)

## Goal
Conquistar la mayor cantidad de triángulos unitarios en el tablero.

## Setup
Una rejilla de puntos en disposición triangular isométrica (por ejemplo, un triángulo de lado 6 o 7 puntos, o un hexágono regular de puntos).

## Turn
1. En su turno, el jugador traza una línea recta continua que conecte **exactamente 4 puntos consecutivos** en cualquiera de las 3 direcciones de la cuadrícula:
   - Horizontal: `—`
   - Diagonal ascendente: `/`
   - Diagonal descendente: `\`
2. **Regla de conexión:** A partir del segundo turno de la partida, la línea trazada debe tocar o cruzarse en al menos un punto con alguna línea ya existente en el tablero.
3. **No duplicar:** No se puede trazar una línea idéntica a una ya existente (que cubra exactamente los mismos 4 puntos).
4. **Conquistar triángulos:** Si al trazar la línea se completa el tercer lado de uno o más triángulos unitarios pequeños:
   - El jugador activo reclama inmediatamente esos triángulos (marcando su inicial, símbolo o color en su interior).
5. **Paso de turno:** A diferencia de *Puntos y Cajas*, completar triángulos **no otorga un turno extra**; el turno pasa al siguiente jugador.

## End
La partida termina cuando ya no queden líneas válidas de 4 puntos que se puedan trazar en el tablero. El jugador con más triángulos conquistados es el ganador (empate si tienen la misma cantidad).

## Implementation
```ts
// Coordenadas en malla isométrica (q, r)
type Point = { q: number; r: number };
type UnitEdge = { p1: Point; p2: Point; active: boolean };
type Triangle = { edges: [UnitEdge, UnitEdge, UnitEdge]; owner: Player | null };

// Una jugada es una línea recta de 4 puntos colineales (3 aristas unitarias consecutivas):
type Move = {
  start: Point;
  direction: 'H' | 'D1' | 'D2'; // Horizontal, Diagonal 60°, Diagonal 120°
};
```
- Cada jugada de 4 puntos activa hasta 3 aristas unitarias contiguas.
- Tras activar las aristas, se evalúan los triángulos adyacentes a esas aristas para comprobar si sus 3 lados están ahora activos y asignar la propiedad al jugador actual.
- Validar que a partir del turno 2, al menos 1 de los 4 puntos de la jugada coincida con un punto ya tocado por una arista activa.

## Note
La dinámica clave frente a *Puntos y Cajas* es que cada movimiento añade 3 segmentos simultáneos, lo que genera jugadas de alto impacto táctico donde se pueden reclamar múltiples triángulos a la vez o dejar expuestos triángulos al rival si no se calcula con precisión.
