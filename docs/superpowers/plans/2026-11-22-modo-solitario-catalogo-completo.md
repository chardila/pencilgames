# Modo solitario contra el robot (catálogo completo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar el modo solitario contra el robot con 3 dificultades calibradas (`facil`, `medio`, `dificil`) para los 21 juegos restantes del catálogo (alcanzando 27/27), adaptando los tableros especiales (`hex`, `y`, `col`, `wild-cats`, `battleship`) y cubriendo todo el catálogo con pruebas unitarias, anti-trampa, calibración y E2E.

**Architecture:** Reutiliza `src/lib/bot/controladorBot.ts`, `src/lib/bot/tipos.ts`, modales y cabecera del lote inicial sin cambios estructurales. `src/lib/gameSession.ts` expone los getters `esRemoto` y `esSolo` para desacoplar controles locales/solitarios de restricciones remotas en `hex`, `y`, `col` y `wild-cats`. Cada uno de los 21 juegos agrega un módulo puro `src/games/<dir>/bot.ts`, su suite `src/games/<dir>/bot.test.ts`, la conexión `elegirMovimientoBot` en `Board.astro` y `minJugadores: 1` en `src/content/juegos/<slug>.md`.

**Tech Stack:** Astro 7 + TypeScript 6 + CSS vanilla (cero dependencias nuevas), Vitest 5 (pool Node), Playwright (Chromium a `600×960` y `960×600`).

**Spec:** `docs/superpowers/specs/2026-11-22-modo-solitario-catalogo-completo-design.md` (base arquitectónica: `docs/superpowers/specs/2026-11-21-modo-solitario-bots-design.md`).

## Global Constraints

- Cero dependencias nuevas: solo Astro + TypeScript + CSS vanilla.
- Todo texto visible en español, tuteando al niño.
- Zonas tocables ≥ 48 px, verificadas a `600×960` y `960×600` sin desborde horizontal.
- Sin colores fijos prohibidos en `.astro` (`src/lib/sinColoresFijos.test.ts`); usar tokens `--color-*`.
- Bots 100 % síncronos y deterministas con `rng: Rng = Math.random`, objetivo típico `< 15 ms`, tope duro `< 30 ms` por jugada (sin depender de reloj ni Web Workers).
- Anti-trampa estricta: `src/games/battleship/bot.ts` jamás lee `state.flotas`; `src/games/wild-cats/bot.ts` jamás lee `state.eleccionJ1` ni `state.ultimaRevelacion` para inferir la elección pendiente.
- **Deshacer** permanece habilitado en los 27 juegos (incluyendo `battleship` y `gatos-salvajes`).
- Validación de Vitest en el *worktree* con `npm test -- --maxWorkers=2` para evitar contención artificial de CPU al lanzar 80+ workers simultáneos.

## Review Focus

1. **`esRemoto` vs `miAsiento !== null`:** En `hex/Board.astro` y `y/Board.astro`, el selector `.btn-tamano` debe bloquearse solo con `sesion.esRemoto`, nunca en modo solitario. Al deshacer hacia un snapshot con otro tamaño, reconstruir el SVG.
2. **Selección de mapa en `col`:** El niño siempre elige mapa en solitario (`sesion.esSolo || sesion.esMiTurno(...)`). En `onAplicarReinicio`, si `sesion.esSolo`, iniciar `createInitialState(1)` para no cancelar la alternancia de `revanchaSolo()`.
3. **Revelación en `wild-cats`:** Cuando el niño juega como J2 (revancha), la elección secreta del robot como J1 (500 ms después) no debe limpiar `verRevelacion = false`.
4. **Anti-trampa en `battleship` y `wild-cats`:** Verificar con pruebas unitarias explícitas que mutar `state.flotas[rival]` o `state.eleccionJ1` con la misma semilla `rng` produce exactamente la misma jugada.
5. **Calibración real:** En partidas espejo (J1/J2 para asimétricos), `tasaVictoria(dificil vs medio) > 0.65`, `tasaVictoria(medio vs facil) > 0.65`, y un jugador aleatorio gana partidas a `facil`. En `battleship`, promedio de disparos `dificil < medio < facil`.

## File Structure

- **Modificar (Ola 0):**
  - `src/lib/gameSession.ts`, `src/lib/gameSession.test.ts` — Getters `readonly esRemoto: boolean` y `readonly esSolo: boolean`.
  - `src/lib/catalogo.test.ts` — Permitir evolución progresiva durante oleadas (y exigir 27/27 en Ola 4).
  - `src/games/hex/Board.astro` — Selector de tamaño habilitado en solitario + reconstrucción SVG en `onDeshacer`.
  - `src/games/y/Board.astro` — Selector de tamaño habilitado en solitario + reconstrucción SVG en `onDeshacer`.
  - `src/games/col/Board.astro` — Selector de mapa siempre del niño en solitario y `createInitialState(1)` en reinicio solitario.
  - `src/games/wild-cats/Board.astro` — Preservar `verRevelacion` cuando llega jugada secreta J1 en solitario/remoto.
  - `src/games/battleship/Board.astro` — Nombre real del jugador en el interstitial de colocación.
