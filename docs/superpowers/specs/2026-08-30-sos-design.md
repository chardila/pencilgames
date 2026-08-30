# SOS — Diseño

Fecha: 2026-08-30  
Estado: aprobado (brainstorming), pendiente de plan de implementación.

## Resumen

SOS es un clásico juego de lápiz y papel para dos jugadores disputado sobre una cuadrícula de **6×6 casillas**. En cada turno, el jugador activo elige colocar una letra (**S** o bien **O**) en cualquier casilla vacía del tablero. 

Si la jugada completa una o más secuencias en línea recta de tres letras `S-O-S` (horizontal, vertical o diagonal):
- El jugador suma **1 punto** por cada SOS completado.
- Se traza una línea visual del color de ese jugador cruzando las tres letras correspondientes.
- El jugador **mantiene el turno** (bonificación de jugada repetida).

Si no se forma ningún SOS, el turno pasa al rival. La partida termina cuando se llena la cuadrícula (36 casillas). Gana el jugador con mayor puntaje acumulado; si empatan, se declara empate.

El juego encaja de forma natural en la arquitectura de la aplicación: motor puro inmutable (`engine.ts`), pruebas exhaustivas en Vitest (`engine.test.ts`), componente visual (`Board.astro`) con `<TableroJuego>`, sesión compartida (`gameSession.ts`), soporte multijugador local y remoto P2P/relay, y registro dinámico en las colecciones de contenido de Astro.

## Decisiones de diseño y alcance

1. **Tamaño del tablero**: Cuadrícula fija de **6×6** (36 casillas). Brinda partidas de 3 a 5 minutos, con blancos táctiles holgados para dispositivos móviles y tabletas sin requerir scroll horizontal.
2. **Selección de letra**: Selector segmentado `[ S | O ]` ubicado sobre el tablero. El jugador selecciona la letra activa con un tap y luego toca la casilla donde desea colocarla. La letra seleccionada persiste entre turnos para agilidad, pero es fácilmente cambiable en cualquier momento.
3. **Representación visual de SOS**: Capa `<svg>` superpuesta y escalable mediante `viewBox="0 0 600 600"` con trazos `<line>` de punta redondeada (`stroke-linecap="round"`), coloreados con la identidad visual del jugador que anotó el punto (`var(--color-player-1)` en naranja y `var(--color-player-2)` en azul).
4. **Múltiples SOS simultáneos**: Una sola letra colocada puede completar 2, 3 o hasta 4 secuencias SOS a la vez (por ejemplo, una `'O'` en medio de varias `'S'` adyacentes). Todas las secuencias se detectan, se suman individualmente al marcador y se trazan.
5. **No repetición de líneas antiguas**: Solo se evalúan y puntúan las secuencias SOS formadas directamente por la letra recién colocada en la casilla actual.
6. **Modo Remoto (P2P / Relay)**: Integración total con `iniciarSesionJuego` enviando el payload `{ row, col, letter }`, con bloqueo de tablero y selector de letra cuando no es el turno del jugador en partidas remotas.

## Arquitectura

Sigue la estructura establecida en el proyecto:

```
src/games/sos/
├── engine.ts        # Lógica pura del juego, tipos y validaciones (sin DOM)
├── engine.test.ts   # Pruebas unitarias completas con Vitest
└── Board.astro       # UI, selector de letra, SVG de trazos y conexión con gameSession
src/content/juegos/sos.md   # Metadata de la colección e instrucciones
src/pages/juegos/[slug].astro   # Registro del componente en el mapa estático BOARDS
```

---

### 1. Motor Lógico (`src/games/sos/engine.ts`)

#### Tipos

```ts
export type Player = 1 | 2;
export type Letter = 'S' | 'O';
export type CellValue = Letter | null;
export type GameStatus = 'playing' | 'finished';

export interface Point {
  row: number;
  col: number;
}

export interface SOSLine {
  from: Point;
  to: Point;
  player: Player;
}

export interface Move {
  row: number;
  col: number;
  letter: Letter;
}

export interface SOSState {
  size: number;
  board: CellValue[][];
  completedLines: SOSLine[];
  currentPlayer: Player;
  scores: Record<Player, number>;
  status: GameStatus;
  winner: Player | 'draw' | null;
  lastMove: Move | null;
}
```

#### Funciones Principales

- **`createInitialState(size = 6): SOSState`**:
  Crea la cuadrícula de `size × size` inicializada con `null`, `completedLines: []`, `currentPlayer: 1`, `scores: { 1: 0, 2: 0 }`, `status: 'playing'`, `winner: null`, `lastMove: null`.

- **`esJugadaValida(payload: unknown): payload is Move`**:
  Comprueba que `payload` sea un objeto con:
  - `row`: entero en `[0, size - 1]`
  - `col`: entero en `[0, size - 1]`
  - `letter`: estrictamente `'S'` o `'O'`
  Usado por `gameSession.validarMovimiento` para proteger el estado contra mensajes remotos corruptos o manipulados.

