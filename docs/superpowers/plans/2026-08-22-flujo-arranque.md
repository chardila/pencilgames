# Flujo de arranque de partida Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reordenar el arranque de cada juego en un único camino explícito — Instrucciones → "¿Cómo van a jugar?" → tablero (local o por internet) — sacando el modal de nombres del índice y el `window.prompt` del flujo remoto.

**Architecture:** Un componente nuevo, autocontenido (`ModalModoJuego.astro`), se inserta entre las instrucciones y el tablero. Los componentes existentes (`ModalInstrucciones`, `ModalJuegoRemoto`, `ModalJugadores`) siguen siendo autocontenidos (markup + estilos + `<script>` en un archivo) y se comunican entre sí solo por `CustomEvent` en `document` — el mismo patrón que ya usa `canal-remoto-listo`. `[slug].astro` es el único lugar que conoce los elementos de más de un componente (el contenedor del tablero y el botón "Cambiar nombres"), así que ahí vive la orquestación mínima que decide cuándo mostrarlos.

**Tech Stack:** Astro 7 (componentes `.astro` con `<script>` inline, TypeScript estricto), sin librería de UI ni framework de componentes cliente. Vitest para los tests de lógica existentes (sin `jsdom` — no hay tests de DOM en este repo, ver Global Constraints).

**Spec:** `docs/superpowers/specs/2026-08-22-flujo-arranque-design.md`

## Global Constraints

- Cada componente de modal es autocontenido en un solo archivo `.astro` (markup + `<style>` + `<script>`), siguiendo el patrón de `ModalInstrucciones.astro` / `ModalJugadores.astro` / `ModalJuegoRemoto.astro` ya existentes.
- La comunicación entre componentes es **solo** vía `document.dispatchEvent(new CustomEvent(...))` / `document.addEventListener(...)` — nunca imports cruzados de funciones entre `<script>` de distintos componentes (cada `<script>` de Astro es su propio módulo, sin export compartido entre componentes).
- Comentarios y nombres de variables/funciones en español, según el resto del código (`sala`, `nombresColisionan`, `pedirMiNombreSiHaceFalta`, etc.).
- `localStorage` siempre se accede envuelto en `try/catch` (ver `players.ts`/`miNombre.ts`) — no se toca esa capa en este plan, solo dónde se llama.
- Este repo **no tiene tests de DOM/componentes** — `vitest.config.ts` usa `environment: 'node'`, sin `jsdom`. No se agrega infraestructura de testing de UI nueva. La verificación de cada cambio de UI es: `npx astro check` (type-check) + `npm run build` (compila) + verificación manual en `npm run dev`. Los tests automatizados existentes (`npm test`) cubren solo lógica pura (`players.ts`, `miNombre.ts`, `sala.ts`, `canalWebRTC.ts`, los 3 `engine.ts`) y no cambian de API en este plan — deben seguir pasando sin modificación.
- Los 3 tableros (`tres-en-raya`, `puntos-y-cajas`, `agujero-negro`) no se tocan — el contenedor que los oculta/muestra se agrega alrededor de `<Board />` en `[slug].astro`, no dentro de cada `Board.astro`.

---

## Task 1: Limpiar `ModalJugadores` y sacarlo del índice

**Files:**
- Modify: `src/components/ModalJugadores.astro`
- Modify: `src/pages/index.astro`

**Interfaces:**
- Produces: botón `#modal-jugadores-abrir` ahora arranca oculto (`hidden`) y con el texto "✏️ Cambiar nombres" — quien lo muestre más adelante (Task 5) le saca el atributo `hidden`.

- [ ] **Step 1: Sacar el auto-open y ocultar/renombrar el botón en `ModalJugadores.astro`**

En `src/components/ModalJugadores.astro`, cambiar el botón de apertura (línea 28-30):

```astro
<button type="button" id="modal-jugadores-abrir" class="modal-jugadores__abrir" hidden>
  ✏️ Cambiar nombres
</button>
```

Y en el `<script>`, borrar el bloque de auto-apertura (líneas 128-130):

```ts
if (!hasStoredPlayerNames()) {
  modal.hidden = false;
}
```

Como `hasStoredPlayerNames` deja de usarse en este archivo, sacarlo del import (línea 110):

```ts
import { DEFAULTS, getPlayerNames, nombresColisionan, savePlayerNames } from '../lib/players';
```

