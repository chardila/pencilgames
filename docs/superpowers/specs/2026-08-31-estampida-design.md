# Estampida — Diseño (13.º juego)

Fecha: 2026-08-31
Estado: aprobado en brainstorming, pendiente de plan de implementación.

## Resumen

Juego abstracto de expansión para 2 jugadores en un tablero de 8×8. Cada
jugador coloca 5 fichas propias en una fase de preparación; luego, por turnos,
elige una dirección cardinal y **todas** sus fichas que tengan una casilla
vacía contigua en esa dirección se duplican de golpe. Gana quien termina con
más casillas ocupadas. Admite empate.

Ficha de backlog fuente: `abstract-games-by-category/01-2-players/38-estampida.md`
(adaptada: tablero 10×10 / 8 fichas → 8×8 / 5 fichas por ergonomía táctil,
coherente con Gomoku 9×9 y Hex 5×5).

## Decisiones tomadas en el brainstorming

1. **Tablero 8×8, 5 fichas por jugador.** Casillas de ~41 px a 375 px de
   ancho; llenado inicial ~16 %. 8×8 ya validado por Obstrucción y Domineering.
2. **Condición de fin explícita:** la partida termina cuando **ninguno de los
   dos** jugadores puede añadir una sola copia en ninguna de las 4 direcciones,
   o cuando no quedan casillas vacías. No hay turnos muertos obligatorios para
   cerrar.
3. **Flechas de dirección muertas se deshabilitan.** Una dirección que
   produciría 0 copias aparece atenuada. Si las 4 quedan deshabilitadas en tu
   turno, el motor te salta automáticamente. No hay razón estratégica para
   pasar voluntariamente (expandir siempre suma casillas propias y el marcador
   es total de casillas).
4. **Realce de la última jugada:** anillo en **todas** las copias añadidas en
   el último turno (y en la última ficha colocada durante el setup). Sin
   flecha de dirección, sin animación de deslizamiento (fuera de alcance).
5. **Enfoque de motor:** un solo `engine.ts` puro con `fase` en el estado y
   `Move` como unión discriminada; un único `playMove` despacha según la fase.
   El payload remoto es exactamente ese `Move`.

Defaults asumidos: setup con colocación alternada de a una ficha, J1 (`●`)
empieza, cualquier casilla vacía es válida; "jugar de nuevo" reinicia a la
fase de setup; marcador de casillas visible durante toda la partida.

## Motor — `src/games/estampida/engine.ts`

### Tipos y constantes

```ts
export type Player = 1 | 2;
export type Cell = Player | null;
export type Direccion = 'arriba' | 'abajo' | 'izquierda' | 'derecha';
export type Fase = 'setup' | 'playing' | 'finished';

export const TAMANO = 8;                 // 8×8 = 64 casillas
export const FICHAS_POR_JUGADOR = 5;

export type Move =
  | { tipo: 'colocar'; celda: number }
  | { tipo: 'estampida'; dir: Direccion };

export interface EstampidaState {
  board: Cell[];                          // longitud 64
  fase: Fase;
  currentPlayer: Player;
  colocadas: Record<Player, number>;      // progreso del setup
  winner: Player | null;                  // null salvo fase 'finished' con desempate
  ultimasCopias: number[];                // celdas añadidas en el último turno
  ultimaDireccion: Direccion | null;
}
```

### Funciones puras exportadas

- `createInitialState(): EstampidaState` — tablero vacío, `fase: 'setup'`,
  `currentPlayer: 1`, `colocadas: { 1: 0, 2: 0 }`, `winner: null`,
  `ultimasCopias: []`, `ultimaDireccion: null`.
- `esJugadaValida(payload: unknown): payload is Move` — type guard para el
  canal remoto. Valida forma, `celda` entera en 0..63, `dir` en las 4 válidas.
  No comprueba legalidad contra el estado (eso lo hace `playMove`).
- `playMove(state, move): EstampidaState` — inmutable. Si el movimiento es
  inválido para la fase actual devuelve **el mismo objeto** (referencia igual,
  para que el Board detecte el rechazo y no lo emita).
- `celdasQueCopian(board: Cell[], player: Player, dir: Direccion): number[]` —
  casillas destino que recibirían una copia, calculadas desde un snapshot
  único. Respeta bordes (sin envolvimiento) y obstáculos (cualquier casilla
  ocupada bloquea).
- `hayMovimientoPosible(board: Cell[], player: Player): boolean` — ¿alguna de
  las 4 direcciones da ≥1 copia?
- `contar(board: Cell[]): Record<Player, number>` — casillas por jugador.

### Lógica de `playMove`

**Fase `setup`:**
- Solo acepta `{ tipo: 'colocar' }`. `celda` debe estar en rango y vacía; si no,
  se rechaza (misma referencia).
