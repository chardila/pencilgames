# Agujero Negro — Reglas del juego

## 1. Descripción

**Agujero Negro** (Black Hole) es un juego abstracto para 2 jugadores que se puede jugar con lápiz y papel.

El objetivo es terminar la partida con la mayor cantidad de puntos posible. Los jugadores colocan números del 1 al 10 en una formación triangular de 21 posiciones. Al final queda una posición vacía: esa posición es el **Agujero Negro** y elimina las posiciones que la rodean. Cada jugador suma los números que sobrevivieron.

---

## 2. Componentes

No se necesitan componentes físicos:

- 21 posiciones/círculos formando un triángulo.
- Dos jugadores.
- Cada jugador dispone de los números **1, 2, 3, ..., 10**.
- Un espacio queda vacío al final y se convierte en el Agujero Negro.

### Formación del tablero

Las 21 posiciones están organizadas en 6 filas:

```text
          ○
        ○   ○
      ○   ○   ○
    ○   ○   ○   ○
  ○   ○   ○   ○   ○
○   ○   ○   ○   ○   ○
```

Número total de posiciones:

`1 + 2 + 3 + 4 + 5 + 6 = 21`

---

## 3. Preparación

1. Crear un tablero con 21 posiciones vacías.
2. Asignar dos jugadores: `Jugador 1` y `Jugador 2`.
3. Cada jugador tiene que colocar exactamente los números del **1 al 10**.
4. El orden de colocación es obligatorio: cada jugador debe colocar sus números en orden ascendente.

Por ejemplo, un jugador no puede colocar su `5` hasta haber colocado su `4`.

---

## 4. Desarrollo de la partida

Los jugadores se alternan colocando sus números.

El orden completo de los turnos es:

```text
Jugador 1 → 1
Jugador 2 → 1

Jugador 1 → 2
Jugador 2 → 2

Jugador 1 → 3
Jugador 2 → 3

...

Jugador 1 → 10
Jugador 2 → 10
```

En cada turno:

1. El jugador toma el siguiente número que le corresponde.
2. Elige cualquier posición que todavía esté vacía.
3. Coloca su número en esa posición.
4. El turno pasa al otro jugador.

No se puede colocar un número en una posición que ya esté ocupada.

Después de los 20 turnos, habrá:

- 10 números pertenecientes al Jugador 1.
- 10 números pertenecientes al Jugador 2.
- 1 posición vacía.

La posición vacía se convierte en el **Agujero Negro**.

---

## 5. El Agujero Negro

El Agujero Negro elimina todos los números situados en las posiciones que son **adyacentes** a la posición vacía.

### Regla de adyacencia

Dos posiciones son vecinas cuando sus círculos se tocan en el tablero triangular.

Por lo tanto, una posición puede tener hasta **6 vecinos**.

El número de vecinos depende de dónde esté el Agujero Negro:

- En una esquina: puede tener 2 vecinos.
- En un borde: puede tener más de 2 y menos de 6.
- En una posición interior: puede tener hasta 6 vecinos.

**Importante para la implementación:** la adyacencia debe modelarse como relaciones explícitas entre posiciones del tablero, no como distancia euclidiana aproximada. Esto evita errores debido al posicionamiento visual de los círculos.

---

## 6. Puntuación

Después de aplicar el Agujero Negro:

1. Se eliminan todos los números de las posiciones adyacentes al Agujero Negro.
2. Los números que no fueron eliminados sobreviven.
3. Cada jugador suma los valores de sus números supervivientes.
4. Gana el jugador con la puntuación más alta.

### Ejemplo

Supongamos que después de aplicar el Agujero Negro:

```text
Jugador 1:
1 + 3 + 5 + 8 + 9 + 10 = 36

Jugador 2:
2 + 4 + 6 + 7 = 19
```

El resultado es:

```text
Jugador 1: 36 puntos
Jugador 2: 19 puntos

Ganador: Jugador 1
```

---

## 7. Propiedad importante de la puntuación

La suma de todos los números colocados es siempre:

`1 + 2 + ... + 10` para cada jugador.

Por tanto:

```text
Suma total de los números de ambos jugadores
= 2 × (1 + 2 + ... + 10)
= 2 × 55
= 110
```

La puntuación final depende exclusivamente de qué números sean eliminados por el Agujero Negro.

Esto significa que estratégicamente los jugadores quieren:

- proteger sus números altos;
- conseguir que el Agujero Negro quede cerca de números altos del oponente;
- y evitar que sus números de mayor valor estén en posiciones que puedan ser eliminadas.

---

## 8. Estado final de la partida

La partida termina inmediatamente después de que el segundo jugador coloque el número `10`.

En ese momento:

1. Se identifica la única posición vacía.
2. Esa posición se marca como `black hole`.
3. Se identifican todas sus posiciones vecinas.
4. Los números de esas posiciones se consideran eliminados.
5. Se calculan las puntuaciones de ambos jugadores.
6. Se determina el ganador.

No se realiza ningún turno adicional.

---

## 9. Modelo de datos recomendado para la implementación

Para una implementación web, cada posición del tablero debería tener un identificador estable.

Por ejemplo:

```text
0
1  2
3  4  5
6  7  8  9
10 11 12 13 14
15 16 17 18 19 20
```

Cada posición debería almacenar:

```typescript
type Cell = {
  id: number
  row: number
  column: number
  player: 1 | 2 | null
  value: number | null
}
```

