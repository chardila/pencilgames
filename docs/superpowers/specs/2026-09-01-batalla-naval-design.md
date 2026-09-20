# Batalla Naval — Diseño (15.º juego)

Fecha: 2026-09-01
Estado: aprobado en brainstorming, pendiente de plan de implementación.

## Resumen

Juego de flota oculta para 2 jugadores en un tablero de 8×8. Cada jugador
coloca una flota de 4 barcos (longitudes 4, 3, 3, 2) mediante colocación
aleatoria; luego, por turnos alternos, dispara a una casilla de las aguas del
rival. Gana quien hunde toda la flota rival primero. No admite empate.

Battleship es un juego de lápiz y papel de origen (previo a la edición de
Milton Bradley), así que encaja en el sitio. Es el primer juego del sitio con
**información oculta**: los 14 juegos previos son de información perfecta.

Ya existe ficha de backlog:
`abstract-games-by-category/01-2-players/37-battleship.md` (fuente de verdad de
las reglas). El slug del sitio es `battleship`; el título visible es "Batalla
naval". Esta rama solo marca esa fila con ✅ en `GAME-INDEX.md`.

## Decisiones tomadas en el brainstorming

1. **Estado compartido, secreto solo en UI.** Ambos clientes tienen las dos
   flotas en memoria; el motor sigue siendo puro y determinista,
   `TMovimiento = Move` viaja tal cual, y `gameSession.ts`, `types.ts`, el
   `worker/` y el checksum de reconexión quedan **intactos**. El secreto es
   cosmético: la flota rival no se dibuja en el DOM. En pasar-y-jugar (modo
   principal) las dos flotas están en el mismo navegador de todos modos, así
   que un esquema anti-trampa no compra nada ahí. **Sin commitment /
   hash-reveal** (YAGNI). En remoto, la flota rival vive en memoria JS del
   navegador, no en el DOM.
2. **En la fase de disparos nunca se dibuja tu propia flota.** Solo se muestra
   tu cuadrícula de tiros sobre el rival, un contador "Tu flota: N de 4 a
   flote", y una línea de texto del disparo entrante ("Te dispararon en C4 —
   tocado"). No hace falta pantalla intermedia de "pasa el dispositivo"
   durante los disparos, porque no hay nada secreto en pantalla.
3. **Tablero 8×8, flota 4/3/3/2** (12 de 64 casillas, ~19 %; el clásico es
   17/100 = 17 %). Casillas de ~41 px a 375 px de ancho, cabe sin scroll.
   Coherente con Obstrucción / Domineering / Estampida (8×8) y con el
   precedente del sitio de reducir por ergonomía táctil (Gomoku 15→9,
   Estampida 10→8, Hex 5×5).
4. **Colocación solo aleatoria.** Un botón "Barajar" reparte la flota al azar
   (barcos rectos, dentro del tablero, sin solapamiento; tocarse permitido);
   se puede barajar cuantas veces se quiera antes de "Confirmar flota". La
   colocación manual (toque + rotar) queda **fuera de alcance** del MVP —
   barcos multi-casilla con orientación en pantalla táctil no tienen
   precedente en el repo y son lo más delicado de construir.
5. **Turno siempre alterno.** Aciertes o no, pasa el turno. Sin "tocado →
   disparas otra vez". Partidas más calmadas para jugar con niños; sin
   `repiteTurno`.
6. **Los barcos pueden tocarse** en la colocación (regla clásica de Milton
   Bradley). El validador solo comprueba "dentro del tablero", "recto y
   contiguo" y "sin solaparse". Sin regla de no-adyacencia ("cañonero").
7. **Enfoque de motor:** un solo `engine.ts` puro con `fase` en el estado y
   `Move` como unión discriminada; un único `playMove` despacha según la fase.
   El payload remoto es exactamente ese `Move`.

Defaults asumidos: J1 (`●`) coloca primero y dispara primero; "jugar de nuevo"
reinicia a la fase de colocación (interstitial de J1); el contador de barcos a
flote de ambos jugadores es visible durante toda la partida (no revela
posiciones, solo cuántos barcos quedan).

## Motor — `src/games/battleship/engine.ts`

### Tipos y constantes

