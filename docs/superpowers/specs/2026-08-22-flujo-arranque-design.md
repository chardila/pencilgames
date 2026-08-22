# Flujo de arranque de partida — Diseño

**Fecha**: 2026-08-22
**Estado**: Aprobado, pendiente de plan de implementación

## 1. Propósito

El flujo actual para arrancar una partida no es intuitivo, en particular para chicos (6-8 años):

- El modal "¿Quién juega?" (`ModalJugadores`) se auto-abre en el índice (`/`) apenas se entra al sitio, **antes** de elegir un juego y **antes** de decidir si se juega en la misma tableta o por internet. Pide dos nombres asumiendo pasa-y-juega, aunque la intención real sea jugar por internet.
- "Crear sala" / "Unirse con código" (`ModalJuegoRemoto`) vive como un botón secundario en el header de la página del juego, mezclado con el resto de los controles — no es un paso explícito del arranque.
- Hay dos sistemas de nombre paralelos: el roster local fijo (`players.ts`, Jugador 1/Jugador 2) y el nombre remoto (`miNombre.ts`), pedido hoy con `window.prompt` nativo — sin estilo, chico, poco táctil.

Este diseño reordena el arranque en un único camino explícito por juego: **Instrucciones → ¿Cómo van a jugar? → (según elección) tablero**, y reemplaza el `window.prompt` remoto por un campo de texto normal.

## 2. Alcance

**Incluido**: el flujo de arranque de los 3 juegos existentes (Tres en raya, Puntos y cajas, Agujero Negro) — desde que se toca una tarjeta en el índice hasta que el tablero queda jugable, en ambos modos.

**Explícitamente fuera de alcance** (ver sección 8): cualquier otra revisión de usabilidad del sitio (navegación, textos de instrucciones, UI dentro del tablero durante la partida), edición de nombres a mitad de partida, extracción de un componente `<TableroJuego>` compartido, nuevos juegos.

## 3. Flujo objetivo

```
Índice (/)
  │ (buscador + grilla de juegos, sin modales)
  ▼
Tocás una tarjeta de juego
  ▼
/juegos/<slug>
  │
  ▼
Instrucciones (ModalInstrucciones, sin cambios) → "¡Jugar!"
  ▼
¿Cómo van a jugar?  (ModalModoJuego, nuevo)
  │
  ├── 📱 Misma tableta ──────────────────────┐
  │                                          ▼
  │                          Tablero directo, con nombres guardados
  │                          o "Jugador 1"/"Jugador 2" por defecto.
  │                          "✏️ Cambiar nombres" siempre visible.
  │
  └── 🌐 Por internet ──────────┐
                                 ▼
                  ModalJuegoRemoto (extendido)
                  "Tu nombre": [________]
                  [ Crear sala ]  [ Unirse con código ]
                                 │
                          (crear/unirse → esperando rival)
                                 │
                    evento `canal-remoto-listo` (sin cambios)
                                 ▼
                              Tablero
```

**Deep-link `?sala=CODIGO`** (compartir un link de sala): salta Instrucciones y ModoJuego directo al paso "Unirse" de `ModalJuegoRemoto` con el código precargado — mismo atajo que existe hoy, adaptado al nuevo estado inicial (ver sección 5).

## 4. Cambios por componente

### `src/pages/index.astro`

Se le saca `<ModalJugadores />` y toda mención a él. Queda solo buscador + grilla, sin modales ni auto-apertura.

### `src/components/ModalModoJuego.astro` (nuevo)

Sigue el mismo patrón autocontenido que `ModalInstrucciones`/`ModalJugadores`/`ModalJuegoRemoto` (markup + estilos + `<script>` en un archivo). Markup mínimo:

- Título "¿Cómo van a jugar?".
- Dos botones: "📱 Misma tableta" y "🌐 Por internet".
- Sin paso de "cerrar/cancelar" propio — no hay a dónde volver salvo "← Juegos" del header, que ya está siempre visible.

Comportamiento:
- Al hacer click en "📱 Misma tableta": se oculta este modal, se muestra el contenedor del tablero (sección siguiente) y el botón "✏️ Cambiar nombres".
- Al hacer click en "🌐 Por internet": se oculta este modal y se llama a la función exportada por `ModalJuegoRemoto` para abrirse (sección siguiente) — no se muestra el tablero todavía.
- Expone una función para mostrarse (usada por la orquestación de `[slug].astro` y, en su caso, para volver a este paso desde "Cancelar" en `ModalJuegoRemoto`).

### `src/components/ModalJuegoRemoto.astro`

