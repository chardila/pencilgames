# Col — 19.º juego

Juego de lápiz y papel de Colin Vout (combinatorio partidista). Cada
jugador colorea regiones de un mapa con su color; pierde quien no puede
colorear en su turno.

## Reglas

1. El tablero es un mapa de ~13 regiones con una lista fija de
   adyacencias. Hay 3 mapas.
2. El Jugador 1 y el Jugador 2 tienen cada uno un color propio.
3. **En tu turno** coloreas una región **sin color** que **no sea
   vecina de ninguna región ya de tu color**.
4. El rival sí puede colorear una región vecina a las tuyas: a él solo
   le importa su propio color.
5. Una región ya coloreada no se vuelve a colorear.
6. **Pierdes si en tu turno no puedes colorear ninguna región** (juego
   normal: el último en mover gana). No hay empates.

## Decisiones de diseño (cerradas en brainstorming)

- **Representación del mapa:** 3 mapas SVG dibujados a mano, fijos, con
  regiones tipo "países" y su lista de adyacencias.
- **Tamaño:** ~13 regiones los tres mapas (partidas parejas y cortas,
  aptas para niños).
- **Selección de mapa:** selector antes de empezar con los 3 mapas y un
  botón "Aleatorio" resaltado como opción por defecto.
- **Ayudas visuales:** se resaltan solo las regiones legales para el
  jugador del turno. No se marcan las regiones "muertas".
- **Fin y revancha:** banner de ganador estándar; en la revancha
  empieza el que perdió y se vuelve al selector de mapa.
- **Sin barra de confirmar:** colorear es de bajo riesgo; el tap aplica
  la jugada directamente.

## Arquitectura y archivos

| Archivo | Contenido |
|---|---|
| `src/games/col/maps.ts` | Los 3 mapas como datos. |
| `src/games/col/engine.ts` | Motor puro: estado, `createInitialState`, `regionesLegales`, `playMove`. Sin DOM. |
| `src/games/col/engine.test.ts` | TDD del motor. |
| `src/games/col/maps.test.ts` | Validación de los 3 mapas. |
| `src/games/col/Board.astro` | SVG del tablero + overlay del selector; usa `iniciarSesionJuego`, indicador de turno y banner de ganador compartidos, `getPlayerNames`. |
| `src/content/juegos/col.md` | Frontmatter (`icono: "🖍️"`, `minJugadores: 2`, `maxJugadores: 2`) + instrucciones. |
| `src/pages/juegos/[slug].astro` | `import` estático de `Board.astro` + entrada en `BOARDS`. |

No se toca `src/pages/index.astro` ni los componentes compartidos: se
generan desde el content collection.

## Datos de los mapas (`maps.ts`)

```ts
export interface Region {
  id: number;        // índice, 0..n-1
  path: string;      // atributo "d" del <path> SVG
  cx: number;        // centro aprox. (para etiqueta / miniatura)
  cy: number;
}

export interface ColMap {
  id: number;              // 0, 1, 2
  nombre: string;
  viewBox: string;         // p. ej. "0 0 400 300"
  regiones: Region[];      // ~13
  adyacencias: ReadonlyArray<readonly [number, number]>;
}

export const MAPAS: readonly ColMap[];
```

- Los paths se dibujan a mano; las adyacencias se escriben a mano a
  partir del dibujo.
- Cada par de `adyacencias` se guarda una sola vez (`[a, b]` con
  `a < b`); el motor y los tests tratan la relación como simétrica.

## Motor (`engine.ts`)

```ts
export type Player = 1 | 2;
export type RegionColor = 0 | 1 | 2;          // 0 = sin color
export type Fase = 'seleccion' | 'jugando' | 'terminado';

export type ColMove =
  | { tipo: 'mapa'; mapaId: number }
  | { tipo: 'color'; region: number };

export interface ColState {
  mapaId: number | null;
  fase: Fase;
  colores: RegionColor[];       // índice = id de región; [] en fase 'seleccion'
  currentPlayer: Player;
  jugadorInicial: Player;
  status: 'playing' | 'won';
  winner: Player | null;
  lastMove: number | null;
}

export function createInitialState(jugadorInicial?: Player): ColState;
export function esJugadaValida(payload: unknown): payload is ColMove;
export function regionesLegales(state: ColState, player: Player): number[];
export function playMove(state: ColState, move: ColMove): ColState;
```

### `createInitialState(jugadorInicial = 1)`

`{ mapaId: null, fase: 'seleccion', colores: [], currentPlayer:
jugadorInicial, jugadorInicial, status: 'playing', winner: null,
lastMove: null }`.

### `esJugadaValida`

