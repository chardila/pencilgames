# 06 — Persistir la partida en curso

**Prioridad:** media · **Depende de:** 02 (comparte la representación del estado)

## Problema

`localStorage` solo contiene `pencilgames:jugadores` y `pencilgames:mi-nombre`.
El estado del tablero vive únicamente en memoria. Si la tableta se bloquea, si
alguien recarga sin querer, si Chrome descarga la pestaña por falta de memoria —
cosa habitual en una tableta económica — la partida desaparece.

## Objetivo

Que cerrar y volver a abrir la aplicación retome la partida exactamente donde
estaba.

## Requisitos

**R1 — Serializar tras cada jugada.** Guardar en
`pencilgames:partida:<slug>` un objeto con: tablero, turno, puntuaciones,
nombres, pila de deshacer (spec 02) y marca de tiempo.

**R2 — Estado, no DOM.** Serializar la estructura de datos del juego, nunca el
HTML del tablero. Cada juego expone `serializar()` y `restaurar(estado)`; el
contenedor común se encarga de leer y escribir.

**R3 — Restaurar al entrar.** Al abrir un juego que tiene partida guardada
**sin terminar**, ofrecer `Continuar` / `Empezar de nuevo`. No restaurar en
silencio: si los niños querían empezar de cero, encontrarse el tablero a medias
confunde más de lo que ayuda.

**R4 — Caducidad.** Descartar partidas de más de 24 h. Un tablero de anteayer no
le interesa a nadie y dispara el diálogo de R3 sin motivo.

**R5 — Limpiar al terminar.** Al acabar la partida, borrar la entrada. El
marcador acumulado (spec 02) vive en su propia clave y no se toca.

**R6 — Versionado.** Incluir `v: 1` en el objeto guardado y descartar lo que no
coincida, para que un cambio futuro en la estructura del tablero no restaure
basura.

**R7 — Escribir sin bloquear.** `localStorage` es síncrono. Escribir en un
`requestIdleCallback` o con un `debounce` corto para no añadir latencia al toque.

## Criterios de aceptación

- [ ] Jugar cinco movimientos en Gomoku, recargar, elegir `Continuar`: tablero,
      turno y marcador idénticos.
- [ ] Elegir `Empezar de nuevo` borra la partida guardada.
- [ ] Terminar una partida y recargar no ofrece continuar nada.
- [ ] Una entrada guardada hace 25 h se ignora.
- [ ] Una entrada con `v: 0` se descarta sin romper la aplicación.

## Fuera de alcance

Sincronizar entre dispositivos. Partidas por internet (ya tienen su propio
estado en el servidor).
