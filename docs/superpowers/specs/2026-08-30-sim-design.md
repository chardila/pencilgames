# Sim (11º juego) — diseño

Fecha: 2026-08-30
Estado: aprobado

## Resumen

Sim como nuevo juego del catálogo de Pencilgames. Dos jugadores se alternan trazando líneas entre 6 puntos distribuidos en círculo (el grafo completo $K_6$ con 15 aristas posibles). Cada jugador usa su propio color. La regla del juego es *misère* (evitación): **pierde el primer jugador que forme un triángulo monocromático de su propio color** (tres aristas que conectan 3 vértices cerrando un ciclo, trazadas todas por el mismo jugador). 

Por el *Teorema de Ramsey* ($R(3, 3) = 6$), es matemáticamente imposible que una partida completa de Sim en $K_6$ termine en empate; siempre existirá al menos un triángulo monocromático al colorear las 15 aristas.

El juego encaja en la arquitectura existente de Pencilgames:
- Motor funcional puro e inmutable (`src/games/sim/engine.ts`) probado con Vitest (`src/games/sim/engine.test.ts`).
- Componente de tablero SVG interactivo (`src/games/sim/Board.astro`) con soporte táctil híbrido (toque directo a la línea o selección secuencial nodo A $\to$ nodo B).
- Sesión de juego compartida (`iniciarSesionJuego` en `src/lib/gameSession.ts`) con soporte para pasar-y-jugar local y multijugador remoto WebRTC P2P.
- Ficha de contenido en Astro (`src/content/juegos/sim.md`) con las reglas y contexto matemático.
- Registro estático en el router dinámico `src/pages/juegos/[slug].astro`.

---

## Decisiones de diseño

### 1. Grafo y representación de aristas
- **6 vértices** ($0, 1, 2, 3, 4, 5$).
- **15 aristas canónicas**: cada arista se representa como un par no dirigido $(u, v)$ con $0 \le u < v \le 5$.
- Asignación canónica de índices $0..14$:
  - $(0,1)\to 0, (0,2)\to 1, (0,3)\to 2, (0,4)\to 3, (0,5)\to 4$
  - $(1,2)\to 5, (1,3)\to 6, (1,4)\to 7, (1,5)\to 8$
  - $(2,3)\to 9, (2,4)\to 10, (2,5)\to 11$
  - $(3,4)\to 12, (3,5)\to 13$
  - $(4,5)\to 14$
- La función de ordenamiento normaliza cualquier entrada de usuario o mensaje WebRTC con $u > v$ a $(min(u, v), max(u, v))$.

### 2. Detección del triángulo fatal y fin de partida
- Cuando el jugador actual `P` coloca la arista $(u, v)$, se inspeccionan únicamente los 4 vértices restantes $w \in \{0..5\} \setminus \{u, v\}$.
- Si tanto la arista $(u, w)$ como la arista $(v, w)$ pertenecen a `P`:
  - Se detecta el triángulo fatal $[u, v, w]$.
  - El jugador actual `P` **pierde inmediatamente** (`loser = P`, `winner = 3 - P`).
  - `status` pasa a `'finished'`.
  - `losingTriangle` almacena los 3 vértices $[u, v, w]$ para su visualización.
- Si no se forma ningún triángulo propio:
  - El juego continúa y el turno cambia al rival (`currentPlayer = 3 - currentPlayer`).

### 3. Interacción en el tablero (Modelo Híbrido)
- **Tap directo en arista**: Cada línea del SVG cuenta con un área de impacto táctil invisible (`stroke-width: 32px`, `pointer-events: stroke`) para facilitar el toque con el dedo en pantallas táctiles o clic en ratón. Al tocar una arista libre, se ejecuta la jugada y se resetea cualquier nodo seleccionado.
- **Selección nodo por nodo**:
  - Al tocar un nodo $A$, queda seleccionado (`selectedVertex = A`) y se resaltan los nodos y aristas disponibles conectados a él.
  - Tocar el mismo nodo $A$ lo deselecciona.
  - Tocar un nodo $B$ diferente:
    - Si la arista $(A, B)$ no ha sido jugada, se traza la línea inmediatamente y se deselecciona.
    - Si la arista $(A, B)$ ya estaba ocupada, la selección cambia a $B$ (`selectedVertex = B`).
