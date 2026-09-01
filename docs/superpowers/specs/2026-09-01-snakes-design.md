# Serpientes (Snakes) — 17.º juego — diseño

Fecha: 2026-09-01
Estado: aprobado

## Resumen

Serpientes (reglas base en `abstract-games-by-category/01-2-players/42-snakes.md`)
como decimoséptimo juego del sitio. Dos jugadores alternan; cada uno posee una
serpiente con un punto de salida fijo en una retícula de 7×7 puntos. En su
turno, un jugador **extiende su propia serpiente un segmento** desde la cabeza
hacia un punto ortogonalmente adyacente y libre. Un punto está libre si no lo
usa ninguna de las dos serpientes. **Pierde el jugador que, en su turno, no
puede extender su serpiente**; gana el rival. No hay empate.

Encaja en el patrón de los 16 juegos anteriores: motor puro (`engine.ts`) +
`Board.astro` + ficha de contenido + registro en `[slug].astro`. Reutiliza
`iniciarSesionJuego`, el indicador de turno compartido, el banner de fin de
juego y la identidad visual de jugadores. No introduce Worker ni protocolo
remoto nuevo. El render SVG calca a `hex/Board.astro` (retícula de celdas con
foco y `aria-label`), no a `sim` (que es el grafo completo K6).

Slug del juego: `snakes` (directorio en inglés, como `battleship`).
Título mostrado: **"Serpientes"** (nombre común, se traduce; precedente:
`battleship` → "Batalla naval").

## Decisiones de diseño

### Reglas (fijadas en este spec)

- **Retícula de 7×7 puntos**, 49 índices `0..48`, orden fila-mayor:
  `índice = 7·fila + col`, `fila = Math.floor(i / 7)`, `col = i % 7`. No
  configurable (la variante 5×5 / 7×5 de `42-snakes.md` queda fuera de
  alcance).
- **Puntos de salida (pre-marcados como usados en el estado inicial):**
  - Asiento 1 → `(fila 1, col 1)` = índice **8**.
  - Asiento 2 → `(fila 5, col 5)` = índice **40**.
  - Son simétricos respecto al centro (índice 24), por lo que la apertura es
    justa. El asiento 1 (primer jugador) toma el punto 8 para conservar la
    geometría de las reglas ("Blue" arriba-izquierda, "Red" abajo-derecha).
    Los colores "Blue"/"Red" del texto original son cosméticos y se ignoran:
    se usa la convención del repo (ver identidad visual).
- **Turno:** el jugador extiende su serpiente un segmento desde su cabeza
  hacia un punto **ortogonalmente adyacente** (arriba/abajo/izquierda/derecha,
  no diagonal) que esté **libre**. "Libre" = ese índice no aparece en el
  camino de ninguna de las dos serpientes. Hay como máximo 4 destinos
  posibles; puede haber 0.
- **Segmentos vs. puntos.** En una retícula ortogonal, dos segmentos
  unitarios entre puntos adyacentes solo pueden compartir extremos (nunca se
  cruzan "en medio"), así que las cláusulas "no cruzar ni tocar un punto ya
  usado" y "no reutilizar un segmento" quedan **ambas implicadas por la regla
  de punto de un solo uso**. Por eso el motor **no rastrea segmentos**: basta
  el conjunto de puntos usados (derivado de los caminos) y la posición de
  cada cabeza. Esta nota va en el spec para que quien lea `42-snakes.md` no
  se pregunte por qué falta el tracking de segmentos.
- **Fin de partida:** si al iniciar su turno el jugador actual no tiene
  ningún vecino libre para su cabeza, **ese jugador pierde** y el rival gana.
- **Sin empate.** Siempre hay un jugador que no puede mover en su turno antes
  que el otro. Aunque una jugada deje a **ambas** serpientes encerradas, el
  siguiente en turno es quien pierde (y el otro gana), aunque el ganador
  también estuviera bloqueado. Es la lectura literal de "si el jugador actual
  no puede extender, pierde", y es lo que hace que "sin empate" sea un hecho,
  no un supuesto.
- **El auto-encierro NO termina la partida de inmediato.** Si P1 mueve a un
  callejón sin salida y deja su propia cabeza con 0 vecinos libres, la
  partida **sigue**: el turno pasa a P2. La partida solo termina cuando le
  toca el turno a un jugador sin jugada legal. (Este es el error más probable
  al copiar de Obstrucción — ver más abajo.)
- **Victoria única por partida.** Sin puntaje acumulado entre rondas. El
  indicador de turno no lleva `puntajes` (igual que Obstrucción, Sim,
  Domineering, Gomoku, Notakto).