```ts
export type Player = 1 | 2;
export type Fase = 'colocacion' | 'disparos' | 'finished';
export type Resultado = 'agua' | 'tocado' | 'hundido';

export const TAMANO = 8;                     // 8×8 = 64 casillas
export const FLOTA = [4, 3, 3, 2] as const;  // longitudes de los 4 barcos

export type Move =
  | { tipo: 'flota'; barcos: number[][] }    // 4 barcos; cada uno = índices de celda, ordenados asc.
  | { tipo: 'disparo'; celda: number };

export interface BattleshipState {
  fase: Fase;
  currentPlayer: Player;
  flotas: Record<Player, number[][] | null>;       // null hasta que ese jugador confirma
  disparos: Record<Player, (Resultado | null)[]>;   // longitud 64; tiros de ESE jugador sobre el rival
  winner: Player | null;
  ultimoDisparo: { por: Player; celda: number; resultado: Resultado } | null;
}
```

Todo es JSON-serializable (sin `Map` / `Set`) para que `TMovimiento = Move`
viaje por el canal WebRTC / relay tal cual, como en los 14 juegos previos.

`flotas[p]` es una lista de barcos; cada barco es la lista ordenada
ascendente de los índices de celda (0..63) que ocupa. El orden estable de las
claves y de los índices mantiene determinista el hash del registro remoto.

`disparos[p]` tiene longitud 64 e indexa por celda: `null` = sin disparar,
`'agua'` = disparo fallado, `'tocado'` = impacto en barco no hundido,
`'hundido'` = impacto en barco que ya está completamente hundido (todas sus
celdas se re-marcan a `'hundido'` en el turno en que cae).

### Funciones puras exportadas

- `createInitialState(): BattleshipState` — `fase: 'colocacion'`,
  `currentPlayer: 1`, `flotas: { 1: null, 2: null }`, `disparos: { 1:
  Array(64).fill(null), 2: Array(64).fill(null) }`, `winner: null`,
  `ultimoDisparo: null`.
- `generarFlotaAleatoria(): number[][]` — **impura a propósito** (usa
  `Math.random`). Devuelve 4 barcos con las longitudes de `FLOTA`, cada uno
  recto (horizontal o vertical), contiguo, dentro del tablero y sin solaparse
  con los anteriores (tocarse permitido). Implementación: para cada longitud,
  reintentar (orientación + ancla al azar) hasta encontrar un hueco sin
  solape; con 12 celdas en 64 converge en pocos intentos. Se llama **solo** al
  pulsar "Barajar"; su resultado se transmite como payload y **nunca** se
  re-sortea en el receptor.
- `esColocacionValida(barcos: unknown): boolean` — `true` sii: es un array de
  exactamente 4 elementos; las longitudes de los sub-arrays son una
  permutación de `FLOTA`; cada barco tiene índices enteros en 0..63, todos en
  la misma fila o en la misma columna, contiguos (consecutivos tras ordenar),
  sin envolvimiento de borde; y no hay ninguna celda repetida entre barcos.
- `esJugadaValida(payload: unknown): payload is Move` — type guard para el
  canal remoto. Para `{tipo:'flota'}` delega en `esColocacionValida(barcos)`.
  Para `{tipo:'disparo'}` exige `celda` entera en 0..63. Rechaza cualquier
  otra forma. **No** comprueba legalidad contra el estado (eso lo hace
  `playMove`).
- `playMove(state, move): BattleshipState` — inmutable. Si el movimiento es
  inválido para la fase actual (o ilegal contra el estado) devuelve **el mismo
  objeto** (referencia igual), para que el Board detecte el rechazo y no lo
  emita ni renderice.
- `barcosAFlote(state: BattleshipState, player: Player): number` — número de
  barcos de `flotas[player]` con al menos una celda que el rival no ha
  marcado como `'tocado'`/`'hundido'` en su array `disparos`. Devuelve el
  total de barcos de `FLOTA` si `flotas[player]` es `null`.

### Lógica de `playMove`

**Fase `colocacion`:**

- Solo acepta `{ tipo: 'flota' }`. Se valida con `esColocacionValida(barcos)`;
  si falla, misma referencia.
- Se normaliza cada barco a orden ascendente de índices antes de guardarlo.
- Fija `flotas[currentPlayer] = barcos`.
- Si **ambas** flotas quedan puestas → `fase: 'disparos'`,
  `currentPlayer: 1`.
- Si no, alterna `currentPlayer` (J1 coloca, luego J2).
- `{ tipo: 'disparo' }` durante `colocacion` → misma referencia.

**Fase `disparos`:**

- Solo acepta `{ tipo: 'disparo' }`. `celda` ya validada por forma.
- Si `disparos[currentPlayer][celda] !== null` (ya disparada ahí) → misma
  referencia.