El tablero contiene exactamente 21 `Cell`.

---

## 10. Adyacencias del tablero

Para evitar ambigüedades, se recomienda representar las adyacencias explícitamente.

La estructura triangular tiene una geometría de red triangular: una posición interior puede estar conectada con hasta seis posiciones.

Para la implementación, **no inferir los vecinos usando solamente coordenadas X/Y del DOM**.

En su lugar, construir una función o mapa de vecinos basado en `row` y `column`, o definir explícitamente las relaciones de adyacencia.

Una implementación puede exponer:

```typescript
getNeighbors(cellId: number): number[]
```

Esta función debe devolver exactamente las posiciones que tocan físicamente al círculo indicado.

---

## 11. Reglas para una implementación interactiva

El frontend debe impedir movimientos ilegales.

### Durante el turno

El jugador solo puede seleccionar una posición vacía.

El valor que se coloca está determinado por el estado del jugador:

```text
Jugador 1:
nextValue = 1 → 2 → 3 → ... → 10

Jugador 2:
nextValue = 1 → 2 → 3 → ... → 10
```

El jugador no puede seleccionar manualmente qué número colocar.

### Después de colocar un número

Actualizar:

- tablero;
- jugador actual;
- siguiente número del jugador;
- historial de movimientos;
- número de posiciones ocupadas.

### Cuando se colocan los 20 números

Cambiar el estado de la partida a `finished`.

Identificar:

```typescript
blackHole = cells.find(cell => cell.value === null)
```

Luego:

```typescript
destroyedCells = getNeighbors(blackHole.id)
```

Los números de esas posiciones se consideran eliminados para el cálculo de puntuación.

---

## 12. Estados recomendados

El juego puede modelarse con estados:

```typescript
type GameStatus =
  | "playing"
  | "finished"
```

Y un estado de juego similar a:

```typescript
type GameState = {
  cells: Cell[]
  currentPlayer: 1 | 2
  nextValue: {
    1: number
    2: number
  }
  status: GameStatus
  blackHole: number | null
  destroyedCells: number[]
  scores: {
    1: number
    2: number
  }
}
```

---

## 13. Validación

La implementación debería comprobar como mínimo:

- El tablero siempre tiene exactamente 21 posiciones.
- Solo hay una posición vacía al finalizar.
- Cada jugador coloca exactamente una vez cada número del 1 al 10.
- Nunca se puede ocupar una posición ocupada.
- Nunca se puede saltar un número.
- El Agujero Negro es exactamente la única posición vacía.
- Solo las posiciones adyacentes al Agujero Negro son eliminadas.
- La puntuación se calcula únicamente con números supervivientes.
- La partida termina después de colocar el segundo `10`.

---

## 14. Variante opcional

Existe una versión reducida para partidas rápidas:

- utilizar solamente 15 posiciones;
- eliminar la fila inferior de 6 posiciones;
- cada jugador coloca los números del 1 al 7.

La versión principal de este proyecto debe utilizar **21 posiciones y números del 1 al 10**.

---

## 15. Variante opcional: números sin orden

También puede implementarse como variante una modalidad en la que los jugadores no están obligados a colocar sus números en orden.

En esa variante, cada jugador puede colocar cualquiera de sus números disponibles en cada turno.

Esta modalidad **no debe ser la regla predeterminada**.

---

## 16. Recomendaciones UX

La interfaz debería mostrar claramente:

- de quién es el turno;
- qué número debe colocar el jugador;
- qué posiciones están disponibles;
- los números de cada jugador;
- el historial de movimientos;
- y, al terminar, cuál es el Agujero Negro.

Después de finalizar la partida, conviene mostrar visualmente:

- el Agujero Negro;
- las posiciones destruidas;
- los números supervivientes;
- la puntuación de cada jugador;
- el ganador.

También sería útil permitir:

- `Nueva partida`
- `Deshacer` durante el desarrollo, si se desea;
- `Reiniciar`
- una explicación de las reglas.

---

## 17. Criterios de aceptación

Una implementación correcta debe permitir jugar una partida completa sin intervención manual sobre las reglas.

### Partida normal

1. El tablero comienza con 21 posiciones vacías.
2. Jugador 1 coloca `1`.
3. Jugador 2 coloca `1`.
4. Se alternan los jugadores.
5. Cada jugador coloca `1..10` en orden.
6. Se ocupan exactamente 20 posiciones.
7. Queda exactamente una posición vacía.
8. Esa posición se convierte en el Agujero Negro.
9. Se eliminan sus vecinos.
10. Se calculan las dos puntuaciones.
11. Se anuncia el ganador.

### Invariantes

En cualquier momento:

```text
occupiedCells <= 20
```

Para cada jugador:

```text
nextValue >= 1
nextValue <= 10
```

Al finalizar:

```text
occupiedCells === 20
emptyCells === 1
```

Y:

```text
score1 + score2
```

debe ser igual a la suma de todos los números que no fueron eliminados.

---

## 18. Nota sobre reglas y fuente

Estas instrucciones están basadas en la descripción publicada del juego **Black Hole**, asociado al diseñador belga **Walter Joris**, y contrastadas con otras descripciones del juego.

Para el desarrollo del sitio, estas reglas deben considerarse la **especificación funcional del juego**. Si el post de Instagram utilizado como referencia contiene una diferencia específica —por ejemplo, una definición distinta de adyacencia, puntuación o turnos— esa diferencia debe prevalecer para reproducir exactamente esa versión.
