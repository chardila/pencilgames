# Nim (18.º juego) — diseño

Fecha: 2026-09-01
Estado: aprobado

## Resumen

Nim como decimoctavo juego de Pencilgames. Dos jugadores se alternan retirando
estrellas de una pirámide de cuatro filas con **1, 3, 5 y 7** estrellas (16 en
total). En su turno, cada jugador elige **una sola fila** y retira **una o más**
estrellas de ella. Se juega en **modo normal**: **gana quien retira la última
estrella** del tablero.

El juego encaja en la arquitectura existente: motor puro (`engine.ts`) con
pruebas unitarias en Vitest (`engine.test.ts`), componente de tablero
(`Board.astro`) con `<TableroJuego>`, sesión de juego compartida
(`iniciarSesionJuego` de `gameSession.ts`) con soporte local (pasar-y-jugar) y
remoto por WebRTC P2P, ficha de contenido en Astro
(`src/content/juegos/nim.md`) y registro estático en
`src/pages/juegos/[slug].astro`.

## Decisiones de diseño

### 1. Variante: modo normal (no misère)

- **Gana quien toma la última estrella.** Para la audiencia infantil, "agarra la
  última y ganas" es el instinto natural; la misère obliga a razonar al revés.
- El sabor "no te quedes con lo malo" ya está cubierto por Chomp y Notakto.
- No hay pantalla de selección de modo: una sola regla, una sola condición de fin.

### 2. Configuración de montones: 1-3-5-7 (Marienbad)

- Cuatro filas con **1, 3, 5 y 7** estrellas, dispuestas como pirámide centrada.
- Es la imagen icónica de Nim; partidas de ~6-10 turnos; no abrumador.
- 16 estrellas caben sin scroll horizontal ni zoom en móvil.

### 3. Gesto de retirada: estilo Chomp

- Tocar la estrella en la posición `k` (0-indexada) de una fila selecciona esa
  estrella **y todas las que están a su derecha** en la misma fila. Es decir, la
  fila queda con `k` estrellas (`dejar = k`), retirando `montones[fila] - k`.
- Gesto ya conocido en la app (idéntico al mordisco de Chomp).

### 4. Confirmación de jugada (toque-previsualiza + confirmar)

- Móvil-first y audiencia infantil: retirar varias estrellas de un toque es
  propenso a errores en pantalla táctil.
- **Primer toque** en una estrella: marca como `--seleccionada` esa estrella y
  las de su derecha en la fila; aparece una barra inferior con el texto
  "Quitar N estrella(s) de la fila F" y los botones **Confirmar** y **Cancelar**.
- **Segundo toque en la misma estrella**, o botón **Confirmar**: ejecuta la
  jugada.
- **Toque en otra estrella** (misma u otra fila): mueve la selección.
- **Cancelar**: limpia la selección. `pointerleave` del tablero sólo limpia el
  resaltado de hover (`--preview`), no la selección; ésta se limpia con Cancelar
  o al confirmar/ejecutar la jugada.
- **Escritorio**: `pointerenter` muestra el mismo resaltado en tono tenue
  (`--preview`) sin necesidad de seleccionar; el flujo de confirmar sigue vigente.

### 5. Experiencia visual

- Estrellas ⭐ de alto contraste sobre `<TableroJuego>`, cuatro filas centradas
  en pirámide (1 arriba, 7 abajo).
- **Estrella retirada**: hueco tenue (opacidad baja, sin relieve), no interactivo.
- **Estrella seleccionada**: resalte con `--color-accent`.
- **Preview (hover, escritorio)**: resalte gris tenue del área que se retiraría.
- **Última jugada (`lastMove`)**: las estrellas que retiró el rival en su turno
  conservan un indicador sutil (borde acento sobre el hueco) para que en remoto y
  en pasar-y-jugar quede claro qué desapareció.

## Componentes

### `src/games/nim/engine.ts` (motor puro sin DOM)

```ts
export type Player = 1 | 2;
export type GameStatus = 'playing' | 'won';

export const FILAS_INICIALES = [1, 3, 5, 7] as const;
export const TOTAL_FICHAS = 16;

export interface NimMove {
  fila: number;   // índice de fila 0..3
  dejar: number;  // cuántas estrellas quedan en esa fila tras la jugada
}

export interface NimState {
  montones: number[];        // p.ej. [1, 3, 5, 7]; cada valor sólo puede bajar
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastMove: { fila: number; quitadas: number } | null;
}

export function createInitialState(): NimState;
export function esJugadaValida(payload: unknown): payload is NimMove;
export function playMove(state: NimState, move: NimMove): NimState;
```