- [ ] **Step 2: Sacar `ModalJugadores` de `index.astro`**

En `src/pages/index.astro`, borrar el import (línea 4):

```astro
import ModalJugadores from '../components/ModalJugadores.astro';
```

Y borrar el uso (línea 16):

```astro
<ModalJugadores />
```

- [ ] **Step 3: Verificar que compila**

Run: `npx astro check`
Expected: sin errores nuevos (el proyecto ya debería estar limpio de antes).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 4: Verificación manual**

Run: `npm run dev`, abrir `/` en el navegador.
Expected: no aparece ningún modal de nombres al cargar el índice. El buscador y la grilla de juegos se ven igual que antes.

- [ ] **Step 5: Commit**

```bash
git add src/components/ModalJugadores.astro src/pages/index.astro
git commit -m "fix: sacar el modal de nombres del índice, deja de auto-abrirse"
```

---

## Task 2: Nuevo componente `ModalModoJuego`

**Files:**
- Create: `src/components/ModalModoJuego.astro`

**Interfaces:**
- Consumes: evento `instrucciones-cerradas` (sin `detail`, producido en Task 3), evento `modal-remoto-cancelado` (sin `detail`, producido en Task 4).
- Produces: evento `modo-elegido-local` (sin `detail`) al elegir "Misma tableta"; evento `abrir-modal-remoto` (sin `detail`) al elegir "Por internet" (consumido en Task 4).

- [ ] **Step 1: Crear el componente**

Crear `src/components/ModalModoJuego.astro`:

```astro
<div
  id="modal-modo-juego"
  class="modal-modo-juego"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-modo-juego-titulo"
  hidden
>
  <div class="modal-modo-juego__contenido">
    <h2 id="modal-modo-juego-titulo">¿Cómo van a jugar?</h2>
    <button type="button" id="modal-modo-juego-local" class="modal-modo-juego__boton">
      📱 Misma tableta
    </button>
    <button type="button" id="modal-modo-juego-remoto" class="modal-modo-juego__boton">
      🌐 Por internet
    </button>
  </div>
</div>

<style>
  .modal-modo-juego {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing);
    z-index: 20;
  }

  .modal-modo-juego[hidden] {
    display: none;
  }

  .modal-modo-juego__contenido {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    max-width: 24rem;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .modal-modo-juego__boton {
    padding: 0.75rem;
    border: none;
    border-radius: var(--radius);
    background: var(--color-accent);
    font-size: 1.1rem;
    font-weight: 700;
    min-height: var(--tap-target-min);
    min-width: var(--tap-target-min);
  }
</style>

<script>
  const modal = document.getElementById('modal-modo-juego')!;
  const botonLocal = document.getElementById('modal-modo-juego-local')!;
  const botonRemoto = document.getElementById('modal-modo-juego-remoto')!;

  // Se acuerda si ya se eligió modo para no volver a mostrar este paso
  // cuando se reabren las instrucciones a mitad de partida (botón "?" de
  // ModalInstrucciones) y se cierran de nuevo. Solo vuelve a false si el
  // usuario cancela el flujo remoto (modal-remoto-cancelado) y hay que
  // elegir modo otra vez.
  let modoYaElegido = false;

  document.addEventListener('instrucciones-cerradas', () => {
    if (modoYaElegido) return;
    modal.hidden = false;
  });

  document.addEventListener('modal-remoto-cancelado', () => {
    modoYaElegido = false;
    modal.hidden = false;
  });

  botonLocal.addEventListener('click', () => {
    modoYaElegido = true;
    modal.hidden = true;
    document.dispatchEvent(new CustomEvent('modo-elegido-local'));
  });

  botonRemoto.addEventListener('click', () => {
    modoYaElegido = true;
    modal.hidden = true;
    document.dispatchEvent(new CustomEvent('abrir-modal-remoto'));
  });
</script>
```

- [ ] **Step 2: Verificar que compila**

Run: `npx astro check`
Expected: sin errores (el componente todavía no está montado en ninguna página, pero debe tipar bien de forma aislada).

- [ ] **Step 3: Commit**

```bash
git add src/components/ModalModoJuego.astro
git commit -m "feat: nuevo modal '¿Cómo van a jugar?' (sin montar todavía)"
```

---

## Task 3: `ModalInstrucciones` avisa cuando se cierra

