# Chomp (8º juego) — diseño

Fecha: 2026-08-30
Estado: aprobado

## Resumen

Chomp como octavo juego del sitio web de Pencilgames. Dos jugadores se alternan comiendo porciones de una tableta de chocolate de 4 filas por 7 columnas (28 onzas). La onza superior izquierda `(0, 0)` está envenenada (`☠️`). Cada jugador en su turno elige una onza sana; esa onza y todas las que se encuentren abajo y a la derecha de ella son devoradas. Gana el jugador que obligue a su rival a quedarse únicamente con la onza envenenada (fin automático al dejar solo el veneno).

El juego encaja en la arquitectura existente: motor puro (`engine.ts`) con pruebas unitarias en Vitest (`engine.test.ts`), componente de tablero (`Board.astro`) con `<TableroJuego>`, sesión de juego compartida (`iniciarSesionJuego` de `gameSession.ts`) con soporte local y remoto por WebRTC P2P, ficha de contenido en Astro (`src/content/juegos/chomp.md`) y registro estático en `src/pages/juegos/[slug].astro`.

## Decisiones de diseño

### 1. Dimensiones del tablero
- **4 filas × 7 columnas** (28 casillas, índices `0` a `27` en orden fila-mayor).
- Proporción clásica de barra de chocolate (rectangular alargada).
- Mantiene celdas con suficiente área táctil en teléfonos y tabletas sin requerir scroll horizontal ni zoom.

### 2. Reglas y activación del veneno
- La casilla `0` (Fila 0, Columna 0) contiene la onza envenenada (`☠️`).
- **Casilla 0 no interactiva**: La casilla `0` está deshabilitada durante la partida para evitar clics accidentales.
- **Victoria / Fin de juego**: Cuando un jugador realiza un movimiento que deja exactamente **1 casilla viva** (la casilla `0`), ese jugador **gana inmediatamente** (`status: 'won'`, `winner: currentPlayer`), ya que el rival no cuenta con ninguna jugada sana disponible.
- **Movimiento válido**: Elegir cualquier casilla `i` en el rango `[1, 27]` que esté intacta (`board[i] === true`).
- **Efecto del mordisco**: Para cualquier casilla `k` en el tablero con `fila(k) >= fila(i)` y `col(k) >= col(i)`, si está intacta se marca como comida (`board[k] = false`).

### 3. Experiencia visual y UX
- **Estética de tableta**: Onzas con tono marrón chocolate y bisel / relieve 3D suave.
- **Onzas comidas**: Se muestran como huecos vacíos / ranuras de la bandeja de chocolate (fondo transparente/hundido), inaccesibles y deshabilitadas.
- **Onza envenenada**: Visualmente destacada con fondo oscuro y glifo `☠️`.
- **Previsualización interactiva (Hover en desktop)**: Al pasar el cursor sobre una onza sana `(r, c)`, se resalta visualmente el sub-rectángulo `(i >= r, j >= c)` que sería devorado si se hace clic. En pantallas táctiles, un toque ejecuta el mordisco directamente.
- **Feedback de último mordisco (`lastEaten`)**: Las casillas devoradas en la jugada recién completada conservan un indicador sutil para que en modo remoto y en pasar-y-jugar quede claro qué área desapareció.

## Componentes

### `src/games/chomp/engine.ts` (Motor puro sin DOM)

```ts
export type Player = 1 | 2;
export type GameStatus = 'playing' | 'won';

export interface ChompState {
  board: boolean[];             // 28 casillas: true = presente, false = comida
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  lastEaten: number[];          // Índices comidos en el último turno
  lastMove: number | null;       // Casilla clickeada en el último turno
}

export const FILAS = 4;
export const COLUMNAS = 7;
export const TOTAL_CASILLAS = FILAS * COLUMNAS; // 28
export const INDICE_VENENO = 0;

export function createInitialState(): ChompState;
export function esJugadaValida(payload: unknown): payload is number;
export function playMove(state: ChompState, index: number): ChompState;
```

#### Reglas de `playMove`:
1. Si `state.status !== 'playing'`, retorna `state` sin cambios.
2. Si `!esJugadaValida(index)` o `index === INDICE_VENENO` o `!state.board[index]`, retorna `state` sin cambios.
3. Calcula `filaJugada = Math.floor(index / COLUMNAS)` y `colJugada = index % COLUMNAS`.
4. Clona el tablero `board = [...state.board]`.
5. Itera todas las casillas `0..27`: si `board[i]` está activa y `Math.floor(i / COLUMNAS) >= filaJugada && (i % COLUMNAS) >= colJugada`, pone `board[i] = false` y agrega `i` a `eaten`.
6. Cuenta cuántas casillas permanecen en `true`.
7. Si el conteo de casillas vivas es `1` (solo queda el veneno en `INDICE_VENENO`):
   - `status: 'won'`
   - `winner: state.currentPlayer`
   - `currentPlayer: state.currentPlayer` (sin alternar)
   - `lastEaten: eaten`
   - `lastMove: index`
8. Si quedan `> 1` casillas vivas:
   - `status: 'playing'`
   - `winner: null`
   - `currentPlayer: state.currentPlayer === 1 ? 2 : 1`
   - `lastEaten: eaten`
   - `lastMove: index`