Type guard estructural: objeto con `tipo === 'mapa'` y `mapaId` entero
`0..2`, o `tipo === 'color'` y `region` entero `>= 0`. (La validación
contra el mapa concreto la hace `playMove`.)

### `regionesLegales(state, player)`

Si `fase !== 'jugando'` → `[]`. Si no: para cada región `r` con
`colores[r] === 0`, incluirla si **ninguna** región adyacente a `r`
tiene `colores === player`. Devuelve los ids.

### `playMove(state, move)`

Devuelve el **mismo objeto** `state` ante cualquier jugada inválida
(patrón de Nim/Obstrucción). Nunca muta `state`.

- `status !== 'playing'` → sin cambio.
- `!esJugadaValida(move)` → sin cambio.
- `move.tipo === 'mapa'`:
  - Válida solo si `fase === 'seleccion'` y `move.mapaId` es índice de
    `MAPAS`. (No se exige `currentPlayer === jugadorInicial`: en fase
    `seleccion` siempre `currentPlayer === jugadorInicial`.)
  - Resultado: `mapaId` fijado, `colores` = array de ceros de longitud
    `MAPAS[mapaId].regiones.length`, `fase: 'jugando'`. **El turno no
    cambia.** `lastMove: null`.
- `move.tipo === 'color'`:
  - Válida si `fase === 'jugando'`, `move.region` es id de región del
    mapa, `colores[region] === 0`, y ninguna adyacente tiene
    `colores === currentPlayer` (equivale a `regionesLegales(state,
    currentPlayer).includes(region)`).
  - Resultado: `colores[region] = currentPlayer`, `lastMove = region`.
  - Detección de fin: si `regionesLegales(nuevoEstado, otroJugador)`
    está vacío → `status: 'won'`, `winner: currentPlayer`, `fase:
    'terminado'`, el turno **no** pasa.
  - Si no: `currentPlayer` cambia al otro, `fase: 'jugando'`.

### Tests del motor (`engine.test.ts`)

- Estado inicial correcto; `jugadorInicial` respetado.
- `mapa` inválida fuera de fase `seleccion`; `mapa` válida entra a
  `jugando` sin cambiar turno e inicializa `colores`.
- `color` sobre región ya coloreada → sin cambio.
- `color` sobre región vecina de mi propio color → sin cambio.
- `color` sobre región vecina del color del rival → válida.
- El turno alterna tras una jugada `color` normal.
- Fin de partida: construir un estado donde el rival se queda sin
  jugadas legales y verificar `winner`.
- `playMove` nunca muta el `state` de entrada (comparar copia
  profunda).
- Jugada tras `status: 'won'` → sin cambio.
- **Partidas aleatorias:** N partidas (p. ej. 20 000) eligiendo mapa y
  jugadas legales al azar; en todas debe terminar con un `winner`
  válido, sin excepciones, sin estados con `fase: 'jugando'` y cero
  jugadas legales para ambos sin `status: 'won'`.

## Validación de mapas (`maps.test.ts`)

Para cada mapa de `MAPAS`:

- `id` coincide con su índice; hay exactamente 3 mapas.
- `regiones` tiene ~13 elementos (rango 11–15) con `id` = índice.
- Cada par de `adyacencias` tiene índices en rango, `a < b`, sin
  duplicados, sin `a === b`.
- El grafo de regiones es **conexo** (BFS desde la región 0 alcanza
  todas).
- Ninguna región queda aislada (grado >= 1).
- `path` no vacío; `viewBox` con 4 números.

## Board (`Board.astro`)

### Estructura

- `TableroJuego` como envoltura (igual que los demás).
- Un `<svg>` con `viewBox` del mapa activo y un `<path class="region"
  data-region={id}>` por región. Dos `<pattern>` en `<defs>` (líneas
  diagonales para J1, puntos para J2) para el relleno con trama además
  del color.
- Overlay `#selector-mapa` (posición absoluta sobre el tablero) con 3
  miniaturas SVG + botón "Aleatorio".
- Contenedor `#mensaje-espera` (oculto salvo en remoto cuando no me
  toca elegir).

### Script

```ts
import {
  createInitialState, esJugadaValida, playMove, regionesLegales,
  type ColState, type ColMove, type Player,
} from './engine';
import { MAPAS } from './maps';
import { iniciarSesionJuego } from '../../lib/gameSession';

let state: ColState = createInitialState(1);
let jugadorInicialSiguiente: Player = 1;   // se actualiza al terminar cada partida

const sesion = iniciarSesionJuego<ColMove>({
  validarMovimiento: esJugadaValida,
  onMovimientoRemoto: move => jugar(move, false),
  onAplicarReinicio: () => {
    state = createInitialState(jugadorInicialSiguiente);
    render();
  },
  onRender: render,
  onDesconectar: () => { /* quitar pointer-events, ocultar selector */ },
});
```

