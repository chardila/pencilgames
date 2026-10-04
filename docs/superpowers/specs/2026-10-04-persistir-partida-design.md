# Persistir la partida en curso — diseño (spec 06)

Origen: `specs/06-persistir-la-partida.md`. Este documento fija las decisiones
de diseño que esa spec dejaba abiertas. Contexto compartido:
`specs/00-contexto-compartido.md`.

## Objetivo

Que cerrar, recargar o perder la pestaña (Chrome la descarta por memoria en
tabletas económicas) y volver a abrir un juego retome la partida local donde
estaba, ofreciendo `Continuar` / `Empezar de nuevo`.

## Decisiones

- **Alcance:** solo modo local. En remoto la partida vive en el rival y se
  resincroniza sola; nunca se guarda ni se restaura, y conectar un canal
  remoto borra la entrada local.
- **Los 21 juegos en un solo PR:** el cambio es uniforme.
- **Formato por juego = snapshot del deshacer (spec 02).** Lo que cada juego ya
  pasa a `guardarParaDeshacer` y recibe en `onDeshacer` es su estado completo y
  restaurable (p. ej. `{state, repiteTurno}` en Conquista, `{state,
  flotaPrevia, listoParaColocar, handoffPendiente}` en Batalla Naval). Se
  reutiliza: `onDeshacer` actúa como `restaurar`, y se añade un único callback
  `obtenerSnapshot`. Se descarta el par `serializar()/restaurar()` de la spec
  06 original porque crearía un segundo formato por juego que se
  desincronizaría del deshacer. Se descarta reproducir movimientos porque en
  local no hay registro y la colocación secreta de Batalla Naval no es
  reproducible.
- **Entrada:** el diálogo Continuar / Empezar de nuevo va **antes** de los
  modales de reglas y modo (spec 03).
- **Marcador:** no se toca; vive en `pencilgames:marcador:<slug>`.

## Componentes

### 1. `src/lib/partidaGuardada.ts` (puro, sin DOM)

Clave `pencilgames:partida:<slug>`, valor
`{ v: 1, ts: number, nombres: {1,2}, snapshot: unknown, pila: unknown[] }`.

- `guardarPartida(slug, datos)`, `leerPartida(slug)`, `borrarPartida(slug)`,
  `hayPartidaGuardada(slug)`.
- `leerPartida` devuelve `null` y **borra la entrada** si: JSON corrupto, `v`
  distinto de 1, forma inválida, o `ts` de hace más de 24 h (R4, R6).
- Todo en `try/catch` silencioso (modo privado, cuota llena), mismo patrón que
  `marcador.ts` y `entrada.ts`.
- `hayPartidaGuardada` usa `leerPartida`, así que una entrada caducada nunca
  dispara el diálogo.

### 2. `src/lib/gameSession.ts`

Config nuevo: `obtenerSnapshot?: () => unknown`. Sin él, el juego no persiste.

- **Cuándo guarda:** en `mostrarTurno` (cada juego lo llama en cada render
  mientras la partida sigue), y **solo si la pila de deshacer tiene ≥ 1
  jugada**. Así el tablero inicial intacto no genera un diálogo vacío. Si la
  pila queda vacía (deshacer hasta el inicio) se borra la entrada.
- **Cuándo borra:** en `mostrarFinDeJuego` (R5), en `reiniciar`, y al conectar
  un canal remoto.
- **Cómo escribe (R7):** debounce con `requestIdleCallback` (respaldo
  `setTimeout`). Además fuerza escritura inmediata en `visibilitychange`
  (oculta) y `pagehide`: es el caso real de pestaña descartada, y un debounce
  pendiente perdería la última jugada.
- **Modo remoto:** `miAsiento !== null` desactiva guardar.
- **Restaurar:** escucha el evento `partida-restaurar`. Lee la entrada,
  aplica los nombres guardados, repone la pila y llama
  `config.onDeshacer(snapshot)` (que ya hace el render). Si la lectura falla,
  no hace nada (el juego queda en su estado inicial).
- `destruir()` quita los nuevos listeners y cancela la escritura pendiente.

### 3. `src/components/ModalContinuarPartida.astro`

Diálogo (`role="dialog"`, `aria-modal`, botones ≥ 56 px, texto en español
tuteando): «Tienes una partida a medias» · **Continuar** · **Empezar de
nuevo**.

- `ModalInstrucciones`, si no está en el flujo `?sala=`, comprueba
  `hayPartidaGuardada(slug)` antes de decidir sobre las reglas. Con partida
  guardada muestra este diálogo en lugar de las reglas.
- **Continuar:** `guardarModo('local')`, dispara `modo-elegido-local` y luego
  `partida-restaurar`. Salta reglas y modo.
- **Empezar de nuevo:** `borrarPartida(slug)` y sigue el flujo normal
  (reglas → modo).
- Los eventos se disparan tras `alTerminarDeCargarScripts` (issue #61), para
  que los demás módulos ya tengan sus listeners.

### 4. Los 21 `Board.astro`

Cada juego añade `obtenerSnapshot` devolviendo exactamente lo que pasa a
`guardarParaDeshacer`. Sin otros cambios por juego.

## Casos límite aceptados

- Batalla Naval: la fase de colocación, antes de la primera jugada (pila
  vacía), no se guarda.
- Cambiar nombres a mitad de partida: se guardan los últimos.
- `localStorage` no disponible: la persistencia no funciona, el juego sí.

## Pruebas

- `partidaGuardada.test.ts`: ida y vuelta, `v: 0` descartado, 25 h descartado
  y borrado, JSON corrupto, forma inválida, cuota llena.
- `gameSession.test.ts` (jsdom): guarda tras una jugada; no guarda con pila
  vacía; borra al terminar, al reiniciar y al deshacer hasta vacío; en remoto
  no guarda; `partida-restaurar` repone snapshot, pila y nombres; fuerza
  escritura en `pagehide`.
- Test que recorre los 21 motores: el snapshot inicial sobrevive a
  `JSON.stringify` → `JSON.parse` y queda igual (más estricto que
  `structuredClone`, porque `localStorage` guarda JSON: `Map`, `Set` y
  `undefined` se pierden).
- Verificación manual con Chrome headless a 600×960 y 960×600: 5 jugadas en
  Gomoku, recargar, Continuar → tablero, turno y marcador idénticos.

## Criterios de aceptación

- [ ] Cinco jugadas en Gomoku, recargar, `Continuar`: tablero, turno y marcador
      idénticos.
- [ ] `Empezar de nuevo` borra la partida guardada y sigue el flujo normal.
- [ ] Terminar una partida y recargar no ofrece continuar nada.
- [ ] Una entrada guardada hace 25 h se ignora.
- [ ] Una entrada con `v: 0` se descarta sin romper la aplicación.
- [ ] En modo remoto no se guarda ni se ofrece nada.
- [ ] Los 21 juegos guardan y restauran (test automático de ida y vuelta JSON).

## Fuera de alcance

Sincronizar entre dispositivos. Partidas por internet. Guardar la fase de
colocación de Batalla Naval antes de la primera jugada.