- Coloca `currentPlayer` en `celda`, incrementa `colocadas[currentPlayer]`.
- Alterna `currentPlayer` en cada colocación.
- Cuando **ambos** jugadores llegan a `FICHAS_POR_JUGADOR`, `fase` pasa a
  `playing`. El jugador que coloca la 10.ª ficha cede el turno; por la
  alternancia estricta el turno queda en J1 al entrar a `playing`.
- Al entrar a `playing` se aplica la misma comprobación de fin de turno que
  abajo (por si J1 entrara ya atascado o la partida ya estuviera decidida —
  improbable con 10 fichas en 64 casillas, pero el motor no debe quedar
  congelado).
- `ultimasCopias = [celda]`, `ultimaDireccion = null`.

**Fase `playing`:**
- Solo acepta `{ tipo: 'estampida' }`. `dir` ya validada por forma.
- `objetivos = celdasQueCopian(board, currentPlayer, dir)` desde snapshot único
  (sin encadenar: una casilla llenada este turno no genera más copias este
  turno).
- Se colocan todas las copias a la vez. `ultimasCopias = objetivos`,
  `ultimaDireccion = dir`. `objetivos` puede ser `[]` (dirección sin copias):
  el tablero no cambia pero el turno avanza igual.
- **Fin de turno:**
  - `rival` = el otro jugador.
  - Si no quedan casillas vacías → `fase: 'finished'`.
  - Si ni `currentPlayer` ni `rival` tienen movimiento posible →
    `fase: 'finished'`.
  - Si `rival` no tiene movimiento posible pero `currentPlayer` sí → el turno
    **repite** en `currentPlayer` (se salta al rival atascado).
  - En otro caso → `currentPlayer = rival`.
- Al pasar a `finished`: `winner` = jugador con más casillas según `contar`;
  `null` si empatan.

### Riesgo conocido

Envolvimiento de borde en `izquierda` / `derecha`: una copia no puede saltar de
la columna 7 a la columna 0 de la fila siguiente (ni al revés). Cubrir con test
explícito.

## Board — `src/games/estampida/Board.astro`

Sigue el patrón de `src/games/obstruccion/Board.astro`: `<TableroJuego>` +
grid de botones, más una fila de controles de dirección.

### Markup (SSR)

- `#tablero`: 64 `<button class="casilla" data-indice={i}>` en grid de 8
  columnas. `role="grid"`, `aria-label` "Tablero de Estampida, 8 por 8",
  `aria-label` por casilla con fila/columna.
- `#controles-direccion`: 4 `<button data-dir="arriba|abajo|izquierda|derecha">`
  con glifos ↑ ↓ ← →. Oculto con `[hidden]` hasta la fase `playing`.

### Script

```ts
import { createInitialState, esJugadaValida, celdasQueCopian, contar,
         playMove, type EstampidaState, type Move } from './engine';
import { iniciarSesionJuego } from '../../lib/gameSession';

const FICHAS = { 1: '●', 2: '▲' } as const;
let state: EstampidaState = createInitialState();

const sesion = iniciarSesionJuego<Move>({
  validarMovimiento: esJugadaValida,
  onMovimientoRemoto: (m) => jugar(m, false),
  onAplicarReinicio: () => { state = createInitialState(); render(); },
  onRender: render,
  onDesconectar: () => deshabilitarTodo(),
});

function jugar(move: Move, emitirRemoto = true): void {
  const prev = state;
  state = playMove(state, move);
  if (state === prev) return;          // rechazado → no renderiza ni emite
  render();
  if (emitirRemoto) sesion.enviarMovimiento(move);
}
```

- **Click en casilla:** `jugar({ tipo: 'colocar', celda: Number(data-indice) })`.
  Solo relevante en `setup`.
- **Click en flecha:** `jugar({ tipo: 'estampida', dir })`.
- **Guard de turno:** se aplica en `render()` (deshabilitar inputs), **nunca**
  dentro de `jugar()`. Respeta la lección `remoto-guard-turno-jugar` (poner
  `esMiTurno` incondicional dentro de `jugar()` descarta los movimientos
  remotos en silencio).

### `render()`

- `esMiTurno = sesion.esMiTurno(state.currentPlayer)`.
- Casillas: glifo `FICHAS[valor]` + `data-valor` para color; clase
  `.casilla--ultima` si el índice está en `state.ultimasCopias`. `disabled` =
  ocupada, o `state.fase !== 'setup'`, o `!esMiTurno`.
- Controles de dirección: visibles solo en `fase === 'playing'`. Cada flecha
  `disabled` si `celdasQueCopian(state.board, state.currentPlayer, dir).length
  === 0` **o** `!esMiTurno`.
- Indicador de turno (`sesion.mostrarTurno`):
  - `setup` → `{ jugador, simbolos: { 1: '●', 2: '▲' }, puntajes: contar(board),
    detalle: 'Coloca tus fichas (N/5)' }`.
  - `playing` → `{ jugador, simbolos, puntajes: contar(board), detalle: 'Elige
    una dirección' }`.
