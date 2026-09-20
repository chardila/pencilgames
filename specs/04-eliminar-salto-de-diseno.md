# 04 — Eliminar el salto de diseño durante la partida

**Prioridad:** alta · **Depende de:** 01

## Problema

Reproducido en Puntos y cajas: al cerrar una caja aparece el aviso
`✨ ¡Caja completada! Vuelves a jugar` **encima** del marcador, dentro del flujo
normal del documento. El aviso empuja todo hacia abajo y **el tablero se desplaza
unos 30 px en mitad de la partida**.

En un ratón es una molestia. Con el dedo ya en camino hacia la siguiente casilla,
es un toque en el sitio equivocado — y en un juego sin deshacer (ver spec 02),
un toque equivocado es la partida.

El mismo patrón está en cualquier juego que muestre avisos contextuales: turnos
extra, capturas, jugadas ilegales.

## Objetivo

Que el tablero no se mueva ni un píxel desde que empieza la partida hasta que
termina, pase lo que pase en la interfaz.

## Requisitos

**R1 — Espacio reservado.** La franja de avisos tiene altura fija, reservada
desde el inicio de la partida, vacía cuando no hay nada que decir:

```css
.aviso-partida {
  min-height: 2.25rem;   /* el alto de un aviso de una línea */
  display: grid;
  place-items: center;
}
```

Nada de `display: none` ↔ `display: block` en un elemento que esté en el flujo
por encima del tablero.

**R2 — Avisos de dos líneas.** Si algún aviso puede ocupar dos líneas en 600 px
de ancho, o se acorta el texto para que nunca lo haga, o el contenedor se
superpone (`position: absolute`) en vez de reservar espacio. Revisar los textos
de todos los juegos a 600 px.

**R3 — Aparición sin desplazamiento.** El aviso entra con opacidad y una
traslación mínima dentro de su espacio reservado, nunca cambiando la altura del
contenedor. Envolver en `@media (prefers-reduced-motion: reduce)`.

**R4 — Auditoría del resto.** Revisar los 21 juegos buscando cualquier otro
elemento que aparezca o desaparezca por encima del tablero: banners de turno
extra, mensajes de jugada inválida, el marcador cuando cambia de una a dos
cifras. El marcador debe reservar ancho para tres dígitos.

**R5 — Anclaje del tablero.** Como refuerzo, el tablero debe posicionarse desde
un contenedor de altura estable (la del `--lado` de la spec 01), no depender de
lo que haya encima.

## Criterios de aceptación

- [ ] En Puntos y cajas, cerrar una caja no mueve el tablero. Verificado
      comparando `document.querySelector('.tablero').getBoundingClientRect().top`
      antes y después: el valor debe ser idéntico.
- [ ] Ningún juego mueve el tablero al cambiar de turno, mostrar un aviso o
      actualizar el marcador.
- [ ] Nada de esto introduce un hueco vacío visible cuando no hay aviso: la
      franja reservada debe verse como parte del respiro del diseño.

## Cómo verificar

Script rápido en consola durante una partida:

```js
const t = document.querySelector('.tablero');
let y = t.getBoundingClientRect().top;
new MutationObserver(() => {
  const n = t.getBoundingClientRect().top;
  if (n !== y) console.warn('SALTO', y, '->', n);
  y = n;
}).observe(document.body, { subtree: true, childList: true, attributes: true });
```

Jugar una partida completa de cada juego con eso puesto. Cero `SALTO` en consola.

## Fuera de alcance

Rediseñar el contenido o el tono de los avisos (eso es la spec 05).
