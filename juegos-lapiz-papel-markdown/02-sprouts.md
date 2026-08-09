# Sprouts

## Resumen
Juego de lápiz y papel para 2 jugadores (también puede jugarse con más). Empieza con varios puntos. En cada turno se conecta un punto con otro punto, o consigo mismo, mediante una curva y se añade un nuevo punto sobre la curva. El objetivo es ser quien haga la última jugada.

## Preparación
- Dibujar normalmente 2–5 puntos separados.
- Cada punto comienza con 0 conexiones.

## Turno
El jugador:
1. Elige dos puntos existentes; pueden ser el mismo punto.
2. Dibuja una curva entre ellos.
3. La curva no puede cruzar ni tocar otras curvas.
4. La curva no puede pasar por otros puntos.
5. Añade exactamente un nuevo punto en algún lugar de la curva.
6. El nuevo punto queda con dos conexiones si está en una curva entre dos puntos distintos, o con dos conexiones hacia el mismo punto si se hace un lazo.
7. Ningún punto puede tener más de 3 conexiones.

Una jugada desde un punto hacia sí mismo debe dejar el nuevo punto en la curva y respetar el límite de conexiones.

## Fin
Cuando el jugador actual no tiene ninguna jugada legal, pierde. Por tanto, quien hace la última jugada gana.

## Implementación
Este juego es considerablemente más difícil que los juegos de cuadrícula porque las jugadas son geométricas.

Representar:
```ts
type Node = { id: string; x: number; y: number; degree: number }
type Edge = { id: string; from: string; to: string; path: Point[] }
```

Validaciones:
- ausencia de cruces;
- ausencia de contactos no permitidos;
- la curva no atraviesa nodos existentes;
- grado máximo 3.

Para una primera versión web, conviene restringir las curvas a segmentos rectos o polilíneas controladas, aunque eso crea una variante del juego.

## Fuente
Conway y Paterson; las reglas estándar están descritas en la literatura sobre Sprouts. citeturn0search175turn0academia183