- **Se saca** el botón siempre-visible "🌐 Jugar por internet abrir" del header. La apertura pasa a ser programática: se expone una función (ej. evento custom `abrir-modal-remoto` o export directo si el patrón del proyecto lo permite dentro de un `<script>` de Astro — a definir en el plan de implementación con el mecanismo más simple posible) invocada por `ModalModoJuego` y por el manejo del deep-link `?sala=`.
- **Se agrega** un campo `<input type="text" maxlength="16">` "Tu nombre" al principio del paso `modal-remoto-elegir` (antes de los botones "Crear sala"/"Unirse con código"). Se precarga con `getMiNombre()` (sin cambios en `miNombre.ts` — ya trae el fallback al nombre local personalizado).
- **Se elimina** `pedirMiNombreSiHaceFalta()` y sus dos usos (`window.prompt`). En su lugar, los handlers de "Crear sala" y "Confirmar unirse" leen el valor actual del input (con el mismo fallback a `'Jugador'` si queda vacío tras `trim()`) y llaman `setMiNombre()` con ese valor antes de proceder.
- **Error `nombre-duplicado`**: hoy dispara un segundo `window.prompt` pidiendo un nombre nuevo. Pasa a mostrarse inline con el mismo elemento `#modal-remoto-error` ya existente ("Ese nombre ya lo tiene el otro jugador, escribí uno distinto arriba e intentá de nuevo"), sin tocar el input por script — el usuario lo edita ahí mismo y vuelve a tocar "Unirse".
- **"Cancelar"**: en vez de solo ocultar el modal (dejando la pantalla en blanco, ya que el tablero ahora arranca oculto — sección 5), vuelve a mostrar `ModalModoJuego`. Sigue cerrando el canal activo si lo había (`canalActivo?.cerrar()`), sin cambios ahí.
- El resto del componente (pasos "unirse"/"esperando", `crearSala`/`unirseASala`, copiar link, evento `canal-remoto-listo`) no cambia.

### `src/components/ModalJugadores.astro`

- Se saca el bloque `if (!hasStoredPlayerNames()) { modal.hidden = false; }`. El resto (inputs, validación de colisión, guardado) no cambia.
- Se renombra visualmente el botón "👤 Jugadores" a "✏️ Cambiar nombres" para que coincida con su nuevo rol (edición explícita, no configuración inicial obligatoria).
- Se instancia en `src/pages/[slug].astro` en vez de en `index.astro`.

### `src/pages/juegos/[slug].astro`

- Header: se saca `<ModalJuegoRemoto />` de ahí como elemento visible — sigue estando en la página (su modal y su script), pero ya no aporta un botón al header.
- Se agrega `<ModalModoJuego />` y `<ModalJugadores />` a la página.
- El `<Board />` se envuelve en un contenedor propio, ej. `<div id="contenedor-tablero" hidden><Board /></div>`, para poder ocultarlo/mostrarlo sin tocar cada `Board.astro` individual (los 3 tableros ya usan clases raíz distintas entre sí, sin un wrapper común).
- `<ModalJugadores />` (ahora "✏️ Cambiar nombres") se coloca junto al contenedor del tablero, visible solo en modo local: se muestra al elegir "📱 Misma tableta", permanece oculto mientras se juega por internet (los nombres remotos vienen del mensaje `"nombre"` de cada peer, no del roster local).
- **Orquestación** (script inline o módulo compartido en la página):
  1. Al cargar: `ModalInstrucciones` visible (sin cambios respecto a hoy), `ModalModoJuego` oculto, `#contenedor-tablero` oculto, botón "Cambiar nombres" oculto.
  2. `ModalInstrucciones` "¡Jugar!" → se muestra `ModalModoJuego`.
  3. `ModalModoJuego` "Misma tableta" → se oculta, se muestra `#contenedor-tablero` + "Cambiar nombres".
  4. `ModalModoJuego` "Por internet" → se oculta, se abre `ModalJuegoRemoto`.
  5. Evento `canal-remoto-listo` (sin cambios, disparado por `ModalJuegoRemoto`) → se muestra `#contenedor-tablero` (el botón "Cambiar nombres" se mantiene oculto, modo remoto).
  6. `ModalJuegoRemoto` "Cancelar" → se vuelve a mostrar `ModalModoJuego` (ver sección anterior).

## 5. Deep-link `?sala=CODIGO`

Comportamiento hoy (bottom de `ModalJuegoRemoto.astro`): al detectar el parámetro, oculta `ModalInstrucciones`, precarga el código y abre el modal directo en el paso "unirse".