- **`playMove(state: SOSState, move: Move): SOSState`**:
  Función pura que devuelve el nuevo estado inmutable:
  1. Si `state.status !== 'playing'`, o `move.row`/`move.col` están fuera de rango, o `board[move.row][move.col] !== null`, retorna `state` sin cambios.
  2. Crea copias profundas del tablero, lista de líneas y marcador.
  3. Establece `board[move.row][move.col] = move.letter`.
  4. **Algoritmo de Detección de SOS**:
     - **Si `move.letter === 'O'`**:
       Inspecciona los 4 ejes cardinales/diagonales con centro en `(r, c)`:
       - Horizontal: `(r, c-1)` y `(r, c+1)`
       - Vertical: `(r-1, c)` y `(r+1, c)`
       - Diagonal ↘: `(r-1, c-1)` y `(r+1, c+1)`
       - Diagonal ↗: `(r-1, c+1)` y `(r+1, c-1)`
       Si ambas casillas extremas están dentro del tablero y contienen `'S'`, se registra la nueva línea SOS `from: (r1, c1)` a `to: (r2, c2)`.
     - **Si `move.letter === 'S'`**:
       Inspecciona las 8 direcciones `(dr, dc)`:
       - Comprueba si `(r + dr, c + dc)` contiene `'O'` y `(r + 2*dr, c + 2*dc)` contiene `'S'`.
       - Valida que `0 <= r + 2*dr < size` y `0 <= c + 2*dc < size`.
       - Para evitar duplicados en representaciones opuestas, las líneas se normalizan ordenando los puntos `from`/`to`.
  5. **Actualización de Puntos y Turno**:
     - Por cada línea SOS nueva descubierta:
       `completedLines.push({ from, to, player: state.currentPlayer })`
       `scores[state.currentPlayer] += 1`
     - Si se formaron una o más líneas: el jugador **repite su turno** (`currentPlayer` no cambia).
     - Si no se formó ninguna línea: el turno alterna (`currentPlayer = currentPlayer === 1 ? 2 : 1`).
  6. **Comprobación de Finalización**:
     - Si todas las casillas están ocupadas (`board.every(row => row.every(c => c !== null))`):
       - `status = 'finished'`
       - Si `scores[1] > scores[2]` → `winner = 1`
       - Si `scores[2] > scores[1]` → `winner = 2`
       - Si `scores[1] === scores[2]` → `winner = 'draw'`

---

### 2. Componente de Interfaz (`src/games/sos/Board.astro`)

#### Markup

Envuelto en `<TableroJuego class="tablero-sos">`:
1. **Selector de Letra**:
   Contenedor con dos botones `[S]` y `[O]` que actúan como radio buttons accesibles (`role="radiogroup"`, `role="radio"`).
2. **Contenedor del Tablero**:
   Contenedor con `position: relative`, `aspect-ratio: 1`, `width: min(92vw, 26rem)`:
   - `<svg class="tablero-sos__lineas" viewBox="0 0 600 600">`: Capa de trazado vectorial con `pointer-events: none`.
   - `<div id="tablero-grid" class="tablero-sos__grid">`: Cuadrícula CSS `repeat(6, 1fr)` con 36 elementos `<button class="casilla">`.

#### Trazado Vectorial SVG

- Cada celda en el espacio del `viewBox` (600×600) mide $100 \times 100$.
- El centro de la celda `(row, col)` es:
  $$cx = col \times 100 + 50$$
  $$cy = row \times 100 + 50$$
- Para cada línea en `state.completedLines`, se genera:
  ```html
  <line
    x1={x1} y1={y1}
    x2={x2} y2={y2}
    class={`linea-sos linea-sos--p${line.player}`}
    stroke-linecap="round"
  />
  ```
- Estilos CSS:
  - `.linea-sos--p1`: `stroke: var(--color-player-1); stroke-width: 6px; opacity: 0.85;`
  - `.linea-sos--p2`: `stroke: var(--color-player-2); stroke-width: 6px; opacity: 0.85;`

#### Lógica del Script de Cliente

- Se inicializa la sesión mediante `iniciarSesionJuego<Move>`.
- Control de interacción:
  - Click en selector de letra → actualiza `letraActiva` y estilos del botón activo.
  - Click en casilla `(r, c)` → si es válida y es mi turno, llama a `jugar({ row: r, col: c, letter: letraActiva })`.
- Función `render()`:
  - Actualiza el texto de las casillas (`'S'`, `'O'` o vacío).
  - Gestiona `disabled` según ocupación de casilla, fin de juego o turno remoto.
  - Aplica la clase `.casilla--ultima` a la última jugada para referencia visual clara.
  - Re-renderiza las líneas `<line>` dentro del SVG.
  - Actualiza el indicador de turno (`sesion.mostrarTurno`):
    - Marcador continuo: `marcador: { 1: { nombre: ..., puntaje: ... }, 2: { nombre: ..., puntaje: ... } }`.
    - Mensaje de repetición cuando corresponda: `repiteTurno: true`, `motivoRepeticion: '✨ ¡SOS completado! Vuelves a jugar'`.
  - Muestra el modal/banner de victoria o empate al finalizar (`sesion.mostrarFinDeJuego`).