- `finished` (`sesion.mostrarFinDeJuego`):
  - con ganador: `{ titulo: '🎉 ¡Ganó <nombre> (<ficha>)!', detalle: '<a>
    casillas a <b>' }`.
  - empate: `{ titulo: '🤝 ¡Empate!', detalle: '<n> casillas cada uno' }`.

### CSS

Grid de 8 columnas reutilizando medidas de Obstrucción/Domineering
(`width: min(92vw, 30rem)`, `aspect-ratio: 1`, `gap: 0.25rem`). Fila de flechas
centrada bajo el tablero, botones `min(12vw, 3.5rem)`, estado `:disabled`
atenuado. `.casilla--ultima` = `box-shadow: inset 0 0 0 3px var(--color-accent)`.

## Integración en el sitio

- `src/pages/juegos/[slug].astro`: importar `EstampidaBoard` y añadir
  `estampida: EstampidaBoard` al mapa `BOARDS`.
- `src/content/juegos/estampida.md`: frontmatter `title: "Estampida"`,
  `description`, `icono`, `minJugadores: 2`, `maxJugadores: 2`; cuerpo con
  reglas numeradas en español, framing positivo (la fuente ya lo es: "gana
  quien tiene más casillas").

## Modo remoto

- `TMovimiento = Move` (la unión discriminada). Viaja por el canal WebRTC /
  relay tal cual; el Worker no lo inspecciona (pass-through de
  `JSON.stringify`, igual que el resto de juegos).
- El receptor aplica con `onMovimientoRemoto → jugar(m, false)`. `playMove` es
  determinista y ambos lados parten del mismo `createInitialState()`, así que
  los tableros convergen. El handshake `sync-hola` / `sync-moves` y el checksum
  de registro ya existentes cubren la reconexión sin trabajo extra.
- `esJugadaValida` rechaza payloads corruptos antes de tocar el estado.

## Pruebas

### `engine.test.ts` (Vitest)

- **Setup:** colocación alterna; rechazo de casilla ocupada y de índice fuera
  de rango; rechazo de `{tipo:'estampida'}` durante setup; transición a
  `playing` exacta al llegar a 5+5, con el turno en J1.
- **Estampida:** copia simple (`X..` + derecha → `XX.`); no-envolvimiento en
  `izquierda` / `derecha`; obstáculo bloquea (ficha propia y del rival);
  sin encadenar (snapshot único: `X...` + derecha → `XX..`, nunca `XXXX`);
  copias múltiples simultáneas en un turno.
- **Turnos:** dirección sin copias no altera el tablero y cede el turno; se
  salta al jugador atascado mientras el otro pueda mover; fin cuando ambos
  están atascados; fin por tablero lleno.
- **Puntaje:** `contar` correcto; ganador por mayoría; empate → `winner: null`
  y `fase: 'finished'`.
- **`esJugadaValida`:** rechaza `null`, objeto sin `tipo`, `tipo` desconocido,
  `celda` no entera o fuera de rango, `dir` inválida; acepta un `Move` bien
  formado de cada variante.

### Fuzz independiente (script, no en CI)

N partidas completas aleatorias. Invariantes:
- las fichas propias nunca se sobrescriben ni desaparecen;
- el conteo de casillas por jugador es monótono no decreciente;
- ninguna partida se cuelga;
- toda partida termina en `fase: 'finished'`.

### Playtest de navegador (chrome-devtools, 375 px)

Setup de 10 fichas; flechas muertas atenuadas; estampida con realce de las
copias; marcador en vivo; banner de victoria y de empate; "jugar de nuevo"
vuelve al setup; 0 errores de consola.

### Seguimiento (en el cuerpo del PR)

Playtest de modo remoto en 2 navegadores contra el Worker desplegado — no se
puede en local (`astro dev` no sirve el Worker de señalización). Igual que en
juegos previos.

## Fuera de alcance (MVP)

- Animación de deslizamiento de las copias (cosmética; la fuente la marca como
  opcional).
- Tablero 10×10 y variante de 8 fichas.
- Indicador visual de la dirección elegida en el último turno.
- Extracción del componente `<TableroJuego>` compartido (backlog aparte;
  Estampida se construye sobre el patrón actual duplicado, como los 12 juegos
  previos).
- Modo multijugador de más de 2 jugadores (la ficha fija 2).
- Restricciones de colocación en el setup (cualquier casilla vacía vale).

## Notas de accesibilidad (deuda site-wide conocida, no bloqueante)

`role="grid"` sin `row`/`gridcell`; `aria-label` estático que no refleja
ocupación; blancos de tap ~41 px a 375 px en el tablero (aceptable, mejor que
Gomoku 9×9). Los controles de dirección deben tener `aria-label` explícito
("Duplicar hacia arriba", etc.) y un `min-height`/`min-width` de
`var(--tap-target-min)`.