### `src/games/chomp/Board.astro`

- **Markup**:
  - `<TableroJuego class="tablero-chomp">`
  - Contenedor `#tablero.tablero-chomp__grid` con `role="grid"` y `grid-template-columns: repeat(7, 1fr)`.
  - 28 botones `<button type="button" class="casilla" data-indice={i}>`.
- **Estilos**:
  - Ancho fluido `width: min(92vw, 34rem)`.
  - Relieve y color chocolate para casillas activas.
  - Clase `.casilla--veneno` para la casilla 0 (`☠️`).
  - Clase `.casilla--comida` para las casillas ya devoradas.
  - Clase `.casilla--hover-preview` para las casillas en el área del mordisco al pasar el mouse.
- **Integración con `iniciarSesionJuego<number>`**:
  - `validarMovimiento: esJugadaValida`
  - `onMovimientoRemoto: (indice) => jugar(indice, false)`
  - `onAplicarReinicio: () => { state = createInitialState(); render(); }`
  - `onRender: render`
  - `onDesconectar: () => casillas.forEach(c => c.disabled = true)`
- **Renderizado**:
  - Deshabilita casilla 0 siempre.
  - Deshabilita casillas comidas o si `!sesion.esMiTurno(state.currentPlayer)`.
  - Si `state.status === 'playing'`: `sesion.mostrarTurno({ jugador: state.currentPlayer })`.
  - Si `state.status === 'won'`: `sesion.mostrarFinDeJuego({ titulo: \`🎉 ¡Ganó \${sesion.nombres[state.winner!]}! 🍫\` })`.

### `src/content/juegos/chomp.md`

```yaml
---
title: "Chomp"
description: "Muerde la barra de chocolate y obliga a tu rival a quedarse con la onza envenenada."
icono: "🍫"
minJugadores: 2
maxJugadores: 2
---
```

Cuerpo:
1. El tablero es una tableta de chocolate de 4×7 onzas.
2. La onza superior izquierda (`☠️`) está envenenada.
3. Por turnos, cada jugador elige una onza sana para comer. Al morderla, se come esa onza y **todas** las que estén abajo y a su derecha.
4. Gana el jugador que logre dejar únicamente la onza envenenada en el tablero, dejando a su rival sin escapatoria.

### `src/pages/juegos/[slug].astro`

- Import estático: `import ChompBoard from '../../games/chomp/Board.astro';`
- Entrada en `BOARDS`: `chomp: ChompBoard`.

### Catálogo

- `abstract-games-by-category/GAME-INDEX.md`: marcar `12-chomp.md` como `✅`.

## Batería de pruebas (`src/games/chomp/engine.test.ts`)

1. **Estado inicial**:
   - Tablero con 28 elementos en `true`.
   - `currentPlayer: 1`.
   - `status: 'playing'`, `winner: null`, `lastEaten: []`, `lastMove: null`.
2. **Validación de jugadas (`esJugadaValida`)**:
   - Acepta enteros en `[1, 27]`.
   - Rechaza `0` (casilla envenenada), `< 0`, `> 27`, decimales, `null`, strings y objetos.
3. **Mecánica de mordiscos**:
   - Jugada en casilla `(3, 6)` (índice 27): come únicamente la casilla 27.
   - Jugada en casilla `(0, 1)` (índice 1): come todas las casillas con columna `>= 1` (elimina 24 casillas, deja solo la columna 0).
   - Jugada en casilla `(1, 0)` (índice 7): come todas las casillas con fila `>= 1` (elimina 21 casillas, deja solo la fila 0).
   - Jugada en `(1, 1)` (índice 8): come 18 casillas, preservando fila 0 y columna 0 intactas.
   - Múltiples jugadas consecutivas: el estado acumulado preserva la forma monótona del chocolate.
4. **Protección contra movimientos inválidos**:
   - Jugar sobre una casilla ya comida (`board[i] === false`): devuelve el estado sin modificar.
   - Jugar sobre el veneno (`0`): devuelve el estado sin modificar.
   - Jugar cuando `status === 'won'`: devuelve el estado sin modificar.
5. **Condición de victoria**:
   - Jugada que elimina todas las onzas restantes excepto el veneno `0`:
     - `status` cambia a `'won'`.
     - `winner` se asigna al jugador que ejecutó el mordisco.
     - `currentPlayer` no cambia.
6. **Inmutabilidad**:
   - `playMove` no muta el objeto `state` original ni su array `board`.

## Plan de implementación recomendado

Seguir el flujo con subagentes y TDD:
- **Paso 1**: Ficha de contenido `src/content/juegos/chomp.md`.
- **Paso 2**: Motor `src/games/chomp/engine.ts` y tests `src/games/chomp/engine.test.ts` (TDD).
- **Paso 3**: Tablero UI `src/games/chomp/Board.astro` y registro en `src/pages/juegos/[slug].astro`.
- **Paso 4**: Actualización de `abstract-games-by-category/GAME-INDEX.md` y verificación completa (`npm test`, `astro check`, `npm run build`).