- **Crear y conectar (Olas 1, 2 y 3 — 21 juegos):**
  - Por cada `<dir>` y `<slug>`: crear `src/games/<dir>/bot.ts` y `src/games/<dir>/bot.test.ts`; modificar `src/games/<dir>/Board.astro` (conectar `elegirMovimientoBot`) y `src/content/juegos/<slug>.md` (`minJugadores: 1`).
- **Modificar (Ola 4):**
  - `src/lib/catalogo.test.ts` — Exigir 27/27 con `minJugadores: 1`.
  - `e2e/portada.spec.ts` — Verificar 27/27 con `🤖 1 jugador` y filtro `🤖 Jugar solo`.
  - `e2e/solo.spec.ts` — Retirar asunción de `hex` sin bot y añadir cobertura E2E de `col`, `hex` (cambio de tamaño), `battleship`, `gatos-salvajes` (revelación en revancha) y `sos`/`puntos-caminantes`.

---

### Task 0: Base compartida (`gameSession`) y tableros especiales (Ola 0)

**Files:**
- Modify: `src/lib/gameSession.ts`
- Modify: `src/lib/gameSession.test.ts`
- Modify: `src/lib/catalogo.test.ts:64-78`
- Modify: `src/games/hex/Board.astro`
- Modify: `src/games/y/Board.astro`
- Modify: `src/games/col/Board.astro`
- Modify: `src/games/wild-cats/Board.astro`
- Modify: `src/games/battleship/Board.astro`

**Interfaces:**
- Produces: `GameSession.esRemoto: boolean` y `GameSession.esSolo: boolean` (getters de solo lectura).

- [ ] **Step 1: Escribir tests de `esRemoto` y `esSolo` en `src/lib/gameSession.test.ts`**
  Comprobar: en modo local `esRemoto === false && esSolo === false`; tras `modo-elegido-solo` `esSolo === true && esRemoto === false`; tras `modo-elegido-local` `esSolo === false`; tras `canal-remoto-listo` `esRemoto === true && esSolo === false`.
- [ ] **Step 2: Ejecutar `npx vitest run src/lib/gameSession.test.ts` para verificar que falla**
- [ ] **Step 3: Añadir getters en `src/lib/gameSession.ts`**
  En `GameSession<TMovimiento>` añadir `readonly esRemoto: boolean; readonly esSolo: boolean;` y en el objeto retornado:
  ```ts
  get esRemoto() {
    return esRemoto();
  },
  get esSolo() {
    return esSolo();
  },
  ```
- [ ] **Step 4: Actualizar `src/lib/catalogo.test.ts` para oleadas intermedias**
  Verificar que los 6 juegos iniciales siguen con `minJugadores: 1` y todos los juegos declaran `minJugadores` igual a `1` o `2` (en Task 22 se exige que los 27 sean `1`).
- [ ] **Step 5: Adaptar los 5 tableros especiales**
  - `src/games/hex/Board.astro`: cambiar `sesion.miAsiento !== null` a `sesion.esRemoto` en `render()` y en el listener `.btn-tamano`; en `onDeshacer`, si `(snapshot as HexState).size !== currentSize`, actualizar `currentSize = state.size` y llamar `construirTablero()` antes de `render()`.
  - `src/games/y/Board.astro`: mismo cambio (`sesion.esRemoto` y reconstrucción SVG en `onDeshacer` cuando cambia `size`).
  - `src/games/col/Board.astro`: en `onAplicarReinicio`, usar `state = createInitialState(sesion.esSolo ? 1 : jugadorInicialSiguiente)`; en `render()`, en `fase === 'seleccion'`, usar `const meTocaElegir = sesion.esSolo || sesion.esMiTurno(state.currentPlayer);`.
  - `src/games/wild-cats/Board.astro`: en `jugar`, cambiar `if (prev.currentPlayer === 1)` para poner `verRevelacion = false` únicamente si `emitirRemoto || sesion.miAsiento === null`.
  - `src/games/battleship/Board.astro`: en `render()`, cambiar `interstitialTexto.textContent = ...` para usar `sesion.nombres[state.currentPlayer]`.
- [ ] **Step 6: Ejecutar `npm test -- --maxWorkers=2 && npm run check` y confirmar todo verde**
- [ ] **Step 7: Commit**
  `git commit -m "feat(solo): exponer esRemoto/esSolo y adaptar tableros especiales"`

---

### Task 1: Bot de Sim (`src/games/sim/`)