### Identidad visual

- Asiento 1 = `●` en `var(--color-player-1)` (naranja); asiento 2 = `▲` en
  `var(--color-player-2)` (azul). Consistente con la identidad visual de
  jugadores ya fusionada. Cada serpiente se dibuja en el color de su asiento.

### Detección de fin: legalidad **por jugador** (riesgo principal)

Obstrucción hace un escaneo **global**: "¿alguna de las 36 casillas es
legal?". En Serpientes la legalidad es **por jugador**: las opciones de P1 son
los vecinos ortogonales libres de `cabeza1`; las de P2, las de `cabeza2`; son
conjuntos independientes. La función del motor debe leer **solo** la cabeza
del jugador consultado.

Regla de transición tras aplicar la jugada de `currentPlayer`:

1. Se añade el índice destino al camino de `currentPlayer` (nueva cabeza).
2. Se calcula `vecinosLibres(nuevoEstado, rival)`.
3. Si está **vacío** → `status: 'won'`, `winner: currentPlayer`,
   `currentPlayer` **sin alternar**.
4. Si tiene al menos un elemento → se alterna `currentPlayer`,
   `status: 'playing'`, `winner: null`.

**Acotado de borde.** Al derivar los 4 vecinos de un índice hay que validar
`fila` y `col` por separado: el vecino "a la derecha" del índice 6
(`fila 0, col 6`) no debe ser el índice 7 (`fila 1, col 0`). Para cada
desplazamiento `(df, dc)` en `[-1,0] [1,0] [0,-1] [0,1]` se valida
`0 ≤ fila+df < 7` **y** `0 ≤ col+dc < 7` antes de considerar esa vecina.
Cubierto con tests explícitos para esquinas y bordes.

### Estado: el camino ordenado es la fuente de verdad

Para dibujar una serpiente se necesita su polilínea. Derivarla de un coloreo
por-punto obligaría a recorrer adyacencias. En su lugar se guarda el camino
ordenado:

```ts
caminos: Record<Player, number[]>;  // índices en orden de dibujo; la cabeza es el último
```

- La **ocupación** (`usados`) se deriva de la unión de ambos caminos.
- La **cabeza** de un jugador es `caminos[jugador].at(-1)`.
- No se guarda un array plano `usados` en el estado: `usados(state)` es una
  función derivada que devuelve un `Set<number>`. Las comprobaciones de
  libertad en `playMove` / `vecinosLibres` usan ese `Set` (construido una vez
  por llamada).
- **Sin campo `lastMove`.** En Serpientes la cabeza **es** la última jugada,
  así que el marcador de cabeza ya da a los jugadores remotos la señal de
  "qué cambió" que `lastMove` aporta en Obstrucción. Se documenta aquí para
  que la implementación no añada un campo redundante por inercia.

### Interacción y ayudas visuales (decisión A)

- La cabeza de cada serpiente se marca de forma distintiva (círculo mayor con
  el glifo del asiento).
- En el turno del jugador local, los `vecinosLibres(state, currentPlayer)`
  (≤4 puntos) se resaltan con una animación de pulso y son clicables.
- Todos los demás puntos quedan no clicables (`aria-disabled` / sin listener
  activo). No se resalta nada del rival.
- Análogo en positivo al sombreado de casillas muertas de Obstrucción: lo que
  pulsa es donde puedes jugar.

### Tamaño: fluido, sin overflow horizontal

- Wrapper del SVG: `width: min(92vw, 30rem)` (7 columnas necesitan menos
  ancho que las 9 de Hex, que usa `36rem`).
- El `viewBox` del SVG se calcula para 7×7 puntos con margen para el grosor
  de las serpientes y el círculo de cabeza; `svg { width: 100%; height: auto }`.
- Hit-target de cada punto = la celda completa (rect transparente de
  `paso × paso` centrado en el punto), no solo el círculo visible. A ~375px
  de ancho de viewport son ~40px por celda.

## Componentes

### `src/games/snakes/engine.ts` (motor puro, sin DOM)

```ts
export type Player = 1 | 2;
export type GameStatus = 'playing' | 'won';

export interface SnakesState {
  caminos: Record<Player, number[]>;  // índices en orden; cabeza = último
  currentPlayer: Player;
  status: GameStatus;
  winner: Player | null;
}

export const TAMANO = 7;         // TOTAL = 49
export const SALIDA_J1 = 8;      // (1,1)
export const SALIDA_J2 = 40;     // (5,5)

export function createInitialState(): SnakesState;
export function esJugadaValida(payload: unknown): payload is number;
export function usados(state: SnakesState): Set<number>;
export function vecinosLibres(state: SnakesState, jugador: Player): number[];
export function playMove(state: SnakesState, index: number): SnakesState;
```

