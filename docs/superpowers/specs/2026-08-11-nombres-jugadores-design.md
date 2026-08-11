# Nombres de jugadores — diseño

**Fecha**: 2026-08-11
**Estado**: aprobado

## Resumen

Antes de jugar, se piden los nombres de los dos jugadores en el índice de juegos (`/`). Se guardan en `localStorage` del dispositivo y se reutilizan en cualquier juego que se abra después, para que el indicador de turno y el mensaje de fin de partida digan "Turno de Ana" / "¡Ganó Luis!" en vez de "Jugador 1" / "Jugador 2".

Alcance: los 3 juegos actuales (Tres en raya, Puntos y cajas, Agujero Negro). No incluye persistencia de partidas, cuentas, ni el refactor de "chrome" compartido entre tableros (ver sección "Fuera de alcance").

## Por qué localStorage (no hay otra opción real)

El sitio es un Astro MPA sin transiciones de página ni framework de UI (decisión ya tomada del proyecto): navegar del índice a `/juegos/<slug>` es una carga de página nueva. Cualquier estado en memoria de JS (variable de módulo, etc.) se pierde en esa navegación. `localStorage` es el único mecanismo que sobrevive a la navegación entre páginas y a reabrir el sitio (PWA offline incluido), así que es la única opción viable, no una entre varias.

## Almacenamiento: `src/lib/players.ts`

Nuevo módulo, mismo nivel que `turnIndicator.ts` y `winnerBanner.ts`.

```ts
export interface PlayerNames {
  1: string;
  2: string;
}
```

- `getPlayerNames(): PlayerNames` — lee la clave `pencilgames:jugadores` de `localStorage`, hace `JSON.parse` envuelto en `try/catch`. Devuelve los nombres guardados con `trim()`; si un campo queda vacío después del trim, si falta, o si el parseo falla, cae al default de ese jugador (`"Jugador 1"` / `"Jugador 2"`).
- `savePlayerNames(nombres: PlayerNames): void` — recorta espacios, aplica el mismo fallback a default para campos vacíos, y guarda. Envuelto en `try/catch`: si `localStorage.setItem` falla (modo privado, cuota llena), no lanza — el modal simplemente no persiste esa vez, pero el botón "Guardar" no rompe.
- `hasStoredPlayerNames(): boolean` — `true` si existe la clave en `localStorage` (para decidir si el modal se auto-abre en el índice).

Los nombres son opcionales: un campo vacío usa el default, nunca bloquea el flujo.

## UI en el índice: `src/components/ModalJugadores.astro`

Componente autocontenido (markup + estilos + `<script>`), siguiendo el mismo patrón que `ModalInstrucciones.astro` (modal + botón que lo reabre, todo en un archivo).

- El `<div>` del modal lleva `hidden` en el markup (a diferencia de `ModalInstrucciones`, que se muestra siempre al entrar a un juego). Esto evita un flash del modal en visitas donde ya hay nombres guardados.
- Dos `<input type="text" maxlength="16">`: "Nombre del jugador 1" y "Nombre del jugador 2", precargados vía `getPlayerNames()` al abrir.
- Botón "Guardar": llama `savePlayerNames()` con los valores actuales de los inputs y cierra el modal.
- Botón "Jugadores": visible siempre en el índice (no flotante como el `?` de instrucciones), reabre el modal para editar los nombres en cualquier momento.
- Al cargar el script de la página: si `!hasStoredPlayerNames()`, se quita `hidden` del modal automáticamente (primera visita al sitio).

Se agrega `<ModalJugadores />` a `src/pages/index.astro`. Sin más cambios en esa página.

**Páginas de juego abiertas directo** (bookmark, ícono de PWA, historial): nunca muestran este modal. Simplemente llaman `getPlayerNames()`, que devuelve los defaults si nunca se guardó nada.

## Fix de seguridad: escaping en los helpers compartidos