**Files:**
- Create: `src/games/sim/bot.ts`, `src/games/sim/bot.test.ts`
- Modify: `src/games/sim/Board.astro`, `src/content/juegos/sim.md`

**Interfaces:**
- Consumes: `SimState`, `Edge`, `Vertex`, `TOTAL_VERTICES`, `TOTAL_EDGES`, `getEdgeIndex`, `getEdgeFromIndex`, `playMove`, `esEdgeValido` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: SimState, dificultad: Dificultad, rng: Rng = Math.random): Edge`.

- [ ] **Step 1: Escribir `src/games/sim/bot.test.ts` (TDD)** — legalidad (`esEdgeValido`, `playMove !== state`), Difícil evita suicidio si hay aristas seguras, calibración (`dificil > medio > facil`, azar > `facil`), rendimiento `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/sim/bot.ts`** — representación en dos bitmasks de 15 bits (`p1Mask`, `p2Mask`), detección de triángulo propio por par de bits, *facil* (evita suicidio prob. `0.75`), *medio* (nunca suicida si hay segura + evita trampa 1–2 plies), *dificil* (negamax con tabla de transposición `Map<number, number>`, prof. 8 al inicio y exacto con `<= 11` aristas libres).
- [ ] **Step 3: Conectar `src/games/sim/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/sim.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/sim/`**

---

### Task 2: Bot de Notakto (`src/games/notakto/`)

**Files:**
- Create: `src/games/notakto/bot.ts`, `src/games/notakto/bot.test.ts`
- Modify: `src/games/notakto/Board.astro`, `src/content/juegos/notakto.md`

**Interfaces:**
- Consumes: `NotaktoState`, `Move`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: NotaktoState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/notakto/bot.test.ts` (TDD)** — legalidad en tableros vivos, Medio/Difícil evitan matar el último tablero vivo si hay alternativa, Difícil gana desde posición inicial (como J1 en misère de 3 tableros) o posiciones ganadoras conocidas, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/notakto/bot.ts`** — reducir cada tablero 3×3 vivo a su forma canónica bajo las 8 simetrías $D_4$ (entero de 9 bits; 0 si está muerto), ordenar la terna `(c0, c1, c2)` y memoizar en DP exacto (`Uint8Array` o `Map` lazy) quién gana en misère; *facil* (evita suicidio prob. `0.65`), *medio* (no suicida + 2 plies), *dificil* (DP exacto).
- [ ] **Step 3: Conectar `src/games/notakto/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/notakto.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/notakto/`**

---

### Task 3: Bot de Col (`src/games/col/`)

**Files:**
- Create: `src/games/col/bot.ts`, `src/games/col/bot.test.ts`
- Modify: `src/games/col/Board.astro`, `src/content/juegos/col.md`

**Interfaces:**
- Consumes: `ColState`, `ColMove`, `playMove`, `regionesLegales`, `esJugadaValida` de `./engine`; `MAPAS`, `adyacentesDe` de `./maps`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: ColState, dificultad: Dificultad, rng: Rng = Math.random): ColMove`.

