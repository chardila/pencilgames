# 00 — Contexto compartido (leer antes de cualquier spec)

Este archivo no es una tarea. Es el contexto que todas las demás specs dan por
sabido. Si abres una sesión de Claude Code para trabajar en `NN-*.md`, pásale
también este archivo.

## Proyecto

Pencilgames — juegos clásicos de lápiz y papel para jugar en familia, en una
sola tableta. Sitio Astro desplegado en `https://games.cardila.com`.
21 juegos. Idioma: español. PWA instalable (`manifest.webmanifest`,
`display: standalone`, service worker registrado).

## Dispositivo de referencia

Los niños juegan en una **tableta Android de 10" de gama económica**, con los
dedos. Ese es el objetivo de diseño, no un navegador de escritorio.

| Caso | Ancho × alto CSS px | Notas |
|---|---|---|
| Mínimo garantizado (vertical) | 600 × 960 | Tabletas económicas con dpr ~1.6 |
| Común (vertical) | 800 × 1280 | Samsung Tab A, Lenovo Tab |
| Mínimo garantizado (horizontal) | 960 × 600 | **El caso más exigente: poca altura** |

Regla: cualquier cambio debe verificarse a **600×960** y a **960×600**. Si algo
solo se ve bien a 1024 px o más, no sirve.

## Restricción táctil (no negociable)

El objetivo no es "que el tablero sea grande", es **que un dedo infantil acierte
la casilla al primer intento**. Un tablero que crece hasta llenar la pantalla
pero con casillas que se tocan entre sí produce más errores, no menos.

- Piso absoluto de cualquier zona tocable: **48 px** (Material Design).
- Objetivo para casillas de tablero: **56 px**.
- Separación visual mínima entre casillas: **4 px**. El espacio vacío entre
  celdas es lo que evita el toque equivocado; no lo elimines para ganar tamaño.
- Si el espacio disponible no permite el piso de 56 px, **gana el piso** y el
  tablero desborda con scroll. Nunca al revés.

## Estado real del código (verificado el 2026-09-20)

Comprobado leyendo el DOM en producción y la hoja
`/_astro/_slug_.<hash>.css` (≈45 KB), no por suposición:

- Los tableros **sí** son elásticos en ancho: el patrón es
  `width: min(92vw, 26rem)` … `min(94vw, 36rem)` según el juego, con rejillas
  `repeat(N, 1fr)` y `minmax()`. No hay anchos de celda fijos en px.
- **No hay ningún término vertical.** No aparece `vh`, `svh` ni `dvh` en toda la
  hoja. El tablero ignora la altura de la pantalla.
- Solo hay 3 media queries: `(width <= 28rem)`, `(width <= 30rem)` y
  `(prefers-reduced-motion: reduce)`. No hay nada para tableta ni para
  orientación horizontal.
- Sí hay animaciones (8 `@keyframes`: `badgePopIn`, `drawLine`, `hex-pulso`,
  `pulse-halo`, `pulse-triangle`, `triggle-pulso`, `snakes-pulso`, `y-pulso`),
  9 reglas `:hover` y 7 `:focus-visible`.
- Accesibilidad base correcta: `aria-label` por casilla ("Fila 1, columna 1"),
  región `role="status" aria-live="polite"` que anuncia el turno, jugadores
  diferenciados por color **y** forma (● / ▲), objetivos táctiles ≥ 44 px.
- `localStorage` solo guarda `pencilgames:jugadores` y `pencilgames:mi-nombre`.
  No se guarda la partida, ni si ya se vieron las reglas, ni el modo de juego.
- No existe en ninguna parte del HTML, CSS ni JS un botón de reiniciar,
  deshacer o revancha.

## Inventario de tableros

Juegos con rejilla de casillas (`.casilla`):

| Juego | Casillas | Rejilla |
|---|---|---|
| gomoku | 81 | 9 × 9 ← **peor caso** |
| battleship | 64 | 8 × 8 |
| domineering | 64 | 8 × 8 |
| estampida | 64 | 8 × 8 |
| obstruccion | 36 | 6 × 6 |
| sos | 36 | 6 × 6 |
| chomp | 28 | 7 × 4 |
| notakto | 27 | 3 tableros de 3 × 3 |
| tres-en-raya | 9 | 3 × 3 |

Juegos con geometría propia (SVG o rejilla mixta), que necesitan el mismo
tratamiento pero adaptado: `agujero-negro`, `bridg-it`, `col`, `conquista`,
`hex`, `juego-y`, `metasquares`, `nim`, `puntos-y-cajas`, `sim`, `snakes`,
`triggle`.

## Convenciones para todas las specs

- No introducir dependencias nuevas. Astro + CSS + TS vanilla.
- Todo texto de interfaz en español, tuteando al niño.
- Cualquier animación nueva va envuelta en
  `@media (prefers-reduced-motion: reduce)`.
- No romper lo que ya funciona en accesibilidad: `aria-label`, `role="status"`,
  color + forma, objetivos ≥ 44 px.
- Preferir variables CSS en un único sitio compartido sobre valores repetidos
  juego por juego. Con 21 juegos, cualquier constante duplicada se desincroniza.
