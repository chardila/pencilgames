# 02 — Controles de partida: deshacer, reiniciar, revancha y marcador

**Prioridad:** alta · **Depende de:** 01 (comparte la barra de la pantalla de juego)

## Problema

En la pantalla de juego no existe ningún control. Buscando en el HTML, el CSS y
los scripts de un juego no aparece nada parecido a "reiniciar", "deshacer" ni
"revancha". Los únicos botones son `✏️ Cambiar nombres`, el `?` de reglas y el
`← Juegos` de la barra superior.

Consecuencias reales con dos niños y una tableta:

- Un toque accidental en la casilla equivocada arruina la partida y no hay vuelta
  atrás. Con los dedos, esto pasa constantemente.
- Para jugar la revancha hay que volver a la lista, entrar otra vez al juego y
  atravesar de nuevo el modal de reglas y el de modo de juego (ver spec 03).
- No hay memoria de quién va ganando la tarde.

## Objetivo

Una barra de controles idéntica en los 21 juegos, siempre en el mismo sitio, con
tres acciones grandes, más un marcador acumulado entre partidas.

## Requisitos

**R1 — Barra inferior fija.** Componente compartido `ControlesPartida.astro`,
anclado abajo, con `padding-bottom: env(safe-area-inset-bottom)`. Tres botones
de al menos 56 px de alto:

| Botón | Texto | Comportamiento |
|---|---|---|
| ↩︎ | Deshacer | Revierte la última jugada y devuelve el turno |
| ↻ | Reiniciar | Vacía el tablero, conserva jugadores y marcador |
| ← | Juegos | Vuelve a la lista |

Los tres en el mismo orden y posición en todos los juegos: se aprende una vez.

**R2 — Deshacer.** Cada juego mantiene una pila de estados. Basta con apilar una
copia del estado antes de aplicar cada jugada (`structuredClone`). Profundidad
mínima: 10 jugadas. El botón se deshabilita (atenuado, no oculto) cuando la pila
está vacía.

Ojo con los juegos donde una jugada encadena efectos: Puntos y cajas (cerrar una
caja da turno extra), Estampida (multiplicación de fichas), Snakes. Deshacer
debe revertir la jugada **completa**, incluidos el turno y la puntuación, no solo
la última marca en el tablero. Guardar el estado entero, no un diff.

**R3 — Confirmación solo donde duele.** Reiniciar pide confirmación
("¿Empezar de nuevo?" / Sí · No) porque es destructivo. Deshacer no pide nada.

**R4 — Marcador entre partidas.** Contador de partidas ganadas por jugador,
visible junto a los nombres: `Carlos 2 · Simón 1`. Se incrementa al terminar una
partida, sobrevive a Reiniciar y a la revancha, se reinicia solo al cambiar los
nombres o al salir a la lista de juegos. Persistir en
`pencilgames:marcador:<slug>`.

**R5 — Pantalla de fin de partida.** Al terminar, el banner de ganador (ya existe
`.banner-ganador`) debe ofrecer dos acciones grandes: **Revancha** (misma pareja,
tablero limpio, sin pasar por ningún modal) y **Otro juego**. Hoy el banner no
lleva ninguna acción.

**R6 — Anuncio accesible.** Los cambios de estado provocados por estos botones
se anuncian en la región `role="status"` que ya existe: "Jugada deshecha",
"Partida reiniciada".

## Criterios de aceptación

- [ ] Los tres botones aparecen, en el mismo sitio, en los 21 juegos.
- [ ] Deshacer revierte correctamente una jugada en Puntos y cajas que cerró una
      caja: vuelven la línea, el punto y el turno.
- [ ] Deshacer diez veces seguidas deja el tablero en el estado de diez jugadas
      atrás; a la undécima el botón está deshabilitado.
- [ ] Reiniciar pide confirmación y conserva el marcador acumulado.
- [ ] Terminar una partida y pulsar Revancha lleva al tablero limpio sin mostrar
      ningún modal.
- [ ] La barra no tapa el tablero en ninguna de las tres resoluciones de
      referencia (ajustar `--cromo` de la spec 01).

## Fuera de alcance

Rehacer (redo). Historial navegable de la partida. Deshacer en partidas por
internet — en ese modo el botón se oculta, o se implementa como petición al rival
en una spec posterior.