- [ ] **Step 1: Escribir `src/games/col/bot.test.ts` (TDD)** — legalidad en `seleccion` y en los 3 mapas (`0, 1, 2`), Medio/Difícil ganan en 1 y evitan derrota en 1, Difícil resuelve exacto desde posiciones ganadoras, calibración espejo J1/J2 y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/col/bot.ts`** — bitmasks de 13 bits (`m1`, `m2`, `adjMask[r]` precalculado por mapa); en `seleccion`, `{ tipo: 'mapa', mapaId }` con `rng`; en `jugando`, *facil* (azar omitiendo victoria en 1 prob. `0.6`), *medio* (gana en 1, evita perder en 1, movilidad), *dificil* (solver exacto con tabla de transposición por `(m1, m2, turno)`).
- [ ] **Step 3: Conectar `src/games/col/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/col.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/col/`**

---

### Task 4: Bot de Cram (`src/games/cram/`)

**Files:**
- Create: `src/games/cram/bot.ts`, `src/games/cram/bot.test.ts`
- Modify: `src/games/cram/Board.astro`, `src/content/juegos/cram.md`

**Interfaces:**
- Consumes: `CramState`, `Move`, `TAMANO`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: CramState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/cram/bot.test.ts` (TDD)** — legalidad, victoria en 1 de Medio/Difícil, simetría rotacional 180° en Difícil como J2 en tablero 6×6 (gana 100 % contra cualquier jugada de J1), calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/cram/bot.ts`** — bitmask en `lo` (bits 0..31) y `hi` (bits 32..35); *facil* (azar omitiendo victoria prob. `0.6`), *medio* (gana en 1, evita perder en 1, movilidad), *dificil* (si el tablero es simétrico 180° tras jugada de J1 responde el dominó simétrico `35 - b, 35 - a`; si no, descompone componentes conexas por BFS, calcula nimber Sprague-Grundy exacto en componentes ≤ 14 casillas con memoización y usa alfa-beta acotado si hay componente grande).
- [ ] **Step 3: Conectar `src/games/cram/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/cram.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/cram/`**

---

### Task 5: Bot de Domineering (`src/games/domineering/`)

**Files:**
- Create: `src/games/domineering/bot.ts`, `src/games/domineering/bot.test.ts`
- Modify: `src/games/domineering/Board.astro`, `src/content/juegos/domineering.md`

**Interfaces:**
- Consumes: `DomineeringState`, `Move`, `TAMANO`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: DomineeringState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/domineering/bot.test.ts` (TDD)** — legalidad para J1 (vertical) y J2 (horizontal), Medio/Difícil ganan en 1 y evitan derrota en 1, calibración espejo J1/J2 y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/domineering/bot.ts`** — dos `number` de 32 bits (`lo`, `hi`) representando el 8×8; *facil* (azar omitiendo victoria prob. `0.6`), *medio* (victoria en 1, evitar derrota en 1, movilidad), *dificil* (negamax alfa-beta profundidad 4–5 y exacto con `<= 12` jugadas totales, evaluando huecos exclusivos de 2 casillas verticales vs horizontales y movilidad).
- [ ] **Step 3: Conectar `src/games/domineering/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/domineering.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/domineering/`**

---

### Task 6: Bot de Snort (`src/games/snort/`)

**Files:**
- Create: `src/games/snort/bot.ts`, `src/games/snort/bot.test.ts`
- Modify: `src/games/snort/Board.astro`, `src/content/juegos/snort.md`

**Interfaces:**
- Consumes: `SnortState`, `TAMANO`, `casillaLegal`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: SnortState, dificultad: Dificultad, rng: Rng = Math.random): number`.

- [ ] **Step 1: Escribir `src/games/snort/bot.test.ts` (TDD)** — legalidad, Medio/Difícil ganan en 1 y evitan derrota en 1, calibración espejo y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/snort/bot.ts`** — `Uint8Array(36)` para tablero rápido; *facil* (azar omitiendo victoria prob. `0.6`), *medio* (victoria/bloqueo en 1 + 1 ply diferencia de legales y exclusivas), *dificil* (alfa-beta prof. 5–6 con exacto `<= 12` legales, ordenando por impacto y evaluando casillas exclusivas + paridad).
- [ ] **Step 3: Conectar `src/games/snort/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/snort.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/snort/`**

---

### Task 7: Bot de Bridg-It (`src/games/bridg-it/`)

**Files:**
- Create: `src/games/bridg-it/bot.ts`, `src/games/bridg-it/bot.test.ts`
- Modify: `src/games/bridg-it/Board.astro`, `src/content/juegos/bridg-it.md`

**Interfaces:**
- Consumes: `BridgItState`, `Edge`, `puedeJugar`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: BridgItState, dificultad: Dificultad, rng: Rng = Math.random): Edge`.

- [ ] **Step 1: Escribir `src/games/bridg-it/bot.test.ts` (TDD)** — legalidad J1/J2, Medio/Difícil ganan en 1 y bloquean en 1, Difícil gana consistentemente como J1 mediante emparejamiento, calibración espejo y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/bridg-it/bot.ts`** — emparejamiento exacto de los dos árboles generadores disjuntos sobre la retícula 5×6 para J1 (si el rival corta una arista del árbol par, responde con su pareja; como apertura juega arista inicial del árbol) y alfa-beta (prof. 3–4 sobre top candidatas) con distancia 0-1 BFS para J2 o posiciones fuera de libro.
- [ ] **Step 3: Conectar `src/games/bridg-it/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/bridg-it.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/bridg-it/`**

---

### Task 8: Bot de Agujero Negro (`src/games/agujero-negro/`)

**Files:**
- Create: `src/games/agujero-negro/bot.ts`, `src/games/agujero-negro/bot.test.ts`
- Modify: `src/games/agujero-negro/Board.astro`, `src/content/juegos/agujero-negro.md`

**Interfaces:**
- Consumes: `AgujeroNegroState`, `TOTAL_POSITIONS`, `getNeighbors`, `placeNumber`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: AgujeroNegroState, dificultad: Dificultad, rng: Rng = Math.random): number`.