- **Previsualización fantasma (Ghost Preview)**:
  - En desktop / hover: pasar el cursor sobre una arista libre dibuja una línea punteada y translúcida con el color del jugador en turno.
  - Con un nodo $A$ seleccionado: al pasar el ratón sobre otro nodo $B$ libre, se previsualiza la línea conectora.
- **Feedback de fin de partida**:
  - Al finalizar la partida, se renderiza un elemento `<polygon>` que une los 3 vértices del `losingTriangle` con un relleno translúcido y un borde animado/pulsante en el color del perdedor.
  - Se despliega el banner de victoria anunciando al jugador ganador.

---

## Componentes

### 1. Motor puro: `src/games/sim/engine.ts`

```ts
export type Vertex = 0 | 1 | 2 | 3 | 4 | 5;
export type Player = 1 | 2;
export type SimStatus = 'playing' | 'finished';

export interface Edge {
  u: Vertex;
  v: Vertex;
}

export interface SimState {
  edges: (Player | null)[]; // Array de tamaño 15 (índices 0..14)
  currentPlayer: Player;
  status: SimStatus;
  winner: Player | null;
  loser: Player | null;
  losingTriangle: [Vertex, Vertex, Vertex] | null;
  moveHistory: Edge[];
}

export const TOTAL_VERTICES = 6;
export const TOTAL_EDGES = 15;

export function getEdgeIndex(u: number, v: number): number;
export function getEdgeFromIndex(index: number): Edge;
export function getAllEdges(): Edge[];
export function createInitialState(): SimState;
export function esEdgeValido(payload: unknown): payload is Edge;
export function playMove(state: SimState, edge: Edge): SimState;
```

#### Comportamiento de `playMove`:
1. Si `state.status !== 'playing'`, devuelve `state` inalterado.
2. Si `!esEdgeValido(edge)`, devuelve `state`.
3. Normaliza la arista a $u < v$ y obtiene `index = getEdgeIndex(u, v)`.
4. Si `state.edges[index] !== null`, devuelve `state`.
5. Clona el array de aristas y asigna `newEdges[index] = state.currentPlayer`.
6. Verifica si existe algún vértice $w \in \{0..5\} \setminus \{u, v\}$ tal que `newEdges[getEdgeIndex(u, w)] === state.currentPlayer` y `newEdges[getEdgeIndex(v, w)] === state.currentPlayer`.
7. Si existe tal $w$:
   - Retorna nuevo estado con `status: 'finished'`, `winner: state.currentPlayer === 1 ? 2 : 1`, `loser: state.currentPlayer`, `losingTriangle: [u, v, w]`, `moveHistory: [...state.moveHistory, edge]`.
8. Si no existe:
   - Retorna nuevo estado con `status: 'playing'`, `winner: null`, `loser: null`, `losingTriangle: null`, `currentPlayer: state.currentPlayer === 1 ? 2 : 1`, `moveHistory: [...state.moveHistory, edge]`.

---

### 2. Tablero interactivo: `src/games/sim/Board.astro`

- **Contenedor**: `<TableroJuego class="tablero-sim">`
- **SVG**:
  - `viewBox="0 0 400 400"`, `width: min(90vw, 28rem)`, `aspect-ratio: 1`.
  - Coordenadas de los 6 vértices calculadas con radio $R=145$ y centro $(200, 200)$, empezando en el vértice superior en $-90^\circ$.
- **Elementos SVG**:
  - `<polygon class="triangulo-fatal" points="..." />`: renderizado o actualizado en el DOM según `state.losingTriangle`.
  - `<line class="arista-preview" />`: previsualización de trazo.
  - 15 pares de líneas:
    - `<line class="arista-visual" data-indice="..." x1="..." y1="..." x2="..." y2="..." />`: estilos visuales con CSS (`var(--color-player-1)`, `var(--color-player-2)`).
    - `<line class="arista-hitbox" data-u="..." data-v="..." ... />`: área de toque invisible de 32px.
  - 6 nodos / vértices:
    - `<g class="nodo" data-indice="...">`: `<circle r="18" />` + `<text>1..6</text>`.