Se mantiene igual, adaptado al nuevo estado inicial: además de ocultar `ModalInstrucciones`, deja `ModalModoJuego` y `#contenedor-tablero` ocultos (ya lo están por defecto) y abre `ModalJuegoRemoto` directo en "unirse" — sin pasar por instrucciones ni por la elección de modo, porque la intención (unirse a esa sala) ya es explícita en el link.

## 6. Flujo de datos

- **Nombres locales**: mismo storage (`players.ts`, clave `pencilgames:jugadores`). Sin cambios de formato ni de API — solo cambia desde qué página se dispara el modal de edición.
- **Nombre remoto**: mismo storage (`miNombre.ts`, clave `pencilgames:mi-nombre`). Sin cambios de formato ni de API — solo cambia cómo se captura (input en vez de `prompt()`).
- Evento `canal-remoto-listo`: sin cambios en su forma (`detail: { channel, miNombre }`), solo cambia qué listener reacciona (ahora también controla la visibilidad de `#contenedor-tablero`).

## 7. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Campo "Tu nombre" vacío al crear/unirse | Igual que hoy: fallback a `'Jugador'`, no bloquea el envío. |
| Nombre remoto duplicado con el rival | Error inline en `#modal-remoto-error` (ver sección 4), sin `window.prompt`. El usuario edita el campo "Tu nombre" ahí mismo y reintenta. |
| "Cancelar" en `ModalJuegoRemoto` con o sin conexión en curso | Cierra el canal si lo había (sin cambios) y vuelve a `ModalModoJuego`, nunca deja la pantalla sin ningún modal ni tablero visible. |
| `localStorage` no disponible (modo privado, cuota llena) | Sin cambios respecto a hoy en `players.ts`/`miNombre.ts`: no persiste, no rompe el flujo — los inputs simplemente no se precargan la próxima vez. |

## 8. Testing

- `players.ts`, `miNombre.ts`, `sala.ts`, `canalWebRTC.ts`, los 3 `engine.ts`: lógica pura sin cambios de API, tests actuales (Vitest, `environment: 'node'`) siguen valiendo tal cual.
- Este repo no tiene tests de DOM/componentes — la config de Vitest corre en `node`, sin `jsdom` (confirmado en `vitest.config.ts`). La orquestación nueva en `[slug].astro` y el nuevo `ModalModoJuego` se verifican manualmente en los 3 juegos, en ambos modos (local e internet, incluido el deep-link `?sala=`), igual que se verifica hoy el modal de instrucciones — no se agrega infraestructura de testing de UI nueva para esto.
- Verificación manual mínima antes de dar la tarea por terminada, en los 3 juegos:
  1. Índice → tocar juego → instrucciones → "¡Jugar!" → "¿Cómo van a jugar?" visible, tablero no visible todavía.
  2. "Misma tableta" → tablero visible con nombres por defecto o guardados, "Cambiar nombres" visible y funcional.
  3. "Por internet" → "Crear sala" con nombre precargado/editable → código visible → (en otra pestaña/dispositivo) "Unirse con código" → ambos llegan al tablero, sin "Cambiar nombres" visible.
  4. Forzar `nombre-duplicado` (mismo nombre en ambos lados) → error inline, sin `prompt()`, se puede corregir y reintentar.
  5. "Cancelar" desde cualquier paso de `ModalJuegoRemoto` → vuelve a "¿Cómo van a jugar?", no pantalla en blanco.
  6. Link con `?sala=CODIGO` → salta directo a "Unirse" con el código precargado, sin instrucciones ni "¿Cómo van a jugar?".

## 9. No-objetivos

- Cualquier otra revisión de usabilidad del sitio fuera del arranque de partida (navegación general, textos de instrucciones, UI dentro del tablero durante la partida) — queda para una revisión aparte si hace falta.
- Editar nombres locales a mitad de partida sin perder el estado del tablero (hoy y después de este cambio, un cambio de nombre vía "Cambiar nombres" solo se refleja la próxima vez que se cargue un tablero — cada `Board.astro` lee `getPlayerNames()` una única vez al iniciar su script y no vuelve a leerlos durante la partida en curso, esto ya era así antes de este diseño).
- Unificar `players.ts` y `miNombre.ts` en un solo sistema de identidad — el puente actual (`miNombre.ts` cae al nombre local personalizado si existe) ya cubre el caso de uso real y no genera fricción adicional; fusionarlos es una refactorización interna sin impacto de usabilidad, fuera de esta revisión.
- Extracción de un componente `<TableroJuego>` compartido (backlog anotado en diseños previos) — no se toca en este cambio.
- Nuevos juegos — este diseño solo cubre los 3 ya existentes.