#### `createInitialState`

- `montones: [...FILAS_INICIALES]` → `[1, 3, 5, 7]`
- `currentPlayer: 1`, `status: 'playing'`, `winner: null`, `lastMove: null`

#### `esJugadaValida(payload)`

Devuelve `true` sólo si `payload` es un objeto con:

- `fila`: entero en `[0, 3]`
- `dejar`: entero `>= 0`

(La comprobación de que `dejar < montones[fila]` —retirar al menos una— se hace
en `playMove` contra el estado; `esJugadaValida` sólo valida la forma del
payload, como en el resto de juegos.)

Rechaza: no-objetos, `null`, arrays, campos faltantes, no enteros, `NaN`,
`fila` fuera de `[0, 3]`, `dejar` negativo.

#### `playMove(state, move)`

1. Si `state.status !== 'playing'`, retorna `state` sin cambios.
2. Si `!esJugadaValida(move)`, retorna `state` sin cambios.
3. Si `move.dejar >= state.montones[move.fila]` (no retira nada), retorna `state`
   sin cambios.
4. Clona `montones = [...state.montones]` y asigna
   `montones[move.fila] = move.dejar`.
5. `quitadas = state.montones[move.fila] - move.dejar`.
6. Si `montones.every(n => n === 0)` (se retiró la última estrella del tablero):
   - `status: 'won'`
   - `winner: state.currentPlayer`
   - `currentPlayer: state.currentPlayer` (sin alternar)
   - `lastMove: { fila: move.fila, quitadas }`
7. En caso contrario:
   - `status: 'playing'`, `winner: null`
   - `currentPlayer: state.currentPlayer === 1 ? 2 : 1`
   - `lastMove: { fila: move.fila, quitadas }`
8. Nunca muta `state` ni `state.montones`.

### `src/games/nim/Board.astro`

- **Markup**:
  - `<TableroJuego class="tablero-nim">`
  - Contenedor `#tablero` con `role="grid"` y `aria-label` describiendo la
    pirámide de estrellas.
  - Cuatro `<div role="row">`, cada uno con `montones[fila]` botones
    `<button type="button" class="estrella" data-fila={f} data-pos={p}>⭐</button>`.
    El markup renderiza la configuración inicial (1, 3, 5, 7); el estado retirado
    se refleja con clases, no quitando nodos.
  - Barra inferior `#barra-confirmar` (oculta por defecto) con `<span>` de texto y
    botones `#nim-confirmar` / `#nim-cancelar`.
  - `aria-label` por estrella: "Fila F, estrella P de N".
- **Estilos**:
  - Ancho fluido `width: min(92vw, 30rem)`; filas centradas con `flex`.
  - `.estrella--quitada` (hueco tenue, `pointer-events: none`).
  - `.estrella--seleccionada` (resalte `--color-accent`).
  - `.estrella--preview` (resalte tenue en hover).
  - `.estrella--ultima` (borde acento sobre hueco).
- **Estado local del componente** (fuera del motor):
  - `seleccion: { fila: number; dejar: number } | null` — jugada pendiente de
    confirmar.
- **Integración con `iniciarSesionJuego<NimMove>`**:
  - `validarMovimiento: esJugadaValida`
  - `onMovimientoRemoto: (move) => jugar(move, false)`
  - `onAplicarReinicio: () => { state = createInitialState(); seleccion = null; render(); }`
  - `onRender: render`
  - `onDesconectar: () => { deshabilitar todas las estrellas y la barra }`
- **`render()`**:
  - Para cada botón: `--quitada` si `pos >= montones[fila]`; `--ultima` si
    pertenece a `lastMove`; `--seleccionada` si cae dentro de `seleccion`.
  - `disabled` en toda estrella si `state.status !== 'playing'` o
    `!sesion.esMiTurno(state.currentPlayer)` o la estrella está retirada.
  - Muestra/oculta `#barra-confirmar` según `seleccion` y turno propio.
  - Si `state.status === 'playing'`:
    `sesion.mostrarTurno({ jugador: state.currentPlayer })`.
  - Si `state.status === 'won'`:
    `sesion.mostrarFinDeJuego({ titulo: \`🎉 ¡Ganó \${sesion.nombres[state.winner!]}! ⭐\` })`.