- [ ] **Step 1: Escribir `src/games/agujero-negro/bot.test.ts` (TDD)** — legalidad, Difícil protege sus números altos frente a `facil`, calibración espejo y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/agujero-negro/bot.ts`** — `Int8Array(21)` para valores con signo (`+v` J1, `-v` J2, `0` vacío) + tabla precalculada de vecinos; *facil* (azar), *medio* (1 ply evitando poner fichas altas junto a posibles agujeros negros finales y atacando fichas altas del rival con números bajos), *dificil* (alfa-beta prof. 4, exacto con `<= 8` vacías, evaluando supervivencia esperada ante los posibles agujeros negros).
- [ ] **Step 3: Conectar `src/games/agujero-negro/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/agujero-negro.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/agujero-negro/`**

---

### Task 9: Bot de Snakes (`src/games/snakes/`)

**Files:**
- Create: `src/games/snakes/bot.ts`, `src/games/snakes/bot.test.ts`
- Modify: `src/games/snakes/Board.astro`, `src/content/juegos/snakes.md`

**Interfaces:**
- Consumes: `SnakesState`, `TAMANO`, `vecinosLibres`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: SnakesState, dificultad: Dificultad, rng: Rng = Math.random): number`.

- [ ] **Step 1: Escribir `src/games/snakes/bot.test.ts` (TDD)** — legalidad, Medio/Difícil encierran al rival en 1 y no se encierran solos, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/snakes/bot.ts`** — `Uint8Array(49)` + BFS de área accesible y Voronoi; *facil* (azar, cierra trampa prob. `0.35`), *medio* (cierra en 1 + mayor área accesible por BFS), *dificil* (alfa-beta prof. 10 con ramificación ≤ 3, evaluando Voronoi + paridad de ajedrez + articulaciones).
- [ ] **Step 3: Conectar `src/games/snakes/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/snakes.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/snakes/`**

---

### Task 10: Bot de Estampida (`src/games/estampida/`)

**Files:**
- Create: `src/games/estampida/bot.ts`, `src/games/estampida/bot.test.ts`
- Modify: `src/games/estampida/Board.astro`, `src/content/juegos/estampida.md`

**Interfaces:**
- Consumes: `EstampidaState`, `Move`, `Direccion`, `TAMANO`, `celdasQueCopian`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: EstampidaState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/estampida/bot.test.ts` (TDD)** — legalidad en `setup` y `playing` (solo direcciones con `celdasQueCopian.length > 0`), calibración espejo y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/estampida/bot.ts`** — *facil* (azar válido), *medio* (`setup`: separación de bordes/fichas; `playing`: 1–2 plies ganancia de casillas), *dificil* (`setup`: maximiza alcance Voronoi interior de sus 5 fichas; `playing`: alfa-beta profundo prof. 8–10 manejando saltos de turno cuando un jugador queda sin direcciones).
- [ ] **Step 3: Conectar `src/games/estampida/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/estampida.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/estampida/`**

---

### Task 11: Bot de SOS (`src/games/sos/`)

**Files:**
- Create: `src/games/sos/bot.ts`, `src/games/sos/bot.test.ts`
- Modify: `src/games/sos/Board.astro`, `src/content/juegos/sos.md`

**Interfaces:**
- Consumes: `SOSState`, `Move`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: SOSState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/sos/bot.test.ts` (TDD)** — legalidad, Medio/Difícil completan `SOS` inmediato y evitan regalar `S_S` o `SO_` si hay jugadas seguras, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/sos/bot.ts`** — clasificador de `(r, c, 'S'|'O')` en: cierra `SOS` (cuántos), segura (no crea `S_S` ni `SO_` ni `_OS`), o sacrificio; *facil* (cierra con prob. `0.45`, resto azar), *medio* (cierra máximo `SOS`, sino segura, sino menor regalo), *dificil* (toma cadena óptima o guarda control de paridad + alfa-beta cuando quedan `<= 10` vacías manejando turnos repetidos).
- [ ] **Step 3: Conectar `src/games/sos/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/sos.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/sos/`**

---

### Task 12: Bot de Orden y Caos (`src/games/order-and-chaos/`)

**Files:**
- Create: `src/games/order-and-chaos/bot.ts`, `src/games/order-and-chaos/bot.test.ts`
- Modify: `src/games/order-and-chaos/Board.astro`, `src/content/juegos/orden-y-caos.md`

**Interfaces:**
- Consumes: `OrdenCaosState`, `Move`, `TAMANO`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: OrdenCaosState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/order-and-chaos/bot.test.ts` (TDD)** — legalidad, Orden Medio/Difícil completan 5 en línea en 1 turno, Caos Medio/Difícil bloquean 4 en línea con la marca opuesta, calibración en roles J1 (Orden) y J2 (Caos) y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/order-and-chaos/bot.ts`** — precalcular las 28 ventanas de 5 índices sobre 6×6; *facil* (azar omitiendo 5 o bloqueos ~65 %), *medio* (toma 5 / bloquea 4 + heurística 1 ply de ventanas), *dificil* (alfa-beta prof. 3–4 sobre top 8 pares `(cell, marca)` maximizando ventanas vivas/dobles como Orden o maximizando ventanas muertas como Caos).
- [ ] **Step 3: Conectar `src/games/order-and-chaos/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/orden-y-caos.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/order-and-chaos/`**

---

### Task 13: Bot de MetaSquares (`src/games/metasquares/`)

**Files:**
- Create: `src/games/metasquares/bot.ts`, `src/games/metasquares/bot.test.ts`
- Modify: `src/games/metasquares/Board.astro`, `src/content/juegos/metasquares.md`

**Interfaces:**
- Consumes: `MetaSquaresState`, `Move`, `TODOS_LOS_CUADRADOS`, `OBJETIVO`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: MetaSquaresState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/metasquares/bot.test.ts` (TDD)** — legalidad, Medio/Difícil completan cuadrado y bloquean amenaza rival de 3/4 esquinas, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/metasquares/bot.ts`** — índice inverso precalculado `CUADRADOS_POR_CELDA[49]`; *facil* (azar, completa cuadrado prob. `0.4`), *medio* (completa propio / bloquea rival 3/4, sino top 3–4 a 1 ply), *dificil* (alfa-beta prof. 3 sobre top 8–10 candidatas contando puntaje + amenazas 3/4 y 2/4 en ambos jugadores).
- [ ] **Step 3: Conectar `src/games/metasquares/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/metasquares.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/metasquares/`**

---

### Task 14: Bot de Triggle (`src/games/triggle/`)

**Files:**
- Create: `src/games/triggle/bot.ts`, `src/games/triggle/bot.test.ts`
- Modify: `src/games/triggle/Board.astro`, `src/content/juegos/triggle.md`

**Interfaces:**
- Consumes: `TriggleState`, `Move`, `TRIANGULOS`, `movimientosValidos`, `playMove`, `esMove` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: TriggleState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/triggle/bot.test.ts` (TDD)** — legalidad (`esMove` y `playMove !== state`), Medio/Difícil cierran máximo de triángulos inmediatos, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/triggle/bot.ts`** — precalcular tabla de las 48 líneas válidas (3 aristas y 4 puntos mapeados a índices enteros) y los 54 triángulos con máscaras numéricas para operar sin crear objetos/strings en la búsqueda; *facil* (azar ignorando a veces cierres), *medio* (maximiza triángulos cerrados evitando dejar triángulos con 2 lados), *dificil* (alfa-beta prof. 3–4 sobre top candidatas y exacto al final).
- [ ] **Step 3: Conectar `src/games/triggle/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/triggle.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/triggle/`**

---

### Task 15: Bot de Puntos Caminantes (`src/games/walking-dots/`)

**Files:**
- Create: `src/games/walking-dots/bot.ts`, `src/games/walking-dots/bot.test.ts`
- Modify: `src/games/walking-dots/Board.astro`, `src/content/juegos/puntos-caminantes.md`

**Interfaces:**
- Consumes: `WalkingDotsState`, `Move`, `TAMANO`, `TOTAL`, `casillasLegales`, `puntajes`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: WalkingDotsState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/walking-dots/bot.test.ts` (TDD)** — legalidad (devuelve `'pasar'` cuando no hay jugadas legales), Medio/Difícil eligen `'pasar'` cuando `pasesSeguidos === 1` y van arriba en el marcador, Difícil evita rellenar cavidades ya cercadas propias, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/walking-dots/bot.ts`** — detección de cavidades cerradas exclusivas para no desperdiciar jugadas dentro del propio territorio; *facil* (colocación legal al azar, pasa solo si `casillasLegales.length === 0`), *medio* (pasa si gana con `pasesSeguidos === 1`, evita rellenar territorio propio, avanza hacia frontera/centro), *dificil* (alfa-beta prof. 4–5 sobre top candidatas + `'pasar'` evaluando diferencia de territorio Voronoi y puntos).
- [ ] **Step 3: Conectar `src/games/walking-dots/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/puntos-caminantes.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/walking-dots/`**

---

### Task 16: Bot de Hex (`src/games/hex/`)

**Files:**
- Create: `src/games/hex/bot.ts`, `src/games/hex/bot.test.ts`
- Modify: `src/games/hex/Board.astro`, `src/content/juegos/hex.md`

**Interfaces:**
- Consumes: `HexState`, `BoardSize`, `getNeighbors`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: HexState, dificultad: Dificultad, rng: Rng = Math.random): number`.

