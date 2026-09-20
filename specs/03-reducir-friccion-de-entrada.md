# 03 — Reducir la fricción de entrada al juego

**Prioridad:** alta · **Depende de:** —

## Problema

Para empezar a jugar hay que atravesar dos modales encadenados:

1. `Cómo se juega <juego>` con las reglas y un botón `¡Jugar!`
2. `¿Cómo van a jugar?` con `📱 Misma tableta` / `🌐 Por internet`

Y vuelven a aparecer **cada vez**, incluso la décima vez que se entra al mismo
juego. En `localStorage` solo hay `pencilgames:jugadores` y
`pencilgames:mi-nombre`: no se guarda ni que ya se vieron las reglas ni el modo
elegido. Para dos niños que llevan meses jugando Tres en raya, son dos peajes
por partida.

## Objetivo

Que la segunda vez que se entra a un juego se llegue al tablero directamente,
sin perder el acceso a las reglas ni la posibilidad de jugar por internet.

## Requisitos

**R1 — Recordar reglas vistas.** Al pulsar `¡Jugar!`, guardar el slug en
`pencilgames:reglas-vistas` (array de slugs). Si el slug ya está, no mostrar el
modal de reglas al entrar.

**R2 — Las reglas siguen a un toque.** El botón flotante `?`
(`.modal-instrucciones__reabrir`) ya existe y reabre el modal. Debe quedarse, y
ser el camino para releer las reglas. Comprobar que es visible y tocable en las
tres resoluciones de referencia.

**R3 — Recordar el modo de juego.** Guardar la última elección en
`pencilgames:modo` y, si existe, saltar el modal `¿Cómo van a jugar?`. Por
defecto, si no hay nada guardado, **`Misma tableta`** es lo que se usa el 95 % de
las veces, así que podría entrarse directo a ese modo la primera vez también.

**R4 — Cambiar de modo sin dar la vuelta.** Como el modal deja de aparecer, hace
falta una forma de llegar a "Por internet": una entrada en la barra superior
(junto a `✏️ Cambiar nombres`) o dentro del modal de reglas. Que sea
descubrible, no escondida.

**R5 — Primera vez intacta.** Un dispositivo sin `localStorage` previo debe ver
exactamente el recorrido de hoy: reglas → modo → tablero. El atajo es para quien
ya pasó por ahí.

**R6 — Poder volver a ver las reglas al entrar.** Dentro del modal de reglas,
una casilla "No volver a mostrar" marcada por defecto, por si alguien prefiere
el comportamiento antiguo. Alternativamente, un ajuste global; no complicar.

## Criterios de aceptación

- [ ] Con `localStorage` vacío, entrar a Gomoku muestra reglas y modo.
- [ ] Al volver a entrar, se llega al tablero sin ningún modal.
- [ ] El botón `?` sigue abriendo las reglas en cualquier momento.
- [ ] Existe un camino visible a "Jugar por internet" sin borrar datos del
      navegador.
- [ ] Borrar `localStorage` restaura el recorrido completo de primera vez.

## Fuera de alcance

Rediseñar el contenido de las reglas. El flujo de sala remota (crear sala,
unirse con código) se queda como está.
