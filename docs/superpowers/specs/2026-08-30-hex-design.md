# Hex (10º juego) — diseño

Fecha: 2026-08-30
Estado: aprobado

## Resumen

Hex como décimo juego de Pencilgames. Dos jugadores colocan por turnos una ficha
en un tablero romboidal de celdas hexagonales. El **Jugador 1** conecta el borde
**Norte con el Sur** (arriba a abajo) y el **Jugador 2** conecta el borde
**Oeste con el Este** (izquierda a derecha). **No existen los empates**: el
primer jugador que forme una cadena ininterrumpida de hexágonos de su color entre
sus dos bordes asignados gana inmediatamente.

Sigue el patrón modular del sitio: motor puro (`src/games/hex/engine.ts`) +
interfaz gráfica SVG interactiva (`src/games/hex/Board.astro`) + ficha de
contenido (`src/content/juegos/hex.md`) + registro estático en
`src/pages/juegos/[slug].astro`. Reutiliza `iniciarSesionJuego` para soporte local
y remoto, nombres de jugadores, indicador de turno y banner de fin de partida.

## Decisiones de diseño

### 1. Reglas y modalidades

- **2 jugadores**:
  - Asiento 1: `●` en `var(--color-player-1)` (naranja), conecta Norte-Sur.
  - Asiento 2: `▲` en `var(--color-player-2)` (azul), conecta Oeste-Este.
- **Tamaño configurable por selector inicial**:
  - `5×5` (Rápido): 25 casillas (ideal para tableta pequeña / móvil).
  - `7×7` (Estándar, por defecto): 49 casillas (equilibrio táctico recomendado).
  - `9×9` (Estratégico): 81 casillas (mayor profundidad).
- **Sin regla de intercambio (*Swap / Pie rule*)**:
  - Las asignaciones de bordes y colores son fijas desde el turno 1.
- **Sin empates**:
  - Teorema de Hex: cualquier tablero lleno contiene exactamente un camino
    ganador. El juego concluye en el momento en que se completa la conexión.
- **Victoria única por partida** (sin acumulación de rondas / sin marcador de
  puntos).

### 2. Geometría Hexagonal y Vecindades

El tablero de tamaño $N$ se organiza en $N$ filas ($r \in [0, N-1]$) y $N$
columnas ($c \in [0, N-1]$), almacenado en un arreglo plano de longitud $N^2$ con
índice $i = r \cdot N + c$.

Para cualquier casilla en $(r, c)$, sus **6 vecinos hexagonales** son:
1. Noroeste: $(r - 1, c)$
2. Noreste: $(r - 1, c + 1)$
3. Oeste: $(r, c - 1)$
4. Este: $(r, c + 1)$
5. Suroeste: $(r + 1, c - 1)$
6. Sureste: $(r + 1, c)$

Los límites $0 \le r < N$ y $0 \le c < N$ acotan estrictamente qué vecinos
existen para evitar saltos entre bordes.

### 3. Detección de Victoria (BFS con reconstrucción de ruta)

Tras colocar una ficha:
- Para el **Jugador 1**:
  - Búsqueda en anchura (BFS) iniciando desde todas las casillas ocupadas por J1
    en la fila 0 ($r = 0$).
  - La meta es alcanzar cualquier casilla de J1 en la fila $N-1$ ($r = N-1$).
- Para el **Jugador 2**:
  - Búsqueda en anchura (BFS) iniciando desde todas las casillas ocupadas por J2
    en la columna 0 ($c = 0$).
  - La meta es alcanzar cualquier casilla de J2 en la columna $N-1$ ($c = N-1$).
- **Reconstrucción del camino**: El BFS guarda el mapa de padres (`parentMap`)
  para extraer la lista ordenada de índices (`winningPath: number[]`) que forman
  el enlace ganador.
- Si se detecta camino $\rightarrow$ `status: 'won'`, `winner: currentPlayer`,
  `winningPath = path`, `currentPlayer` sin alternar.
- Si no hay camino $\rightarrow$ alterna `currentPlayer`, `status: 'playing'`,
  `winningPath = null`.

### 4. Renderizado SVG y Tablero en Rombo

- Se dibuja un contenedor `<svg>` con `viewBox` calculado a partir de $N$ y del
  radio de hexágono $R$.
- Orientación de hexágonos verticales (*pointy-topped*):
  - Centro de celda $(r, c)$:
    - $cx = \text{MARGIN} + (c + r \cdot 0.5) \cdot (\sqrt{3} \cdot R)$
    - $cy = \text{MARGIN} + r \cdot (1.5 \cdot R)$