- `createInitialState()`: `caminos: { 1: [SALIDA_J1], 2: [SALIDA_J2] }`,
  `currentPlayer: 1`, `status: 'playing'`, `winner: null`.
- `esJugadaValida(payload)`: **solo comprobación de forma** — `true` si es un
  entero en `[0, 48]`. La adyacencia a la cabeza propia y la libertad del
  punto NO se comprueban aquí; se comprueban en `playMove`. Esta separación
  importa para la ruta remota (contrato de `iniciarSesionJuego`).
- `usados(state)`: `new Set([...state.caminos[1], ...state.caminos[2]])`.
- `vecinosLibres(state, jugador)`: cabeza = `state.caminos[jugador].at(-1)`;
  para cada `(df, dc)` en `[[-1,0],[1,0],[0,-1],[0,1]]`, si
  `0 ≤ fila+df < 7` y `0 ≤ col+dc < 7`, calcular `n = 7*(fila+df) + (col+dc)`;
  incluir `n` si `!usados(state).has(n)`. Devuelve el array (orden estable:
  arriba, abajo, izquierda, derecha).
- `playMove(state, index)` (inmutable; ante entrada inválida devuelve el
  `state` recibido sin cambios, como los demás motores):
  1. Si `status !== 'playing'` → devuelve `state`.
  2. Si `index` no es entero en `[0, 48]` → devuelve `state`.
  3. Si `index` **no** está en `vecinosLibres(state, state.currentPlayer)` →
     devuelve `state`. (Cubre: no adyacente a la cabeza propia, fuera de
     rango efectivo, punto ya usado.)
  4. Copia inmutable: `caminos[currentPlayer]` = `[...camino, index]`; el
     camino del rival se referencia igual (o se copia; el motor no lo muta).
  5. Calcula `libresRival = vecinosLibres(nuevoEstado, rival)`.
  6. Si `libresRival.length === 0` → `status: 'won'`, `winner: currentPlayer`,
     `currentPlayer` **sin cambiar**.
  7. Si no → alterna `currentPlayer`, `status: 'playing'`, `winner: null`.

### `src/games/snakes/Board.astro`

Calca la estructura de `hex/Board.astro` (SVG con grupos de celda enfocables
y `aria-label`), **sin** el selector de tamaño (Serpientes no es
configurable).

- **Markup:** `<TableroJuego>` envolviendo
  `<div class="snakes-wrapper"><svg id="snakes-svg" role="grid"
  aria-label="Tablero de Serpientes, 7 por 7"></svg></div>`.
- **Construcción del SVG** (una vez, al montar): para `i` en `0..48`,
  `fila = i/7`, `col = i%7`, coordenadas `x = margen + col*paso`,
  `y = margen + fila*paso`. Por punto:
  - `<rect>` transparente `paso × paso` centrado (hit-target) con
    `data-indice={i}`.
  - `<circle class="snakes-punto">` visible (radio pequeño).
  - `<g role="gridcell" tabindex="-1" aria-label="Fila {fila+1}, columna {col+1}">`
    agrupando ambos, patrón de foco de Hex (`:focus-visible`).
- **Serpientes:** dos `<polyline class="snakes-serpiente" data-jugador="1|2">`
  cuyo atributo `points` se recalcula en `render()` a partir de
  `state.caminos[j]` (mapeando cada índice a su `x,y`). CSS:
  `stroke: var(--color-player-N)`, `stroke-width` grueso, `fill: none`,
  `stroke-linecap: round`, `stroke-linejoin: round`.
- **Cabezas:** dos `<g class="snakes-cabeza" data-jugador="N">` con un
  `<circle>` mayor + `<text>` con `FICHAS[N]` (`{ 1: '●', 2: '▲' }`),
  posicionados en `render()` sobre `state.caminos[N].at(-1)`.
- **Resaltado de destinos legales:** en `render()`,
  `const destinos = state.status === 'playing' && esMiTurno
   ? vecinosLibres(state, state.currentPlayer) : []`. Se hace
  `classList.toggle('snakes-destino', destinos.includes(i))` en el grupo de
  cada punto; `.snakes-destino` lleva el pulso (`@keyframes`). El `<rect>`
  hit-target solo dispara `jugar()` cuando su índice está en `destinos`
  (comprobación en el handler, no se re-bindea).