- `rival` = el otro jugador. Se busca `celda` en `flotas[rival]`:
  - No está en ningún barco → `resultado = 'agua'`;
    `disparos[currentPlayer][celda] = 'agua'`.
  - Está en un barco → `disparos[currentPlayer][celda] = 'tocado'`. Si tras
    esto **todas** las celdas de ese barco están en
    `{'tocado','hundido'}` dentro de `disparos[currentPlayer]` →
    `resultado = 'hundido'` y se re-marcan todas esas celdas a `'hundido'`.
    Si no, `resultado = 'tocado'`.
- `ultimoDisparo = { por: currentPlayer, celda, resultado }`.
- **Fin de turno:**
  - Si **todos** los barcos de `flotas[rival]` están completamente hundidos
    (cada celda de cada barco marcada en `disparos[currentPlayer]`) →
    `fase: 'finished'`, `winner: currentPlayer`.
  - Si no → `currentPlayer = rival` (siempre alterna, aciertes o no).

No hay empate: la partida solo termina cuando alguien hunde el último barco
rival, y ese alguien gana.

### Notas

- **Sin envolvimiento de borde:** un barco horizontal no puede saltar de la
  columna 7 a la columna 0 de la fila siguiente. `esColocacionValida` lo
  bloquea exigiendo misma fila (índices consecutivos) o misma columna
  (diferencia constante `TAMANO`). Cubrir con test explícito.
- **Determinismo remoto:** `generarFlotaAleatoria` es la única fuente de
  aleatoriedad y su salida viaja en el payload. `playMove` es puro. Dos
  instancias que parten de `createInitialState()` y aplican la misma
  secuencia de `Move` convergen. Cubrir con test.

## Board — `src/games/battleship/Board.astro`

Sigue el patrón de `src/games/estampida/Board.astro`: `<TableroJuego>` + grid
de 64 botones + script que envuelve `playMove` en `jugar(move,
emitirRemoto = true)` y usa `iniciarSesionJuego<Move>`.