- Vértices de cada hexágono: generados con `polygon` a partir del centro $(cx, cy)$.
- **Bandas perimetrales de color**:
  - Borde Norte (fila 0) y Borde Sur (fila $N-1$): polígonos/líneas gruesas con
    color `var(--color-player-1)`.
  - Borde Oeste (col 0) y Borde Este (col $N-1$): polígonos/líneas gruesas con
    color `var(--color-player-2)`.
- **Fichas y Resaltados**:
  - Ficha colocada: círculo concéntrico con color del jugador y glifo (`●` / `▲`).
  - Última jugada (`lastMove`): borde / anillo de acento destacado.
  - Camino ganador (`winningPath`): celdas iluminadas con pulso visual y una
    línea trazada a través de sus centros.
- **Selector de tamaño**:
  - Botones de selección (`5×5`, `7×7`, `9×9`) mostrados antes del primer
    movimiento. Al pulsar uno, se reinicia el estado con el nuevo tamaño.

## Componentes y Arquitectura

### `src/games/hex/engine.ts`

```ts
export type Player = 1 | 2;
export type CellValue = Player | null;
export type GameStatus = 'playing' | 'won';
export type BoardSize = 5 | 7 | 9;

export interface HexState {
  size: BoardSize;
  board: CellValue[];           // size * size celdas (índice = r * size + c)
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
  winningPath: number[] | null; // índices de casillas de la ruta ganadora
  lastMove: number | null;
}

export function createInitialState(size?: BoardSize): HexState;
export function esJugadaValida(payload: unknown, size?: BoardSize): payload is number;
export function getNeighbors(index: number, size: BoardSize): number[];
export function findWinningPath(board: CellValue[], size: BoardSize, player: Player): number[] | null;
export function playMove(state: HexState, index: number): HexState;
```

### `src/games/hex/Board.astro`

- Estructura con `<TableroJuego class="tablero-hex">`.
- Selector de tamaño `5×5 | 7×7 | 9×9` activo al inicio de partida.
- Tablero `<svg>` interactivo con soporte táctil y de teclado (`tabindex="0"`,
  `role="button"`, `aria-label`).
- Integración con `iniciarSesionJuego<number>`:
  - `validarMovimiento: (p) => esJugadaValida(p, state.size)`
  - `onMovimientoRemoto: (idx) => jugar(idx, false)`
  - `onAplicarReinicio`: reinicia el tablero con el tamaño actual.
  - `onRender`: actualiza el SVG, los turnos y el banner de victoria.

### `src/content/juegos/hex.md`

```yaml
title: "Hex"
description: "Conecta tus dos lados opuestos del tablero con una cadena ininterrumpida de hexágonos."
icono: "🔷"
minJugadores: 2
maxJugadores: 2
```

Instrucciones claras para los jugadores explicando la meta de conectar bordes y
la ausencia de empates.

### `src/pages/juegos/[slug].astro`

- `import HexBoard from '../../games/hex/Board.astro';`
- Entrada `hex: HexBoard` en `BOARDS`.

### Backlog

- Marcar `05-hex.md` en `abstract-games-by-category/GAME-INDEX.md` con ✅.

## Pruebas Unitarias (`src/games/hex/engine.test.ts`)

- **Estado inicial**:
  - Tamaños por defecto (7), y parametrizados (5 y 9).
  - Array con $N^2$ casillas en `null`.
  - `currentPlayer: 1`, `status: 'playing'`, `winner: null`, `winningPath: null`, `lastMove: null`.
- **Validación de jugadas**:
  - Acepta enteros en $[0, N^2 - 1]$.
  - Rechaza negativos, desbordes superiores, no enteros, strings, objetos y `null`.
- **Cálculo de vecinos hexagonales (`getNeighbors`)**:
  - Casilla central: exactamente 6 vecinos correctos.
  - Esquinas: número exacto sin cruce de fila.
  - Bordes laterales: vecinos acotados sin desborde entre columnas 0 y $N-1$.
- **Mecánica de jugada (`playMove`)**:
  - Colocación de ficha del jugador activo y fijación de `lastMove`.
  - Alternancia de turno cuando no hay victoria.
  - Casilla ocupada, índice inválido o partida terminada devuelven el estado sin mutación.
- **Detección de victoria (`findWinningPath`)**:
  - Victoria de J1 (conexión vertical Norte-Sur).
  - Victoria de J2 (conexión horizontal Oeste-Este).
  - Conexión no lineal / zig-zag.
  - Camino roto con un espacio intermedio no declara victoria.
  - Bloqueo por fichas del rival.
  - `winningPath` contiene la lista completa de índices ordenados del enlace ganador.
- **Inmutabilidad**:
  - Verificación de que `playMove` no muta el `state` original ni su `board`.

## Trabajo fuera de alcance

- Regla de intercambio (*pie rule*).
- IA oponente.
- Tableros no romboidales.