- **Integración con `iniciarSesionJuego<Edge>`**:
  - `validarMovimiento: esEdgeValido`
  - `onMovimientoRemoto: (edge) => jugar(edge, false)`
  - `onAplicarReinicio: () => { state = createInitialState(); selectedVertex = null; render(); }`
  - `onRender: render`
  - `onDesconectar: () => { /* deshabilita controles */ }`

---

### 3. Ficha de Contenido: `src/content/juegos/sim.md`

```yaml
---
title: "Sim"
description: "Conecta puntos por turnos sin cerrar un triángulo de tu propio color."
icono: "🔺"
minJugadores: 2
maxJugadores: 2
---
```

Cuerpo:
- Presentación de las reglas de Sim (Gustavus Simmons, 1969).
- Explicación de la regla de evitación (*misère*).
- Cómo interactuar (tocar líneas o seleccionar dos vértices).
- Nota sobre el Teorema de Ramsey y la imposibilidad de empatar.

---

### 4. Registro en `src/pages/juegos/[slug].astro`

- Import estático: `import BoardSim from '../../games/sim/Board.astro';`
- Mapeo en `BOARDS`: `sim: BoardSim`.

---

### 5. Catálogo: `abstract-games-by-category/GAME-INDEX.md`

- Actualizar entrada `[04-sim.md](01-2-players/04-sim.md)` con el estado `✅`.

---

## Batería de Pruebas (`src/games/sim/engine.test.ts`)

1. **Inicialización**:
   - 15 aristas en `null`.
   - `currentPlayer: 1`.
   - `status: 'playing'`, `winner: null`, `loser: null`, `losingTriangle: null`.
2. **Indexación y Simetría**:
   - `getEdgeIndex(u, v) === getEdgeIndex(v, u)` para todas las combinaciones.
   - 15 índices unívocos en el rango `[0, 14]`.
   - `getEdgeFromIndex(getEdgeIndex(u, v))` devuelve `{ u: min(u,v), v: max(u,v) }`.
3. **Alternancia de turnos y registro de jugadas**:
   - Jugador 1 traza $(0, 1) \to$ turno pasa a 2, arista 0 marcada con 1.
   - Jugador 2 traza $(1, 2) \to$ turno pasa a 1, arista asignada a 2.
4. **Validación de jugadas (`esEdgeValido` y rechazos)**:
   - Rechaza aristas ocupadas.
   - Rechaza vértices iguales ($u === v$).
   - Rechaza vértices fuera de rango ($< 0$ o $> 5$).
   - Rechaza jugadas cuando `status === 'finished'`.
   - `esEdgeValido` rechaza `null`, `undefined`, números, strings y objetos mal formados.
5. **Detección de derrota por triángulo propio**:
   - Jugador 1 traza $(0, 1)$, $(1, 2)$, $(0, 2) \to$ Jugador 1 pierde (`loser: 1`, `winner: 2`, `losingTriangle: [0, 1, 2]`, `status: 'finished'`).
   - Jugador 2 forma triángulo fatal $\to$ Jugador 2 pierde (`loser: 2`, `winner: 1`).
   - Triángulos formados con aristas de colores combinados (ej. 2 rojas y 1 azul) NO detienen el juego ni causan derrota.
   - Detección correcta de triángulos en cualquier combinación de vértices (ej. $(2, 4, 5)$, $(1, 3, 5)$, etc.).
6. **Inmutabilidad**:
   - `playMove` no muta el estado original ni su array `edges`.

---

## Plan de implementación recomendado

1. **Ficha de contenido**: Crear `src/content/juegos/sim.md`.
2. **Motor puro y pruebas (TDD)**:
   - Crear `src/games/sim/engine.ts`.
   - Crear `src/games/sim/engine.test.ts`.
   - Ejecutar pruebas con Vitest.
3. **Tablero UI e integración**:
   - Crear `src/games/sim/Board.astro`.
   - Registrar en `src/pages/juegos/[slug].astro`.
4. **Catálogo y verificación global**:
   - Actualizar `abstract-games-by-category/GAME-INDEX.md`.
   - Ejecutar suite de pruebas completa y chequeo de tipos (`npm test`, `npx astro check`, `npm run build`).
