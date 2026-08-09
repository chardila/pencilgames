# Nim

## Resumen
Juego matemático clásico para 2 jugadores. Hay varias pilas de objetos. En cada turno, el jugador elige una sola pila y retira uno o más objetos de ella.

## Preparación
Una configuración sencilla:
```text
Pila A: 3
Pila B: 5
Pila C: 7
```

También se puede permitir una configuración personalizada.

## Turno
1. Elegir una pila no vacía.
2. Retirar al menos un objeto.
3. Se pueden retirar tantos como queden en esa pila.
4. No se pueden modificar dos pilas en el mismo turno.

## Fin
En la versión normal:
- quien retira el último objeto gana.

En la versión misère:
- quien retira el último objeto pierde.

La implementación debe hacer explícita la variante seleccionada.

## Modelo
```ts
type GameState = {
  piles: number[]
  currentPlayer: Player
  mode: "normal" | "misere"
}
```

## IA
Nim es excelente candidato para una IA perfecta.

En la versión normal, calcular el XOR de los tamaños de todas las pilas:
```text
nimSum = pile1 XOR pile2 XOR ...
```

Si `nimSum === 0`, la posición es perdedora con juego perfecto; si es distinta de cero, existe una jugada ganadora.

## Fuente
Reglas estándar de Nim. citeturn2search2turn2search4