- `jugar(move, emitirRemoto = true)`: `const nuevo = playMove(state,
  move); if (nuevo === state) return;` — aplica, si `nuevo.status ===
  'won'` actualiza `jugadorInicialSiguiente = nuevo.winner === 1 ? 2 :
  1`, `render()`, y si `emitirRemoto` → `sesion.enviarMovimiento(move)`.
  **No** contiene ninguna comprobación `esMiTurno` (memoria
  `remoto-guard-turno-jugar`).
- `render()`:
  - **Fase `seleccion`:** si `sesion.esMiTurno(state.currentPlayer)` →
    mostrar `#selector-mapa`, ocultar mensaje de espera. Si no →
    ocultar selector, mostrar "Esperando a que
    _{sesion.nombres[state.jugadorInicial]}_ elija el mapa…". El SVG
    del tablero puede ir vacío o con el primer mapa atenuado.
  - **Fase `jugando`:** render del mapa `state.mapaId`. Cada `<path>`:
    - `colores[r] !== 0` → `fill` = color del jugador + `url(#trama-r)`
      o `url(#trama-a)`.
    - En mi turno y `r ∈ regionesLegales(state, sesion.miAsiento)` →
      clase `region--legal` (contorno resaltado, hover, cursor
      pointer).
    - Resto → `pointer-events: none`.
    - `state.lastMove === r` → clase `region--ultima` (marco tenue).
    - `sesion.mostrarTurno({ jugador: state.currentPlayer })`.
  - **`status: 'won'`:** `sesion.mostrarFinDeJuego({ titulo: \`🎉
    ¡Ganó ${sesion.nombres[state.winner!]}! 🖍️\` })`.
- Listener de click delegado en el `<svg>`: lee `data-region`, y si la
  jugada `{ tipo: 'color', region }` es legal (`regionesLegales`
  incluye la región y es mi turno) → `jugar({ tipo: 'color', region
  })`. Taps sobre regiones no legales: nada.
- Botones del selector → `jugar({ tipo: 'mapa', mapaId })`;
  "Aleatorio" → `mapaId` al azar `0..2`.

### Identidad visual

- Colores por asiento desde la convención existente (memoria
  `identidad-jugadores`): color + forma/trama por asiento. Region de J1
  con trama de líneas, J2 con trama de puntos, para que se distingan en
  impresión / daltonismo.

## Modo remoto

- El canal transporta solo `ColMove` y `reiniciar`. La elección de mapa
  es una `ColMove` (`{ tipo: 'mapa' }`), por eso está en el modelo de
  jugadas y no como configuración aparte; el registro de `gameSession`
  la reenvía en re-sincronización como cualquier otra.
- `sesion.miAsiento` (1 ó 2) determina qué peer ve el selector: el que
  cumple `miAsiento === state.jugadorInicial`.
- Colorear: `onMovimientoRemoto` → `jugar(move, false)`, idéntico a los
  demás juegos.
- Reconexión: `onRender` fuerza re-render (memoria
  `remoto-rerender-en-reconexion`); `onDesconectar` bloquea input.
- Revancha remota: ambos peers ejecutan `onAplicarReinicio`, que
  recalcula el mismo `jugadorInicialSiguiente` a partir del `winner`
  final (determinista en ambos lados).

## Contenido (`src/content/juegos/col.md`)

Frontmatter: `title: "Col"`, `description` (una frase sobre colorear
regiones sin tocar tu propio color), `icono: "🖍️"`, `minJugadores: 2`,
`maxJugadores: 2`.

Cuerpo: las 6 reglas de arriba en lenguaje sencillo, más una nota de
que se elige mapa al empezar y que en la revancha empieza quien perdió.

## Fuera de alcance (YAGNI)

- Variante misère ("gana quien no puede mover").
- Snort (la regla inversa) u otras variantes.
- Mapas generados o editor de mapas.
- Marcar regiones muertas.
- Más de 2 jugadores.
- Puntuación acumulada entre partidas (la revancha solo alterna el
  inicio).

## Referencias

- Patrón de motor: `src/games/obstruccion/engine.ts`,
  `src/games/nim/engine.ts`.
- Patrón de Board + sesión: `src/games/nim/Board.astro`,
  `src/lib/gameSession.ts`.
- Prueba con partidas aleatorias: como en Serpientes
  (`src/games/snakes/engine.test.ts`).
- Guías de modo remoto: memorias `remoto-guard-turno-jugar`,
  `remoto-rerender-en-reconexion`.