- **Sesión:** `iniciarSesionJuego<number>({...})` idéntico a
  Gomoku/Obstrucción. Payload del movimiento = índice destino (`number`).
  - `esJugadaValida` importado del motor filtra payloads corruptos antes de
    aplicar movimientos remotos.
  - `onMovimientoRemoto(indice)` → `jugar(indice, false)`.
  - `onDesconectar` → deshabilita todos los hit-targets y llama `render()`
    (patrón de re-render en reconexión — ver memoria del proyecto).
  - `onAplicarReinicio` → `state = createInitialState(); render()`.
- **`render()`:**
  - Recalcula `points` de ambas polylines y la posición de ambas cabezas.
  - Calcula `destinos` (arriba) y aplica `.snakes-destino`.
  - Marca cada grupo de punto como interactivo solo si su índice está en
    `destinos` (cursor, `aria-disabled`).
  - Si `status === 'playing'`:
    `sesion.mostrarTurno({ jugador: state.currentPlayer,
    simbolos: { 1: FICHAS[1], 2: FICHAS[2] } })`.
  - Si `status === 'won'`:
    `sesion.mostrarFinDeJuego({ titulo: `🎉 ¡Ganó ${sesion.nombres[state.winner!]}
    (${FICHAS[state.winner!]})!` })`.
- **`jugar(indice, emitirRemoto = true)`:** `state = playMove(state, indice)`,
  `render()`, y si `emitirRemoto` → `sesion.enviarMovimiento(indice)`.
- Listener `click` (y activación por teclado, patrón Hex) en cada `<rect>`
  hit-target → si `indice ∈ destinos` → `jugar(Number(rect.dataset.indice))`.

### `src/content/juegos/snakes.md`

Frontmatter:

```yaml
title: "Serpientes"
description: "Haz crecer tu serpiente punto a punto. Pierde quien se queda sin espacio para avanzar."
icono: "🐍"
minJugadores: 2
maxJugadores: 2
```

Cuerpo (instrucciones):

1. El tablero es una retícula de 7×7 puntos. Cada jugador tiene una serpiente
   con un punto de salida fijo: el Jugador 1 (`●`) arriba a la izquierda, el
   Jugador 2 (`▲`) abajo a la derecha.
2. En tu turno, alarga tu serpiente un tramo: une su cabeza con un punto
   vecino (arriba, abajo, izquierda o derecha) que esté libre.
3. Un punto está libre si no lo ha usado ninguna de las dos serpientes. Los
   puntos donde puedes jugar aparecen resaltados.
4. No puedes pasar por un punto que ya use tu serpiente o la del rival.
5. **Pierdes si en tu turno no puedes alargar tu serpiente.** Gana el otro
   jugador.

### `src/pages/juegos/[slug].astro`

- `import SnakesBoard from '../../games/snakes/Board.astro';` (import
  estático, no `import()` dinámico).
- Entrada `snakes: SnakesBoard` en el objeto `BOARDS`.

No se toca `src/pages/index.astro` ni componentes compartidos — las tarjetas
se generan desde el content collection.

### Backlog

- `abstract-games-by-category/GAME-INDEX.md`: marcar `42-snakes.md` como ✅.
- `abstract-games-by-category/01-2-players/42-snakes.md`: ya especifica la
  regla completa; no requiere cambios (opcional: nota de que la
  implementación fija 7×7 y usa fichas por asiento en vez de "Blue"/"Red").

## Flujo de datos

Idéntico al de Gomoku / Obstrucción (payload = índice `number`):

- **Local:** `click` (o teclado) en un punto destino resaltado → `jugar(indice)`
  → `playMove` → `render`.
- **Remoto:** `jugar(indice)` local → `render` →
  `sesion.enviarMovimiento(indice)`. En el otro extremo,
  `onMovimientoRemoto(indice)` → `jugar(indice, false)` (aplica sin
  reenviar). `esJugadaValida` filtra payloads corruptos; `playMove` rechaza
  jugadas ilegales (no adyacentes / punto usado / fuera de turno de fase).
- **Reinicio** ("jugar de nuevo"): `onAplicarReinicio` →
  `state = createInitialState(); render()`.
- **Desconexión:** `onDesconectar` deshabilita el tablero y re-renderiza.

## Manejo de errores / casos límite

- Jugada sobre punto usado, no adyacente a la cabeza propia, fuera de rango, o
  tras `won`: `playMove` devuelve el estado sin cambios; la UI ya limita los
  clics a los destinos resaltados — esto es defensa para la ruta remota.
- Derivación de vecinos que se sale de la retícula: acotada por `fila` y
  `col` en cada uno de los 4 desplazamientos.