- **Interacción**:
  - Click en estrella sana `(f, p)`: si ya era la selección exacta → confirmar;
    si no → `seleccion = { fila: f, dejar: p }` y `render()`.
  - `#nim-confirmar`: `jugar({ fila: seleccion.fila, dejar: seleccion.dejar })`.
  - `#nim-cancelar` o `pointerleave` del tablero sobre selección no confirmada
    (sólo limpia el `--preview`, no la `seleccion`): `seleccion = null`, `render()`.
  - `pointerenter` en escritorio: aplica `--preview` al área
    `pos >= p` de la fila `f` sin tocar `seleccion`.
  - `jugar(move, emitirRemoto = true)`: `state = playMove(state, move)`;
    `seleccion = null`; `render()`; si `emitirRemoto` →
    `sesion.enviarMovimiento(move)`.

### `src/content/juegos/nim.md`

```yaml
---
title: "Nim"
description: "Retira estrellas por turnos. Gana quien se lleva la última."
icono: "⭐"
minJugadores: 2
maxJugadores: 2
---
```

Cuerpo:

1. El tablero tiene cuatro filas de estrellas: 1, 3, 5 y 7.
2. En tu turno, elige **una sola fila** y retira **una o más** estrellas de ella.
   Al tocar una estrella se marcan esa y todas las de su derecha en la fila;
   pulsa **Confirmar** para retirarlas.
3. No puedes pasar: siempre debes retirar al menos una estrella.
4. **Gana quien retira la última estrella del tablero.**

### `src/pages/juegos/[slug].astro`

- Import estático: `import NimBoard from '../../games/nim/Board.astro';`
- Entrada en `BOARDS`: `nim: NimBoard`.

### Catálogo

- `abstract-games-by-category/GAME-INDEX.md`: marcar la fila `14-nim.md` como `✅`.

## Batería de pruebas (`src/games/nim/engine.test.ts`)

1. **Estado inicial**:
   - `montones` es `[1, 3, 5, 7]`.
   - `currentPlayer: 1`, `status: 'playing'`, `winner: null`, `lastMove: null`.
2. **Validación de jugadas (`esJugadaValida`)**:
   - Acepta `{ fila: 0, dejar: 0 }`, `{ fila: 3, dejar: 6 }`.
   - Rechaza `fila` fuera de `[0, 3]`, `dejar` negativo, no enteros, `NaN`,
     `null`, arrays, objetos sin campos, strings.
3. **Mecánica de retirada**:
   - `{ fila: 3, dejar: 4 }` sobre el estado inicial: `montones` pasa a
     `[1, 3, 5, 4]`, `lastMove` = `{ fila: 3, quitadas: 3 }`, turno del jugador 2.
   - `{ fila: 0, dejar: 0 }`: retira la única estrella de la fila 0 →
     `montones` `[0, 3, 5, 7]`.
   - No muta el estado ni el array `montones` de entrada.
4. **Protección contra movimientos inválidos**:
   - `{ fila: 1, dejar: 3 }` cuando la fila 1 sólo tiene 3 (no retira nada):
     devuelve el estado sin cambios.
   - `dejar` mayor que el montón actual: sin cambios.
   - Jugar con `status === 'won'`: sin cambios.
   - Payload con forma inválida: sin cambios.
5. **Condición de victoria**:
   - Partida guiada hasta dejar una sola estrella; la jugada que la retira pone
     `status: 'won'`, `winner` = jugador que jugó, `currentPlayer` sin alternar.
   - Vaciar el tablero exige que **todos** los montones lleguen a 0 (no basta con
     vaciar uno).
6. **Partida completa simulada**: secuencia de jugadas de ambos jugadores que
   termina en victoria, verificando alternancia de turnos y `montones` en cada
   paso.
7. **Inmutabilidad**: `playMove` no muta `state` ni `state.montones`.

## Plan de implementación recomendado

Flujo con subagentes y TDD:

- **Paso 1**: Ficha de contenido `src/content/juegos/nim.md`.
- **Paso 2**: Motor `src/games/nim/engine.ts` y tests `src/games/nim/engine.test.ts` (TDD).
- **Paso 3**: Tablero `src/games/nim/Board.astro` y registro en `src/pages/juegos/[slug].astro`.
- **Paso 4**: Marcar `14-nim.md` como `✅` en `GAME-INDEX.md` y verificación
  completa (`npm test`, `astro check`, `npm run build`).