**Files:**
- Modify: `src/components/ModalInstrucciones.astro`

**Interfaces:**
- Produces: evento `instrucciones-cerradas` (sin `detail`) cada vez que se cierra el modal de instrucciones (primera vez o reabierto con el botón "?").

- [ ] **Step 1: Dispatch al cerrar**

En `src/components/ModalInstrucciones.astro`, cambiar el listener de `cerrar` (líneas 94-96):

```ts
cerrar.addEventListener('click', () => {
  modal.hidden = true;
  document.dispatchEvent(new CustomEvent('instrucciones-cerradas'));
});
```

- [ ] **Step 2: Verificar que compila**

Run: `npx astro check`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/components/ModalInstrucciones.astro
git commit -m "feat: ModalInstrucciones avisa con un evento cuando se cierra"
```

---

## Task 4: `ModalJuegoRemoto` — nombre por input, sin `window.prompt`, apertura por evento

**Files:**
- Modify: `src/components/ModalJuegoRemoto.astro`

**Interfaces:**
- Consumes: evento `abrir-modal-remoto` (producido en Task 2).
- Produces: evento `modal-remoto-cancelado` (sin `detail`, consumido en Task 2) al tocar "Cancelar". Evento `canal-remoto-listo` sin cambios de forma (`detail: { channel, miNombre }`, ya existía).

- [ ] **Step 1: Sacar el botón de apertura del header y su estilo**

En `src/components/ModalJuegoRemoto.astro`, borrar la línea 51:

```astro
<button type="button" id="modal-remoto-abrir" class="modal-remoto__abrir">🌐 Jugar por internet</button>
```

Y borrar el bloque de estilos `.modal-remoto__abrir` (líneas 153-163):

```css
.modal-remoto__abrir {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border: 1px solid #ddd;
  border-radius: var(--radius);
  background: var(--color-surface);
  font-weight: 700;
  min-height: var(--tap-target-min);
}
```

- [ ] **Step 2: Agregar el campo "Tu nombre" al paso de elegir**

Cambiar el bloque `#modal-remoto-elegir` (líneas 12-17) para incluir el campo antes de los botones:

```astro
<div id="modal-remoto-elegir" class="modal-remoto__paso">
  <label class="modal-remoto__campo-nombre">
    Tu nombre
    <input type="text" id="modal-remoto-input-nombre" maxlength="16" placeholder="Jugador" />
  </label>
  <button type="button" id="modal-remoto-crear" class="modal-remoto__boton">Crear sala</button>
  <button type="button" id="modal-remoto-mostrar-unirse" class="modal-remoto__boton">
    Unirse con código
  </button>
</div>
```

Agregar el estilo del campo (junto a `.modal-remoto__campo`, después de su bloque):

```css
.modal-remoto__campo-nombre {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-weight: 700;
}

.modal-remoto__campo-nombre input {
  padding: 0.75rem;
  font-size: 1rem;
  border-radius: var(--radius);
  border: 1px solid #ddd;
  min-height: var(--tap-target-min);
  font-weight: 400;
}
```

- [ ] **Step 3: Reemplazar `pedirMiNombreSiHaceFalta` por el input**

En el `<script>`, agregar la referencia al nuevo input junto al resto de los `const` (después de la línea de `inputCodigo`):

```ts
const inputNombre = document.getElementById('modal-remoto-input-nombre') as HTMLInputElement;
```

Reemplazar la función `pedirMiNombreSiHaceFalta` (líneas 206-213) por dos funciones:

```ts
function precargarNombre(): void {
  inputNombre.value = getMiNombre() ?? '';
}

function resolverMiNombre(): string {
  const nombre = inputNombre.value.trim() || 'Jugador';
  setMiNombre(nombre);
  return nombre;
}
```

- [ ] **Step 4: Usar `resolverMiNombre()` en vez de `pedirMiNombreSiHaceFalta()`**

En `botonCrear` (línea 242) y en `botonConfirmarUnirse` (línea 263), cambiar:

```ts
const miNombre = resolverMiNombre();
```

- [ ] **Step 5: Reemplazar el segundo `window.prompt` por un error inline**

Cambiar el bloque `nombre-duplicado` dentro del `catch` de `botonConfirmarUnirse` (líneas 278-289):