- [ ] **Step 1: Escribir `src/games/hex/bot.test.ts` (TDD)** — legalidad en tamaños `5`, `7` y `9`, Medio/Difícil ganan en 1 y bloquean en 1, Difícil defiende puente virtual atacado, calibración espejo J1/J2 en 5×5 y 7×7, rendimiento `< 30 ms` incluso en 9×9.
- [ ] **Step 2: Implementar `src/games/hex/bot.ts`** — 0-1 BFS adaptado a `state.size` (J1 Norte–Sur, J2 Oeste–Este); *facil* (azar, victoria en 1 prob. `0.35`), *medio* (victoria/bloqueo en 1 + top 3–4 por distancia 0-1 BFS + centro), *dificil* (detección de puentes virtuales atacados + métrica *two-distance* + alfa-beta prof. 2–3 sobre top 8–10 candidatas).
- [ ] **Step 3: Conectar `src/games/hex/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/hex.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/hex/`**

---

### Task 17: Bot de Juego Y (`src/games/y/`)

**Files:**
- Create: `src/games/y/bot.ts`, `src/games/y/bot.test.ts`
- Modify: `src/games/y/Board.astro`, `src/content/juegos/juego-y.md`

**Interfaces:**
- Consumes: `YState`, `BoardSize`, `cellCount`, `coordsOf`, `getNeighbors`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: YState, dificultad: Dificultad, rng: Rng = Math.random): number`.

- [ ] **Step 1: Escribir `src/games/y/bot.test.ts` (TDD)** — legalidad en `7`, `9` y `11`, Medio/Difícil ganan y bloquean en 1, calibración espejo y `< 30 ms` incluso en tamaño `11`.
- [ ] **Step 2: Implementar `src/games/y/bot.ts`** — 3 0-1 BFS hacia los 3 lados (`c === 0`, `c === r`, `r === size - 1`) para calcular distancia Steiner mínima; *facil* (azar, gana en 1 prob. `0.35`), *medio* (gana/bloquea en 1 + top 3–4 por distancia Steiner + centro), *dificil* (defensa de puentes + métrica *two-distance* a los 3 lados + alfa-beta prof. 2–3 sobre top 8–10 candidatas).
- [ ] **Step 3: Conectar `src/games/y/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/juego-y.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/y/`**

---

### Task 18: Bot de Kropki (`src/games/kropki/`)

**Files:**
- Create: `src/games/kropki/bot.ts`, `src/games/kropki/bot.test.ts`
- Modify: `src/games/kropki/Board.astro`, `src/content/juegos/kropki.md`

**Interfaces:**
- Consumes: `KropkiState`, `TAMANO`, `TOTAL`, `esLegal`, `vecinas8`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: KropkiState, dificultad: Dificultad, rng: Rng = Math.random): number`.