```ts
import { createInitialState, esJugadaValida, generarFlotaAleatoria,
         barcosAFlote, playMove, FLOTA, TAMANO,
         type BattleshipState, type Move } from './engine';
import { iniciarSesionJuego } from '../../lib/gameSession';

const FICHAS = { 1: '●', 2: '▲' } as const;
let state: BattleshipState = createInitialState();
let flotaPrevia: number[][] = generarFlotaAleatoria();  // preview local de la fase colocación
let interstitialVisible = true;                         // se baja al tocar "Empezar"

const sesion = iniciarSesionJuego<Move>({
  validarMovimiento: esJugadaValida,
  onMovimientoRemoto: (m) => jugar(m, false),
  onAplicarReinicio: () => { state = createInitialState(); flotaPrevia = generarFlotaAleatoria(); interstitialVisible = true; render(); },
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

**Guard de turno:** se aplica en `render()` (deshabilitar inputs), **nunca**
dentro de `jugar()` (lección `remoto-guard-turno-jugar`: poner `esMiTurno`
incondicional dentro de `jugar()` descarta los movimientos remotos en
silencio).

### Fase `colocacion`

Interstitial inline mínimo (no hay componente reutilizable en el repo; se hace
con un overlay `[hidden]` dentro del Board):

- Encabezado "Jugador N: coloca tu flota" + botón **"Empezar"**.
  `interstitialVisible` se pone a `false` al tocarlo. En remoto se muestra solo
  al jugador cuyo asiento coincide con `currentPlayer` (el otro ve "Esperando a
  que el rival coloque su flota").
- Ya dentro: grid 8×8 con `flotaPrevia` previsualizada (glifos de barco en las
  celdas ocupadas).
  - Botón **"Barajar"** → `flotaPrevia = generarFlotaAleatoria(); render()`
    (solo local, no emite, no toca `state`).
  - Botón **"Confirmar flota"** → `jugar({ tipo: 'flota', barcos: flotaPrevia })`.
- Tras confirmar, en pasar-y-jugar `currentPlayer` pasa a 2 y
  `interstitialVisible` vuelve a `true` (encabezado "Jugador 2"). En remoto,
  cada quien baraja/confirma en su dispositivo.
- Es la **única** fase en la que se dibuja tu propia flota.

### Fase `disparos`

- Una sola cuadrícula 8×8 = aguas del rival. Cada celda muestra, según
  `disparos[yo][i]`: vacía (`null`), `·` (`agua`), `✳` (`tocado`), `✖` con
  resalte (`hundido`). `disabled` sii: `disparos[yo][i] !== null`, **o**
  `!esMiTurno`, **o** `state.fase !== 'disparos'`.
- Click en celda → `jugar({ tipo: 'disparo', celda: Number(data-indice) })`.
- **No se dibuja tu flota.** Bajo el tablero:
  - "**Tu flota: N de 4 a flote**" con `N = barcosAFlote(state, yo)`.
  - Línea del disparo entrante: si `state.ultimoDisparo?.por === rival`,
    "Te dispararon en `<coord>` — `<resultado>`" (`agua` / `tocado` /
    `¡hundido!`); si no, vacío. `<coord>` = letra A–H (columna) + número 1–8
    (fila) derivadas del índice.
- Indicador de turno (`sesion.mostrarTurno`):
  `{ jugador, simbolos: { 1: '●', 2: '▲' },
     puntajes: { 1: barcosAFlote(state, 1), 2: barcosAFlote(state, 2) },
     detalle: 'Elige dónde disparar' }`.

### Fase `finished`

`sesion.mostrarFinDeJuego`:
`{ titulo: '🎉 ¡Ganó <nombre> (<ficha>)!',
   detalle: 'Hundió toda la flota rival' }`.
"Jugar de nuevo" → `onAplicarReinicio` (vuelve al interstitial de J1).

### Etiquetas de coordenadas

Letras A–H y números 1–8 en dos bordes del grid, **solo** como ayuda de
lectura para el texto del disparo entrante. No son entrada — la entrada es
táctil por celda. El juego es espacial, no numérico; encaja con la regla del
sitio.

### CSS

Grid de 8 columnas reutilizando medidas de Obstrucción / Estampida
(`width: min(92vw, 30rem)`, `aspect-ratio: 1`, `gap: 0.25rem`). Botones de
colocación (Barajar / Confirmar) y el overlay del interstitial centrados bajo
o sobre el tablero. Overlay = posición absoluta sobre el área del tablero con
`[hidden]` para ocultarlo (toggle por `el.hidden`, no `style.display`).
`min-height` / `min-width` de `var(--tap-target-min)` en todos los botones.

## Integración en el sitio

- `src/pages/juegos/[slug].astro`: importar `BattleshipBoard` y añadir
  `battleship: BattleshipBoard` al mapa `BOARDS`.
- `src/content/juegos/battleship.md`: frontmatter `title: "Batalla naval"`,
  `description`, `icono`, `minJugadores: 2`, `maxJugadores: 2`; cuerpo con
  reglas numeradas en español, framing positivo.
- **Backlog:** marcar la fila `37-battleship.md` con ✅ en
  `abstract-games-by-category/GAME-INDEX.md`. La ficha ya existe y no se toca
  (documenta la versión clásica 10×10/5 barcos; esta implementación es la
  "variante simplificada 8×8" que la propia ficha menciona).

## Modo remoto

- `TMovimiento = Move` (la unión discriminada). Viaja por el canal WebRTC /
  relay tal cual; el Worker no lo inspecciona (pass-through de
  `JSON.stringify`, igual que el resto de juegos). **Sin cambios** en
  `worker/`, `src/lib/gameSession.ts` ni `src/lib/types.ts`.
- El receptor aplica con `onMovimientoRemoto → jugar(m, false)`. `playMove` es
  determinista y ambos lados parten del mismo `createInitialState()`, así que
  los tableros convergen. La flota aleatoria viaja **explícita** en el payload
  (`{tipo:'flota', barcos}`); **nunca** se re-sortea en el receptor — un
  `Math.random()` por lado desincroniza y pasaría los tests locales igual, así
  que se cubre con un test de determinismo.
- El handshake `sync-hola` / `sync-moves` y el checksum FNV-1a del registro ya
  existentes cubren la reconexión sin trabajo extra: ambos lados tienen el
  mismo registro (estado compartido), así que el hash coincide.
- `esJugadaValida` rechaza payloads corruptos antes de tocar el estado.
- Secreto solo-UI: en remoto, el navegador del rival tiene tu flota en memoria
  JS (no en el DOM). Aceptado en el brainstorming; sin esquema de commitment.

## Pruebas

### `engine.test.ts` (Vitest)

- **`esColocacionValida`:** acepta una flota bien formada; acepta barcos que
  se tocan (lado y diagonal); rechaza: número de barcos ≠ 4, multiconjunto de
  longitudes ≠ `FLOTA`, barco diagonal, barco no contiguo, índice fuera de
  rango, envolvimiento de borde (fila 0 col 7 → fila 1 col 0), celda repetida
  entre dos barcos.
- **Fase `colocacion`:** rechaza `{tipo:'disparo'}` (misma referencia);
  coloca J1 y alterna a J2; transición a `disparos` exacta al quedar puestas
  las dos flotas, con `currentPlayer: 1`; barcos se normalizan a orden
  ascendente.
- **Fase `disparos`:** `agua` cuando la celda no tiene barco; `tocado` en
  impacto parcial; `hundido` cuando cae la última celda de un barco (y todas
  esas celdas quedan `'hundido'`); rechazo de celda ya disparada (misma
  referencia); el turno **siempre** alterna, aciertes o falles;
  `ultimoDisparo` lleva `por` / `celda` / `resultado` correctos.
- **Fin:** `winner` = quien hunde el último barco rival; `fase: 'finished'`;
  ningún camino produce empate; tras `finished`, `playMove` rechaza más
  disparos.
- **`barcosAFlote`:** 4 al inicio; baja al hundir un barco entero, no al
  tocarlo parcialmente; cuenta por jugador de forma independiente.
- **`esJugadaValida`:** rechaza `null`, objeto sin `tipo`, `tipo` desconocido,
  `disparo` con `celda` no entera o fuera de rango, `flota` con `barcos` mal
  formado; acepta un `Move` bien formado de cada variante.
- **Determinismo remoto:** dos instancias desde `createInitialState()` que
  aplican la misma secuencia de `Move` (dos flotas concretas + una lista de
  disparos) terminan con estados `deep-equal`.

### Fuzz independiente (script, no en CI)

N partidas completas aleatorias (flotas de `generarFlotaAleatoria`, disparos
uniformes sin repetir). Invariantes:

- toda flota generada pasa `esColocacionValida`;
- ninguna celda de barco se sobrescribe ni "revive" (monótona hacia hundido);
- `barcosAFlote` es monótono no creciente para cada jugador;
- ninguna partida se cuelga;
- toda partida termina en `fase: 'finished'` con un `winner` no nulo.

### Playtest de navegador (chrome-devtools, 375 px)

Interstitial de cada jugador; barajar varias veces y confirmar; transición a
disparos; cuadrícula de tiros con agua / tocado / hundido; contador "N de 4 a
flote"; línea de disparo entrante con coordenada correcta; banner de victoria;
"jugar de nuevo" vuelve al interstitial de J1; tablero sin scroll a 375 px;
0 errores de consola.

### Seguimiento (en el cuerpo del PR)

Playtest de modo remoto en 2 navegadores contra el Worker desplegado — no se
puede en local (`astro dev` no sirve el Worker de señalización). Igual que en
juegos previos. Verificar en especial: la flota aleatoria de cada lado se
respeta (no se re-sortea), y la reconexión no dispara falso desync.

## Fuera de alcance (MVP)

- **Colocación manual** de barcos (toque en ancla + rotar). Solo aleatoria.
- Mostrar tu propia flota con su daño como mini-grid durante los disparos
  (solo el contador "N de 4 a flote"). Enhancement fácil a futuro; es seguro
  en ambos modos porque el render es siempre para `currentPlayer`.
- "Tocado → disparas otra vez" (variante de turno).
- Tablero 10×10 y flota clásica de 5 barcos.
- Regla de no-adyacencia ("cañonero": barcos no pueden tocarse).
- Pantalla intermedia de "pasa el dispositivo" entre turnos de disparo
  (innecesaria: nunca se dibuja tu flota en esa fase).
- Anti-trampa criptográfico (commitment / hash-reveal).
- Multijugador de más de 2 jugadores (la ficha fija 2).
- Extracción del componente `<TableroJuego>` compartido (backlog aparte;
  Batalla Naval se construye sobre el patrón actual duplicado, como los 14
  juegos previos).

## Notas de accesibilidad (deuda site-wide conocida, no bloqueante)

`role="grid"` sin `row` / `gridcell`; `aria-label` estático que no refleja el
estado de cada celda; blancos de tap ~41 px a 375 px en el tablero (aceptable,
igual que Estampida, mejor que Gomoku 9×9). Los botones de colocación y el
botón "Empezar" del interstitial deben tener `aria-label` explícito y
`min-height` / `min-width` de `var(--tap-target-min)`.