- Soporte para teclado: Las casillas son `<button>` nativos navegables por foco/tabulador y accionables con Enter/Espacio. Las teclas `S` y `O` en el teclado permiten alternar rápidamente la letra activa.

---

### 3. Ficha de Contenido (`src/content/juegos/sos.md`)

```yaml
---
title: "SOS"
description: "Coloca letras S u O en una cuadrícula de 6×6 y suma puntos completando secuencias S-O-S."
icono: "🆘"
minJugadores: 2
maxJugadores: 2
---

1. El juego se disputa sobre un tablero de 6×6 casillas.
2. En cada turno, el jugador activo elige colocar una **S** o una **O** en cualquier casilla vacía.
3. Si la letra colocada completa una o más secuencias **S-O-S** en línea recta (horizontal, vertical o diagonal):
   - El jugador suma **1 punto** por cada SOS formado.
   - Se traza una línea del color del jugador sobre las tres letras.
   - El jugador **vuelve a jugar** (mantiene el turno).
4. Si la jugada no forma ningún SOS, el turno pasa al rival.
5. La partida finaliza cuando el tablero queda completamente lleno (36 casillas). Gana quien haya obtenido más puntos; si empatan en puntaje, es un empate.
```

---

### 4. Registro en Rutas (`src/pages/juegos/[slug].astro`)

```ts
import SOSBoard from '../../games/sos/Board.astro';

const BOARDS = {
  'tres-en-raya': TresEnRayaBoard,
  'puntos-y-cajas': PuntosYCajasBoard,
  'agujero-negro': AgujeroNegroBoard,
  conquista: ConquistaBoard,
  notakto: NotaktoBoard,
  sos: SOSBoard,
} as const;
```

---

### 5. Estrategia de Pruebas Unitarias (`src/games/sos/engine.test.ts`)

Pruebas exhaustivas con Vitest siguiendo la metodología TDD:

1. **Inicialización**:
   - Tablero 6×6 con todas las casillas en `null`.
   - `scores` en `{ 1: 0, 2: 0 }`, `currentPlayer: 1`, `status: 'playing'`, `completedLines: []`.
2. **Validación de Jugadas (`esJugadaValida`)**:
   - Acepta objetos válidos `{ row: 0, col: 0, letter: 'S' }`, `{ row: 5, col: 5, letter: 'O' }`.
   - Rechaza filas/columnas fuera de rango (`-1`, `6`, `3.5`), letras inválidas (`'X'`, `''`), `null`, primitivos y objetos incompletos.
3. **Flujo Básico de Turnos**:
   - Colocación válida actualiza la matriz.
   - Si no hay SOS, alterna el turno de 1 a 2 y viceversa.
   - Jugadas sobre casillas ocupadas devuelven el estado intacto.
   - Jugadas tras finalizar la partida devuelven el estado intacto.
4. **Detección de SOS al colocar `'O'`**:
   - Horizontal: `S (0,0)` y `S (0,2)` con `O (0,1)` → suma 1 punto, registra línea `(0,0)-(0,2)` y retiene el turno.
   - Vertical: `S (0,0)` y `S (2,0)` con `O (1,0)`.
   - Diagonales descendente y ascendente.
   - Múltiples líneas simultáneas (ej. `O` central completando 2, 3 o 4 líneas a la vez).
5. **Detección de SOS al colocar `'S'`**:
   - `_ O S` colocando la `S` inicial o `S O _` colocando la `S` final en las 8 direcciones.
6. **Límites de Cuadrícula y No-Envolvimiento**:
   - Letras en bordes opuestos de filas adyacentes no deben formar SOS falsos.
   - Manejo seguro de índices sin desbordamiento en filas/columnas `0` y `5`.
7. **Finalización y Resultados**:
   - Cuadrícula completa con victoria del Jugador 1 (`scores[1] > scores[2]`).
   - Cuadrícula completa con victoria del Jugador 2 (`scores[2] > scores[1]`).
   - Cuadrícula completa con empate (`scores[1] === scores[2]`).
8. **Inmutabilidad**:
   - Comprobar que `playMove` no muta el estado ni el array de entrada.

---

### 6. Verificación de Aceptación

- `npm test` ejecuta todos los tests de SOS en verde.
- `npx astro check` pasa sin errores de tipado.
- `npm run build` compila exitosamente la ruta `/juegos/sos`.
- SOS aparece en la lista de juegos del home y responde en el buscador.
- Partida local funcional con trazado de líneas y repetición de turno.
- Partida remota sincronizada correctamente vía WebRTC.