- [ ] **Step 1: Escribir `src/games/kropki/bot.test.ts` (TDD)** — legalidad (nunca juega dentro de `territorio` ni ocupadas), Medio/Difícil capturan punto rival en 1 y defienden punto propio amenazado en 1, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/kropki/bot.ts`** — poda por vecindad + simulación rápida sobre `Uint8Array(64)`; *facil* (azar con captura prob. `0.45`), *medio* (captura en 1, bloquea captura en 1, top 3–4 por cercanía/cerco), *dificil* (alfa-beta prof. 3 sobre top 8–10 candidatas evaluando capturas, territorio cerrado y puntos en riesgo).
- [ ] **Step 3: Conectar `src/games/kropki/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/kropki.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/kropki/`**

---

### Task 19: Bot de Conquista (`src/games/conquista/`)

**Files:**
- Create: `src/games/conquista/bot.ts`, `src/games/conquista/bot.test.ts`
- Modify: `src/games/conquista/Board.astro`, `src/content/juegos/conquista.md`

**Interfaces:**
- Consumes: `ConquistaState`, `Fence`, `FenceInfo`, `ALL_CANDIDATES`, `CANDIDATES_BY_KEY`, `esFenceLegal`, `jugarFence`, `esFence` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: ConquistaState, dificultad: Dificultad, rng: Rng = Math.random): Fence`.

