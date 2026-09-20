# 09 — Feedback táctil y sonoro

**Prioridad:** baja · **Depende de:** 02 (el interruptor vive junto a los controles)

## Problema

La aplicación tiene animaciones — hay ocho `@keyframes` en la hoja de estilos
(`badgePopIn`, `drawLine`, los `pulso` de Hex, Triggle, Snakes y Juego Y,
`pulse-halo`, `pulse-triangle`) — pero **no emite ningún sonido ni vibración**:
cero elementos `<audio>` y ninguna llamada a `navigator.vibrate` en el código.

En una tableta, donde no hay clic físico ni resistencia, el silencio absoluto
hace que una jugada se sienta insegura: no está claro si el toque se registró.
Y el momento de ganar, que es el que se recuerda, pasa sin celebración.

## Objetivo

Confirmar cada jugada con una señal breve y celebrar el final, sin volverse
molesto ni obligatorio.

## Requisitos

**R1 — Vibración.** `navigator.vibrate` está disponible en la tableta de
referencia. Patrones:

| Evento | Patrón |
|---|---|
| Jugada válida | `10` |
| Jugada inválida | `[20, 40, 20]` |
| Punto / caja cerrada | `[15, 30, 15]` |
| Victoria | `[40, 60, 40, 60, 80]` |

Comprobar siempre `'vibrate' in navigator` antes de llamar: en iPad no existe y
no debe lanzar error.

**R2 — Sonidos sintetizados.** Tres o cuatro sonidos cortos (< 200 ms) generados
con `AudioContext` mediante osciladores: toque, error, punto, victoria. Nada de
archivos de audio: cero peso, cero peticiones.

**R3 — Desbloqueo del audio.** Los navegadores móviles exigen un gesto del
usuario para arrancar el `AudioContext`. Crearlo o reanudarlo en el primer toque
real (por ejemplo al pulsar `¡Jugar!`), no al cargar la página.

**R4 — Interruptor visible.** Un botón de sonido (🔊 / 🔇) en la barra superior,
persistido en `pencilgames:sonido`. **Por defecto: activado**, pero un solo toque
debe silenciarlo — la tableta se usa también a la hora de dormir.

**R5 — Celebración de victoria.** Además del banner, una animación corta: la
línea ganadora se dibuja y pulsa (reutilizar `drawLine`), y un confeti ligero
en canvas de un par de segundos, sin librerías. Que dure poco: los niños van a
querer la revancha inmediata (spec 02, R5).

**R6 — Respetar `prefers-reduced-motion`.** Sin confeti ni pulsos. La media
query ya existe en la hoja; ampliarla.

**R7 — Sin bloquear el toque.** Sonido y vibración se disparan después de pintar
la jugada, nunca antes. La respuesta visual manda.

## Criterios de aceptación

- [ ] Cada jugada válida produce una vibración muy breve en la tableta Android.
- [ ] Una jugada inválida se siente distinta de una válida.
- [ ] El interruptor silencia sonido y vibración, y aguanta una recarga.
- [ ] En un navegador sin `vibrate` no aparece ningún error en consola.
- [ ] Con `prefers-reduced-motion: reduce` no hay confeti ni pulsos, pero el
      banner de ganador sigue apareciendo.
- [ ] Ninguna jugada se siente más lenta que antes del cambio.

## Fuera de alcance

Música de fondo. Voces. Sonidos distintos por juego.