- Primera jugada de la partida: ambas cabezas (índices 8 y 40) tienen 4
  vecinos libres; siempre hay apertura legal para ambos.
- Auto-encierro: cubierto por el test discriminante; la partida continúa un
  turno más.
- Doble encierro (una jugada deja a ambas serpientes sin salida): el
  siguiente en turno pierde, el otro gana; sin empate.
- `localStorage` no disponible para nombres: ya lo maneja `getPlayerNames()`.

## Pruebas (`src/games/snakes/engine.test.ts`, TDD — primero los tests)

- **Estado inicial:** `caminos` `{1:[8], 2:[40]}`, `currentPlayer: 1`,
  `status: 'playing'`, `winner: null`.
- `esJugadaValida`: acepta `0` y `48`; rechaza `-1`, `49`, `3.5`, `'2'`,
  `null`, `{}`.
- `usados` en estado inicial: `Set {8, 40}`.
- `vecinosLibres` de la cabeza inicial de J1 (índice 8): `[1, 15, 7, 9]`
  (arriba, abajo, izquierda, derecha), todos libres.
- Jugada válida (J1 mueve 8→9): `caminos[1]` = `[8, 9]`, `currentPlayer` pasa
  a 2, `status: 'playing'`.
- Jugada NO adyacente a la cabeza propia (J1 intenta índice 20) → estado sin
  cambios.
- Jugada sobre un punto ya usado por la **propia** serpiente → sin cambios.
- Jugada sobre un punto ya usado por la serpiente **rival** → sin cambios.
- Jugada sobre la salida del rival (índice 40 desde una cabeza adyacente) →
  sin cambios (está en `usados`).
- Jugada fuera de rango (`-1`, `49`) → sin cambios.
- Jugada tras `status: 'won'` → sin cambios.
- **Acotado de borde:** con la cabeza de un jugador en una esquina (p. ej.
  índice 0), `vecinosLibres` devuelve solo los 2 vecinos reales (1 y 7),
  nunca un índice de la fila anterior ni de la columna opuesta.
- **Acotado de borde en fila superior:** cabeza en índice 3 (`fila 0`) →
  `vecinosLibres` no incluye ningún índice con `fila = -1`.
- **Victoria directa:** construir un estado donde, tras la jugada de J1, la
  cabeza de J2 quede sin vecinos libres → `status: 'won'`, `winner: 1`,
  `currentPlayer` sigue siendo `1`.
- **Test discriminante (auto-encierro NO termina la partida):** partiendo de
  un estado construido a mano, J1 mueve a un callejón que deja su propia
  cabeza con 0 vecinos libres, mientras J2 aún tiene ≥1 vecino libre.
  Resultado esperado: `status: 'playing'`, `currentPlayer: 2` (NO victoria de
  J2). A continuación J2 hace su jugada; al aplicarla, `playMove` evalúa
  `vecinosLibres(estado, 1)` = vacío → `status: 'won'`, `winner: 2`,
  `currentPlayer` sigue siendo `2`.
  *(Un escaneo global tipo Obstrucción falla este test: al auto-encerrarse
  J1 declararía fin de partida de inmediato, o al no distinguir por jugador
  no cerraría en el momento correcto.)*
- **Doble encierro → sin empate:** estado donde la jugada de J1 deja a ambas
  serpientes sin vecinos libres → al evaluar el rival (J2): vacío →
  `status: 'won'`, `winner: 1`.
- **Inmutabilidad:** `playMove` no muta el `state` de entrada ni sus arrays
  `caminos[1]` / `caminos[2]`.

## Trabajo fuera de alcance

- Tableros de otro tamaño o configurables (5×5, 7×5, 7×7 en la variante de
  `42-snakes.md` ya es el fijo elegido; el resto queda fuera).
- Puntaje acumulado entre rondas / marcador.
- Resaltado de las jugadas del rival o "vista previa" del recorrido.
- IA / oponente por computadora.
- Extracción o cambios del componente `<TableroJuego>` compartido o del
  render SVG de Hex (se calca, no se factoriza).

## Integración / entrega

- Rama/worktree nuevo desde `origin/main` (no el `main` local si está
  desincronizado — ver memoria del proyecto); PR contra `main` como los 16
  juegos anteriores.
- Ejecución del plan: subagent-driven (un subagente por tarea, revisión entre
  tareas), consistente con los juegos recientes.
- `npm test` (raíz) y `astro check` + `npm run build` limpios antes de abrir
  el PR.
- Seguimiento no bloqueante (en el cuerpo del PR): playtest de modo remoto en
  2 navegadores contra el Worker desplegado (no se puede local — `astro dev`
  no sirve el Worker de señalización).