`turnIndicator.ts` y `winnerBanner.ts` hoy interpolan `etiqueta` / `titulo` / `detalle` directo dentro de un template string que se asigna a `innerHTML`. Es seguro solo porque hoy esos valores son siempre literales del código (`"Jugador 1"`, `"✕"`). En cuanto `etiqueta`/`titulo` puede ser un nombre escrito por un niño, cualquier `<`, `&` u otro carácter de markup rompe el render o inyecta HTML/script.

Fix (una vez, en los dos helpers compartidos — no en los `Board.astro`):

- Construir el esqueleto estático vía `innerHTML` (o `createElement`) sin interpolar las variables dinámicas ahí.
- Asignar `etiqueta`, `titulo` y `detalle` a los nodos correspondientes vía `textContent`, que escapa automáticamente.

La firma pública de `renderTurnIndicator` / `showWinnerBanner` no cambia — los 3 `Board.astro` siguen llamándolas igual.

## Uso en cada juego

Cada `Board.astro` lee `const nombres = getPlayerNames();` una vez al iniciar su `<script>` (los nombres no cambian durante una partida — para cambiarlos hay que volver al índice, lo cual recarga la página).

**Tres en raya** (mantiene el símbolo junto al nombre, ya que sigue siendo la referencia visual en el tablero):
- Indicador de turno: `` `${nombres[jugador]} (${ETIQUETAS[state.currentPlayer]})` `` → "Turno de Ana (✕)".
- Banner ganador: `` `🎉 ¡Ganó ${nombres[jugador]} (${ETIQUETAS[state.winner]})!` `` → "🎉 ¡Ganó Ana (✕)!".

**Puntos y cajas**:
- Indicador de turno: `etiqueta: nombres[state.currentPlayer]` → "Turno de Ana".
- Detalle de puntuación (cambia de posicional a nombrado): `` `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}` `` (antes: `Puntuación: 3 - 5`).
- Banner ganador: `` `🎉 ¡Ganó ${nombres[ganador]}!` ``, detalle final `` `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}` ``.

**Agujero Negro**:
- Indicador de turno: `etiqueta: nombres[state.currentPlayer]` → "Turno de Ana".
- Detalle de turno se mantiene igual (`Coloca el número N`), no es específico de nombre.
- Banner ganador: `` `🎉 ¡Ganó ${nombres[ganador]}!` ``, detalle final `` `${nombres[1]}: ${state.scores[1]} puntos · ${nombres[2]}: ${state.scores[2]} puntos` ``.

## Testing

`src/lib/players.test.ts` (Vitest). `vitest.config.ts` usa `environment: 'node'` (sin `jsdom`), así que el test define su propio stub en memoria de `localStorage` (objeto con `getItem`/`setItem`/`removeItem` respaldado por un `Map`) asignado a `globalThis.localStorage` en un `beforeEach`, y lo limpia entre casos.

Casos a cubrir:
- Sin nada guardado → `getPlayerNames()` devuelve los defaults.
- Guardar y volver a leer → devuelve los valores guardados, recortados.
- Guardar con un campo vacío/solo espacios → ese campo cae a su default, el otro se guarda normal.
- `localStorage` corrupto (JSON inválido) → `getPlayerNames()` no lanza, devuelve defaults.
- `hasStoredPlayerNames()` refleja correctamente presencia/ausencia de la clave.

Los `Board.astro` no llevan tests nuevos (no tienen hoy — su lógica vive en `engine.ts`, que no cambia). El fix de escaping en `turnIndicator.ts`/`winnerBanner.ts` es difícil de testear con Vitest en `environment: 'node'` (no hay DOM); se verifica manualmente en el navegador con un nombre que incluya `<` o `&` antes de dar la tarea por terminada.

## Fuera de alcance

- Extraer un componente `<TableroJuego>` compartido para el "chrome" (indicador de turno + banner ganador) de los 3 tableros. Ya está anotado en la memoria del proyecto como pendiente para cuando se agregue el 4º juego; esta tarea es demasiado chica para justificarlo ahora.
- Persistencia de partidas en curso, revancha con marcador acumulado entre partidas, cuentas o perfiles de jugador.
- Editar nombres a mitad de una partida sin volver al índice.
