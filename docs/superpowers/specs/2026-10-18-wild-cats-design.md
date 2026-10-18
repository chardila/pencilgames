# Gatos Salvajes (Wild Cats) — Diseño (27.º juego)

Fecha: 2026-10-18
Estado: borrador para revisión, pendiente de plan de implementación.

Brainstorming abreviado a petición del usuario ("empieza directo, usa tus
mejores defaults"): todas las decisiones de abajo son **llamadas mías** y están
marcadas como tales; el usuario puede revertir cualquiera.

## Resumen

Juego de 4 en raya sobre una rejilla de 5×5 para 2 jugadores donde **los dos
eligen casilla a la vez, en secreto**, y luego se revelan juntas. Si eligieron
casillas distintas, ambos colocan su ficha. Si eligieron la misma, **chocan**:
ninguno coloca y esa casilla queda vetada para la ronda siguiente. Gana quien
forme una línea de 4 propias (horizontal, vertical o diagonal).

Es el **primer juego de turnos simultáneos** del sitio. Los 26 previos son de
turnos alternos; Batalla Naval tiene información oculta pero sigue alternando.

Ficha de backlog (fuente de las reglas):
`abstract-games-by-category/01-2-players/61-wild-cats.md`. Slug del sitio:
`wild-cats`; título visible: "Gatos Salvajes"; `tipo: conectar`.

## Objetivos, no-objetivos y anti-objetivos

- **Objetivo:** que la tensión de "¿elegirá la misma casilla que yo?" se sienta
  en pantalla, también al jugar pasando el móvil.
- **No-objetivo:** seguridad criptográfica de la elección oculta (ver
  decisión 2). Tampoco IA ni más de 2 jugadores.
- **Anti-objetivo:** que la mecánica de simultaneidad obligue a tocar
  `gameSession.ts`, el `worker/` o el protocolo de reconexión.

## Reglas implementadas

1. Rejilla 5×5. J1 usa ● y J2 usa ▲ (convención de fichas por asiento del
   sitio; la ficha dice X/O, **llamada mía**).
2. Cada **ronda**, ambos eligen en secreto una casilla vacía.
3. Se revelan a la vez:
   - **Casillas distintas:** ambos colocan su ficha.
   - **Choque (misma casilla):** no se coloca nada; la casilla sigue vacía y
     **ninguno puede elegirla en la ronda inmediata siguiente**.
4. Tras colocar, se comprueban líneas de 4 consecutivas (H/V/D, tablero sin
   envolvimiento). Con 5×5 hay 28 líneas posibles.
5. Fin:
   - Solo un jugador forma línea → gana.
   - **Ambos forman línea en la misma revelación → empate** (llamada mía; la
     ficha no lo prevé).
   - Tablero lleno sin línea → empate.
   - **Tope de 40 rondas → empate** (llamada mía, evita bucles infinitos de
     choques deliberados; 25 casillas hacen que una partida normal acabe muy
     antes).
6. **Casilla vetada sin alternativa:** si la única casilla vacía es la vetada
   por el choque anterior, el veto se levanta (llamada mía; si no, nadie
   podría jugar).

### Regla de la ficha que NO se implementa

La ficha incluye una "Constraint" ("quien tiene 3 en línea no puede elegir la
4.ª casilla si es la única completación…"). Es ambigua y contradice el resto
del texto: con elecciones simultáneas, el rival ya puede disputar esa casilla
eligiéndola también (provoca choque y veto). **Se omite** y el choque cumple
esa función (llamada mía; documentar en las reglas del sitio solo el choque).

## Decisiones de diseño (todas llamadas mías)

1. **Orden de confirmación fijo: primero J1, luego J2, dentro de cada
   ronda.** Es la clave para encajar la simultaneidad sin tocar la
   infraestructura. `gameSession` guarda un *registro* de jugadas por cliente y
   su hash FNV-1a (reconexión) depende del **orden**. Si cada cliente enviara su
   elección cuando quiera, los dos registros quedarían ordenados distinto y la
   reconexión daría un falso desfase. Con orden forzado por el motor
   (`playMove` rechaza a J2 si J1 no ha confirmado) los registros coinciden
   siempre. La revelación sigue siendo simultánea: nada se muestra hasta que
   J2 confirma.
2. **Secreto solo en UI, sin commitment** (mismo criterio que Batalla Naval):
   la elección pendiente de J1 viaja por el canal y vive en memoria del
   navegador de J2, pero **no se dibuja en el DOM** hasta la revelación. En
   pasar-y-jugar ambas elecciones están en el mismo dispositivo de todos modos.
3. **Elegir = tocar para marcar + botón "Confirmar"** (como Nim): la elección
   es irreversible y secreta, un toque suelto no debe comprometerla. Se puede
   cambiar de casilla marcada antes de confirmar.
4. **Pasar-y-jugar:** pantalla intermedia *"Pasa el dispositivo a Jugador N"*
   con botón "Listo" entre la confirmación de J1 y la de J2 (y al inicio de cada
   ronda para J1 si la revelación quedó en pantalla). Reutiliza el patrón de
   overlay `[hidden]` de Batalla Naval; en remoto no hay overlay.
5. **Revelación persistente:** tras confirmar J2 se muestran las dos
   elecciones resaltadas (marco de cada color; si hubo choque, marco en la
   casilla con "¡Choque!") y una línea de texto ("Eligieron C3 los dos —
   casilla vetada"). Dura hasta que J1 empieza la ronda siguiente (botón
   "Siguiente ronda"; en remoto basta con que el primero en elegir marque).
6. **Etiquetas A–E / 1–5** en los bordes solo como ayuda de lectura del texto
   de revelación; la entrada es táctil por casilla.
7. **Deshacer / persistir partida:** `onDeshacer` y `obtenerSnapshot`
   devuelven/restauran el estado completo, como Kropki. El snapshot incluye la
   elección pendiente de J1 (es almacenamiento local del mismo dispositivo).
   Deshacer no existe en remoto (comportamiento ya existente).

## Motor — `src/games/wild-cats/engine.ts`

### Tipos y constantes

```ts
import type { Player } from '../../lib/players';

export const LADO = 5;
export const CELDAS = LADO * LADO;   // 25
export const LARGO_LINEA = 4;
export const MAX_RONDAS = 40;

export type Celda = Player | null;

export interface Revelacion {
  elecciones: Record<Player, number>;  // lo que eligió cada uno
  choque: boolean;
}

export interface WildCatsState {
  tablero: Celda[];                    // longitud 25
  currentPlayer: Player;               // a quién le toca confirmar (1 y luego 2)
  eleccionJ1: number | null;           // pendiente de J1 durante la ronda (secreta en UI)
  vetada: number | null;               // casilla vetada para ESTA ronda (por choque previo)
  ronda: number;                       // 1-based
  ultimaRevelacion: Revelacion | null;
  fase: 'jugando' | 'finished';
  winner: Player | null;               // null en 'finished' = empate
}

export interface Move { celda: number }  // quien lo emite es currentPlayer
```

Todo JSON-serializable. `Move` no lleva jugador: lo determina `currentPlayer`
(orden forzado). El payload remoto es exactamente `Move`.

### Funciones puras exportadas

- `createInitialState()` — tablero vacío, `currentPlayer: 1`,
  `eleccionJ1: null`, `vetada: null`, `ronda: 1`, `ultimaRevelacion: null`,
  `fase: 'jugando'`, `winner: null`.
- `esJugadaValida(payload: unknown): payload is Move` — objeto con `celda`
  entera en 0..24. No mira el estado.
- `celdasElegibles(state): number[]` — casillas vacías menos `vetada`; si eso
  deja la lista vacía (regla 6), todas las vacías.
- `playMove(state, move): WildCatsState` — inmutable; si es ilegal devuelve el
  **mismo objeto** (misma referencia) para que el Board no renderice ni emita.
- `lineaGanadora(tablero, jugador): number[] | null` — celdas de una línea de 4
  del jugador (para resaltarla), o `null`.

### Lógica de `playMove`

- `fase !== 'jugando'` o `celda` no está en `celdasElegibles(state)` → misma
  referencia.
- **`currentPlayer === 1`:** guarda `eleccionJ1 = celda`, pasa
  `currentPlayer = 2`. No cambia `tablero`.
- **`currentPlayer === 2`:** resuelve la ronda con `a = eleccionJ1`, `b = celda`:
  - `a === b` (choque): tablero intacto; `vetada = a`; `ultimaRevelacion =
    { elecciones: {1:a,2:b}, choque: true }`.
  - si no: `tablero[a] = 1`, `tablero[b] = 2`; `vetada = null`;
    `ultimaRevelacion = { …, choque: false }`.
  - Evalúa líneas: `g1 = lineaGanadora(…,1)`, `g2 = lineaGanadora(…,2)`.
    Solo `g1` → `winner 1`; solo `g2` → `winner 2`; ambas → empate
    (`winner null`, `finished`). Si no hay línea y el tablero está lleno o
    `ronda === MAX_RONDAS` → empate.
  - Si sigue: `ronda++`, `eleccionJ1 = null`, `currentPlayer = 1`.

### Notas de corrección

- J2 **sí puede** elegir la misma casilla que J1 (eso es el choque), así que
  `celdasElegibles` no excluye `eleccionJ1`.
- El veto solo dura una ronda: se pone en `vetada` al chocar y se borra en la
  resolución de la ronda siguiente (`vetada = null` si no hubo choque; si
  vuelve a chocar, se reemplaza).
- Determinismo remoto: sin aleatoriedad; dos instancias con la misma secuencia
  de `Move` convergen. Cubrir con test.

## Board — `src/games/wild-cats/Board.astro`

Patrón de `kropki/Board.astro`: `<TableroJuego>` + rejilla 5×5 de botones +
script con `jugar(move, emitirRemoto = true)` y `iniciarSesionJuego<Move>`.
El guard de turno va en `render()`, **nunca** dentro de `jugar()` (lección
`remoto-guard-turno-jugar`).

- Estado local de UI (no en `state`): `marcada: number | null` (casilla
  tocada sin confirmar), `overlayVisible`.
- Casilla deshabilitada si: ocupada, vetada (con `celdasElegibles`), no es mi
  turno, o `fase === 'finished'`.
- Toque → `marcada = i`; botón **Confirmar** (deshabilitado sin marca) →
  `jugar({ celda: marcada })`, `marcada = null`.
- `render()` dibuja `tablero` y, si `ultimaRevelacion`, las dos elecciones y el
  choque; **nunca** dibuja `eleccionJ1` pendiente.
- Indicador de turno: `{ jugador: currentPlayer, simbolos: {1:'●',2:'▲'},
  detalle: 'Elige en secreto' }`.
- Fin: ganador (con la línea resaltada) o empate con detalle
  ("Los dos completaron línea a la vez" / "Tablero lleno" / "Demasiadas
  rondas").
- Casilla vetada: estilo atenuado + `aria-label` "vetada esta ronda".
- Sin colores fijos (`sinColoresFijos.test.ts`): usar tokens de paleta. Botones
  con `min-height/min-width: var(--tap-target-min)`. Rejilla
  `width: min(92vw, 26rem)`, casillas ≥ 3.2 rem a 375 px.

## Integración en el sitio

Siguiendo los últimos juegos (#117–#119), un PR con:

- `src/games/wild-cats/{engine.ts,engine.test.ts,Board.astro}`.
- `src/pages/juegos/[slug].astro`: import + entrada `'wild-cats'` en `BOARDS`.
- `src/content/juegos/gatos-salvajes.md` (frontmatter igual que Kropki:
  `title`, `description`, `minJugadores: 2`, `maxJugadores: 2`,
  `duracion: corto`, `edad: 8`, `tipo: conectar`; **cuerpo en español, reglas
  numeradas, framing positivo** sin mencionar la regla omitida).
- `src/components/IconoJuego.astro`: icono del slug.
- `src/lib/catalogo.test.ts` y `src/lib/estadoClonable.test.ts`: subir el
  recuento y añadir `'wild-cats'`.
- `e2e/juegos/adaptadores.ts`: adaptador propio (la primera jugada requiere
  tocar una casilla **y** pulsar "Confirmar"; el genérico no basta).
- `GAME-INDEX.md`: marcar `61-wild-cats.md` con ✅.

## Modo remoto

- `TMovimiento = Move`. Sin cambios en `worker/`, `gameSession.ts` ni
  `types.ts`. El orden J1→J2 forzado por el motor mantiene idénticos los
  registros de ambos lados (hash de reconexión correcto).
- `esMiTurno(currentPlayer)` ya habilita solo al jugador que debe confirmar;
  J2 ve "Tu rival ya eligió" (sin la casilla) y la rejilla activa tras la
  confirmación de J1.
- **Coste aceptado:** el pensamiento de los dos no es literalmente paralelo en
  remoto (J2 espera la confirmación de J1). Mitigación: J2 puede ir marcando
  casilla mientras espera (`marcada` es estado local) y solo confirma cuando
  recibe la de J1. Alternativa descartada: elecciones realmente simultáneas
  exigirían un registro independiente del orden en `gameSession`.

## Pruebas

### `engine.test.ts` (Vitest)

- Estado inicial; `esJugadaValida` (acepta celda 0..24; rechaza `null`,
  no entera, negativa, 25, objeto sin `celda`).
- Ronda normal: J1 confirma (tablero intacto, pasa a J2); J2 confirma →
  ambas fichas colocadas, `ronda` +1, vuelve a J1.
- Choque: tablero intacto, `vetada` = casilla, `choque: true`; esa casilla no
  es elegible la ronda siguiente y sí la posterior; segundo choque reemplaza
  el veto.
- Regla 6: si la única vacía es la vetada, es elegible.
- Rechazos con misma referencia: casilla ocupada, fuera de rango, vetada,
  partida terminada.
- Líneas: 4 en H/V/D en ambos sentidos; sin envolvimiento de borde; 3 no basta.
- Fin: gana solo uno; **ambos a la vez → empate**; tablero lleno → empate;
  `MAX_RONDAS` → empate; `playMove` tras `finished` rechaza.
- Determinismo: dos instancias con la misma secuencia terminan `deep-equal`.

### Fuzz (script, no en CI)

N partidas con elecciones aleatorias legales: invariantes (tablero nunca
sobrescribe una ficha, `ronda` ≤ `MAX_RONDAS`, siempre termina, `winner`
coherente con `lineaGanadora`).

### Playtest de navegador (375 px)

Marcar/desmarcar/confirmar; overlay "pasa el dispositivo" no revela la
elección de J1; revelación con casillas distintas y con choque; casilla
vetada atenuada; victoria, empate doble y "jugar de nuevo"; sin scroll; 0
errores de consola.

### Seguimiento (en el PR)

Playtest remoto en 2 navegadores contra el Worker desplegado (no se puede en
local). Verificar en especial que J2 no ve la elección de J1 en el DOM y que la
reconexión a media ronda no dispara falso desfase.

## Fuera de alcance (MVP)

- Elecciones verdaderamente simultáneas en remoto (ver Modo remoto).
- Anti-trampa criptográfico (commitment / hash-reveal).
- Tablero mayor o línea de 5; temporizador para elegir; IA.
- La "Constraint" ambigua de la ficha.
- Más de 2 jugadores.
