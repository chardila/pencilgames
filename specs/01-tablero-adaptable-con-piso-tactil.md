# 01 — Tablero adaptable a la pantalla con piso táctil

**Prioridad:** alta · **Depende de:** — · **Afecta a:** los 21 juegos

## Problema

Los tableros se dimensionan con `width: min(92vw, 26rem…36rem)`. Eso los adapta
al **ancho** pero tiene dos consecuencias malas en la tableta de referencia:

1. **Techo en rem.** En una tableta de 800 px de ancho, el tablero de Gomoku se
   queda en 34 rem (544 px) aunque haya sitio de sobra; el resto de la pantalla
   queda vacío y las fichas se ven pequeñas.
2. **Ceguera vertical.** No hay ni un `vh`/`svh` en toda la hoja de estilos. En
   horizontal (960 × 600) el tablero calcula su lado desde el ancho —
   960 × 0.92 = 883, capado a 544 — pero la altura útil, descontando la barra
   superior y el marcador, ronda los 460 px. El tablero no cabe y hay que
   hacer scroll en mitad de la partida.

Y la restricción que no puede perderse al arreglarlo: **el tablero no debe
crecer o encoger hasta que las casillas dejen de ser tocables con el dedo**.

## Objetivo

Que el tablero ocupe el mayor cuadrado que quepa en el espacio real disponible
(ancho **y** alto), sin que ninguna casilla baje nunca de 56 px ni supere un
máximo razonable, en vertical y en horizontal.

## Requisitos

**R1 — Tokens compartidos.** Crear un único bloque de variables, en el
contenedor común `.tablero-juego`, que todos los juegos consuman:

```css
.tablero-juego {
  --gap: 0.25rem;        /* 4px: separación mínima antitoque-erróneo */
  --celda-min: 3.5rem;   /* 56px: piso táctil infantil */
  --celda-max: 5rem;     /* 80px: evita celdas absurdas en pantalla grande */
  --cromo: 8rem;         /* alto de barra superior + marcador + respiro */
  --n: 3;                /* nº de columnas; lo sobrescribe cada juego */
}
```

**R2 — Cálculo del lado.** El tablero se dimensiona desde el mínimo entre el
ancho y el alto disponibles, no desde el ancho solo:

```css
.tablero-juego {
  --ancho-disp: min(94vw, 100%);
  --alto-disp: calc(100svh - var(--cromo));
  --lado: min(var(--ancho-disp), var(--alto-disp));
  --celda: clamp(
    var(--celda-min),
    calc((var(--lado) - (var(--n) - 1) * var(--gap)) / var(--n)),
    var(--celda-max)
  );
}
.tablero {
  display: grid;
  gap: var(--gap);
  grid-template-columns: repeat(var(--n), var(--celda));
}
```

Usar `svh`, **no** `vh`: en Chrome Android la barra de direcciones hace que
`100vh` sea mayor que la pantalla visible y el tablero quedaría cortado por
abajo.

**R3 — El piso gana.** `clamp()` ya garantiza que `--celda` nunca baje de
`--celda-min`. Cuando eso ocurra el tablero será más grande que el hueco, así
que el contenedor debe permitir desplazarlo en lugar de deformarlo:

```css
.tablero-juego { overflow: auto; overscroll-behavior: contain; }
```

Nunca reducir `--celda-min` ni `--gap` para "hacer que quepa".

**R4 — Cada juego declara su `--n`.** En la hoja de cada juego, únicamente:
`.tablero-gomoku { --n: 9; }`, `.tablero-sos { --n: 6; }`, etc. Ver la tabla del
inventario en `00-contexto-compartido.md`. Eliminar los `width: min(Xvw, Yrem)`
que quedan obsoletos.

**R5 — Horizontal: recuperar altura.** En horizontal con poca altura, el
marcador y los nombres deben salir de encima del tablero y colocarse a un
costado, para devolverle al tablero esos ~80 px:

```css
@media (orientation: landscape) and (height <= 46rem) {
  .tablero-juego { --cromo: 3.5rem; }
  .pantalla-juego { display: grid; grid-template-columns: auto 1fr; align-items: center; }
}
```

**R6 — Comportamiento táctil.** En las casillas y demás zonas tocables:

```css
.casilla {
  touch-action: manipulation;          /* mata el retardo de 300ms y el zoom por doble toque */
  -webkit-tap-highlight-color: transparent;
}
```

**R7 — Juegos sin rejilla.** Para los 12 juegos de geometría propia (hex,
triggle, sim, bridg-it, col, conquista, snakes, metasquares, nim, puntos-y-cajas,
agujero-negro, juego-y) aplicar el mismo `--lado` calculado en R2 como tamaño
del SVG o del contenedor, con `aspect-ratio` fijo, y garantizar que **la zona
tocable de cada punto, línea o hexágono mida al menos 48 px** aunque se dibuje
más fina. Caso concreto: en Puntos y cajas las líneas se dibujan de 14 px; la
zona sensible debe ampliarse con `padding` o un pseudo-elemento transparente
hasta 48 px de grosor, sin cambiar el trazo visible.

**R8 — Centrado vertical.** Con el tablero ya ajustado al alto, centrarlo en el
espacio sobrante en lugar de dejarlo pegado arriba con un hueco grande debajo.

## Criterios de aceptación

- [ ] A 800 × 1280 el tablero de Gomoku ocupa notablemente más que los 544 px
      actuales, y la casilla resultante mide entre 56 y 80 px.
- [ ] A 960 × 600 (horizontal) el tablero de Gomoku cabe **entero sin scroll**,
      con el marcador desplazado a un costado.
- [ ] A 600 × 960 ningún juego produce scroll horizontal.
- [ ] En ningún juego, a ninguna de las tres resoluciones de referencia, una
      casilla mide menos de 56 px ni la separación entre casillas baja de 4 px.
- [ ] Un doble toque rápido sobre una casilla no hace zoom en Chrome Android.
- [ ] En Puntos y cajas, tocar cerca de una línea (±20 px) la selecciona.

## Cómo verificar

Con DevTools en modo dispositivo, a 600×960, 800×1280 y 960×600, recorrer los 9
juegos de rejilla y medir en consola:

```js
const t = document.querySelector('.tablero');
const c = t.querySelector('.casilla').getBoundingClientRect();
console.log(getComputedStyle(t).gridTemplateColumns, c.width, c.height,
            document.documentElement.scrollWidth > innerWidth);
```

Después, la prueba que de verdad importa: dejar a los niños jugar una partida
de Gomoku en la tableta y contar cuántas veces tocan la casilla equivocada.

## Fuera de alcance

Cambiar el tamaño de los tableros (Gomoku sigue siendo 9×9; eso es la spec 11 si
alguna vez se hace configurable). Rediseñar la geometría de los juegos SVG.