```ts
if (error instanceof ErrorSala && error.codigo === 'nombre-duplicado') {
  mostrarError('Ese nombre ya lo tiene el otro jugador. Escribí uno distinto arriba y tocá "Unirse" de nuevo.');
} else {
  mostrarError(error instanceof ErrorSala ? error.message : 'No pudimos conectar, intenten de nuevo.');
}
```

- [ ] **Step 6: Reemplazar el trigger de abrir por un listener de evento**

Cambiar el listener de `abrir` (líneas 222-229):

```ts
document.addEventListener('abrir-modal-remoto', () => {
  // Defensivo: si quedara un canal de un intento anterior que no pasó por
  // Cancelar ni por alConectar, se cierra antes de empezar de nuevo.
  canalActivo?.cerrar();
  canalActivo = null;
  mostrarPaso(pasoElegir);
  precargarNombre();
  modal.hidden = false;
});
```

Y borrar la constante `abrir` que quedó sin el elemento (línea 172):

```ts
const abrir = document.getElementById('modal-remoto-abrir')!;
```

- [ ] **Step 7: Avisar cuando se cancela**

Cambiar el listener de `cerrar` (líneas 231-239):

```ts
cerrar.addEventListener('click', () => {
  // Si había una conexión en curso (sala creada/unida pero el rival
  // todavía no llegó), se cierra explícitamente: sin esto, el WebSocket
  // seguía vivo en segundo plano y un rival podía unirse después de que
  // el usuario ya creía haber cancelado.
  canalActivo?.cerrar();
  canalActivo = null;
  modal.hidden = true;
  document.dispatchEvent(new CustomEvent('modal-remoto-cancelado'));
});
```

- [ ] **Step 8: Precargar el nombre también en el deep-link `?sala=`**

En el bloque final del script (líneas 318-325), agregar `precargarNombre()`:

```ts
const parametros = new URLSearchParams(location.search);
const codigoPrellenado = parametros.get('sala');
if (codigoPrellenado) {
  document.getElementById('modal-instrucciones')?.setAttribute('hidden', '');
  inputCodigo.value = codigoPrellenado.toUpperCase();
  precargarNombre();
  mostrarPaso(pasoUnirse);
  modal.hidden = false;
}
```

- [ ] **Step 9: Verificar que compila**

Run: `npx astro check`
Expected: sin errores (en particular, que `abrir` ya no se referencia en ningún lado tras el Step 6).

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 10: Commit**

```bash
git add src/components/ModalJuegoRemoto.astro
git commit -m "fix: pedir el nombre remoto con un input en vez de window.prompt"
```

---

## Task 5: Integrar todo en `[slug].astro` y verificación manual completa

**Files:**
- Modify: `src/pages/juegos/[slug].astro`

**Interfaces:**
- Consumes: evento `modo-elegido-local` (Task 2), evento `canal-remoto-listo` (ya existente, sin cambios de forma).

- [ ] **Step 1: Actualizar imports y quitar el botón remoto del header**

En `src/pages/juegos/[slug].astro`, agregar los imports nuevos junto a los existentes:

```astro
import ModalModoJuego from '../../components/ModalModoJuego.astro';
import ModalJugadores from '../../components/ModalJugadores.astro';
```

`ModalJuegoRemoto` ya está importado — se mantiene el import, solo cambia dónde se renderiza (Step 2).

Sacar `<ModalJuegoRemoto />` del `<header>` (línea 33):

```astro
<header class="cabecera-juego">
  <a href="/" class="cabecera-juego__volver">← Juegos</a>
  <h1 class="cabecera-juego__titulo">{juego.data.title}</h1>
</header>
```

- [ ] **Step 2: Montar los modales nuevos y envolver el tablero**

Reemplazar el bloque después del `</header>` (líneas 35-38):

```astro
<ModalInstrucciones title={juego.data.title}>
  <Content />
</ModalInstrucciones>
<ModalModoJuego />
<ModalJuegoRemoto />
<ModalJugadores />
<div id="contenedor-tablero" hidden>
  <Board />
</div>
```

- [ ] **Step 3: Orquestación — mostrar el tablero y "Cambiar nombres" según el modo**

Agregar un `<script>` nuevo al final del archivo (después del bloque `<style>` existente):