- [ ] **Step 1: Escribir `src/games/conquista/bot.test.ts` (TDD)** — legalidad (`esFence` y `jugarFence !== state`), Medio/Difícil cierran caras disponibles y evitan regalar cierres triviales si hay vallas seguras, calibración y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/conquista/bot.ts`** — **Union-Find** sobre los 36 vértices de la retícula 6×6 para clasificar las vallas legales de `ALL_CANDIDATES` en < 0,2 ms (si ambos extremos ya están en la misma componente, esa valla cierra un ciclo; verificando el cierre real solo en las candidatas que cierran ciclo para medir área exacta); *facil* (cierra con prob. `0.45`, resto azar), *medio* (cierra cara de mayor área, sino valla segura, sino menor regalo), *dificil* (sigue cadena de mayor área o mantiene paridad, evita crear ciclos a 1 arista de cerrarse, sacrifica el menor cierre si solo quedan sacrificios).
- [ ] **Step 3: Conectar `src/games/conquista/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/conquista.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/conquista/`**

---

### Task 20: Bot de Batalla Naval (`src/games/battleship/`)

**Files:**
- Create: `src/games/battleship/bot.ts`, `src/games/battleship/bot.test.ts`
- Modify: `src/games/battleship/Board.astro`, `src/content/juegos/battleship.md`

**Interfaces:**
- Consumes: `BattleshipState`, `Move`, `TAMANO`, `FLOTA`, `esColocacionValida`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: BattleshipState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/battleship/bot.test.ts` (TDD)** — legalidad en `colocacion` (`esColocacionValida`) y `disparos`; **test anti-trampa obligatorio** (mutar `state.flotas[rival]` produce exactamente el mismo disparo con la misma semilla `rng` en las 3 dificultades); calibración (victorias `dificil > medio > facil` y media de disparos `dificil < medio < facil`); `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/battleship/bot.ts`** — prohibido leer `state.flotas`; usa `rng` puro para colocar flota (`facil`: cualquiera válida; `medio`: sin barcos pegados si posible; `dificil`: anti-patrón sin adyacencias ni concentración en bordes) y para disparos (`facil`: azar con ~40 % seguimiento de `'tocado'`; `medio`: Hunt & Target con paridad de tablero + eje de impactos; `dificil`: mapa de densidad probabilística contando todas las ubicaciones válidas de los barcos aún no hundidos compatibles con `'agua'`, `'tocado'` y `'hundido'` en `state.disparos[yo]`).
- [ ] **Step 3: Conectar `src/games/battleship/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/battleship.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/battleship/`**

---

### Task 21: Bot de Gatos Salvajes (`src/games/wild-cats/`)

**Files:**
- Create: `src/games/wild-cats/bot.ts`, `src/games/wild-cats/bot.test.ts`
- Modify: `src/games/wild-cats/Board.astro`, `src/content/juegos/gatos-salvajes.md`

**Interfaces:**
- Consumes: `WildCatsState`, `Move`, `LADO`, `CELDAS`, `LINEAS`, `celdasElegibles`, `playMove`, `esJugadaValida` de `./engine`; `Dificultad`, `Rng`, `elegirAlAzar` de `../../lib/bot/tipos`.
- Produces: `export function elegirMovimiento(state: WildCatsState, dificultad: Dificultad, rng: Rng = Math.random): Move`.

- [ ] **Step 1: Escribir `src/games/wild-cats/bot.test.ts` (TDD)** — legalidad en J1 y J2 respetando `vetada`; **test anti-trampa obligatorio** (como J2 con la misma semilla `rng`, mutar `state.eleccionJ1` produce exactamente el mismo `Move` en las 3 dificultades); calibración espejo y `< 30 ms`.
- [ ] **Step 2: Implementar `src/games/wild-cats/bot.ts`** — prohibido leer `state.eleccionJ1` y `state.ultimaRevelacion`; evalúa potencial de las 28 líneas; *facil* (elegible al azar, completa 4 con prob. `0.35`), *medio* (mezcla con `rng` entre top 3–4 candidatas por amenaza propia/rival), *dificil* (matriz de pagos sobre top 8–10 candidatas modelando el `choque` cuando coinciden + **regret matching ~70 iteraciones** para obtener estrategia mixta aproximada de Nash y muestrear con `rng`).
- [ ] **Step 3: Conectar `src/games/wild-cats/Board.astro` y marcar `minJugadores: 1` en `src/content/juegos/gatos-salvajes.md`**
- [ ] **Step 4: Verificar `npx vitest run src/games/wild-cats/`**

---

### Task 22: Catálogo completo 27/27, E2E y verificación integral (Ola 4)

**Files:**
- Modify: `src/lib/catalogo.test.ts`
- Modify: `e2e/portada.spec.ts`
- Modify: `e2e/solo.spec.ts`

- [ ] **Step 1: Endurecer `src/lib/catalogo.test.ts`** — verificar que los **27/27** juegos declaran `minJugadores: 1`.
- [ ] **Step 2: Actualizar `e2e/portada.spec.ts`** — comprobar que todos los `slugsDelCatalogo()` muestran `1 jugador` y que el filtro `[data-grupo="jugadores"] .filtro[data-valor="solo"]` deja `slugsDelCatalogo().length` tarjetas.
- [ ] **Step 3: Actualizar `e2e/solo.spec.ts`** — retirar el test obsoleto que asumía `hex` sin bot; añadir casos E2E para `col` (selector de mapa + bot + revancha con alternancia), `hex` (selector de tamaño 5×5 en solitario), `battleship` (confirmar flota + disparar + respuesta sin handoff), `gatos-salvajes` (elección simultánea + revelación intacta tras revancha como J2) y `sos`/`puntos-caminantes`, manteniendo verificación a `600×960` y `960×600` con 0 errores de consola.
- [ ] **Step 4: Ejecutar `npm test -- --maxWorkers=2 && npm run check && npm run build && npm run test:e2e`**
- [ ] **Step 5: Commit final**
  `git commit -m "test(e2e): cobertura solitaria del catálogo completo (27 juegos)"`