```astro
<script>
  const contenedorTablero = document.getElementById('contenedor-tablero')!;
  const botonCambiarNombres = document.getElementById('modal-jugadores-abrir')!;

  document.addEventListener('modo-elegido-local', () => {
    contenedorTablero.hidden = false;
    botonCambiarNombres.hidden = false;
  });

  document.addEventListener('canal-remoto-listo', () => {
    contenedorTablero.hidden = false;
  });
</script>
```

- [ ] **Step 4: Verificar que compila**

Run: `npx astro check`
Expected: sin errores.

Run: `npm run build`
Expected: build exitoso.

- [ ] **Step 5: Regresión de los tests existentes**

Run: `npm test`
Expected: PASS — ningún test de `players.ts`, `miNombre.ts`, `sala.ts`, `canalWebRTC.ts` ni de los 3 `engine.ts` cambió de comportamiento en este plan.

- [ ] **Step 6: Verificación manual completa (los 3 juegos)**

Run: `npm run dev`, y para cada uno de los 3 juegos (Tres en raya, Puntos y cajas, Agujero Negro) desde `/`:

1. Tocar la tarjeta del juego → aparecen las instrucciones → tocar "¡Jugar!" → aparece "¿Cómo van a jugar?", el tablero **no** es visible todavía.
2. Tocar "📱 Misma tableta" → aparece el tablero con nombres guardados o "Jugador 1"/"Jugador 2" por defecto, y el botón "✏️ Cambiar nombres" visible y funcional (abre el modal de edición, guarda, no rompe la colisión de nombres).
3. Recargar la página, repetir hasta "¿Cómo van a jugar?", tocar "🌐 Por internet" → aparece el campo "Tu nombre" (precargado si ya se jugó antes) y los botones "Crear sala"/"Unirse con código", sin ningún `window.prompt` del navegador.
4. "Crear sala" en una pestaña, "Unirse con código" con ese código en otra pestaña (o dispositivo) → ambas llegan al tablero, sin el botón "Cambiar nombres" visible en modo remoto.
5. Repetir el intento de unirse con el mismo nombre en ambos lados → error inline debajo del formulario, sin `prompt()`, se puede corregir el campo y reintentar.
6. Desde "¿Cómo van a jugar?", tocar "🌐 Por internet" y luego "Cancelar" → vuelve a "¿Cómo van a jugar?" (nunca pantalla en blanco).
7. Abrir un link con `?sala=CODIGO` (código real de una sala creada en el paso 4, o cualquier código de 6 caracteres para ver el mensaje de error) → salta directo al paso "Unirse" con el código precargado y el nombre precargado, sin pasar por instrucciones ni por "¿Cómo van a jugar?".
8. A mitad de una partida local, tocar el botón "?" para reabrir las instrucciones y cerrarlas de nuevo → **no** debe reaparecer "¿Cómo van a jugar?" sobre el tablero en curso.

Expected: los 8 puntos se cumplen en los 3 juegos.

- [ ] **Step 7: Commit**

```bash
git add src/pages/juegos/[slug].astro
git commit -m "feat: integrar el flujo de arranque (instrucciones -> modo -> tablero)"
```

---

## Self-Review Notes

- **Cobertura del spec**: sección 3 (flujo) → Tasks 2-5; sección 4 (`ModalModoJuego`, `ModalJuegoRemoto`, `ModalJugadores`, `[slug].astro`) → Tasks 1-2-4-5 respectivamente; sección 5 (deep-link) → Task 4 Step 8 + verificado en Task 5 Step 6.7; sección 6 (datos) → sin tareas propias, ninguna API de `players.ts`/`miNombre.ts` cambia; sección 7 (errores) → Task 4 Steps 5 y 7, Task 5 Step 6.5-6.6; sección 8 (testing) → Task 5 Steps 5-6; sección 9 (no-objetivos) → nada de eso tiene tarea, correcto.
- **Placeholders**: ninguno — cada step trae el código completo a pegar, no hay "TODO"/"agregar validación" sin mostrar cómo.
- **Consistencia de nombres**: `modo-elegido-local`, `abrir-modal-remoto`, `modal-remoto-cancelado`, `instrucciones-cerradas` se usan con el mismo nombre exacto en quien los produce y quien los consume, verificado cruzando Tasks 2, 3, 4 y 5. `resolverMiNombre()` y `precargarNombre()` se definen en Task 4 Step 3 y se usan tal cual en los Steps 4 y 8 del mismo task.
