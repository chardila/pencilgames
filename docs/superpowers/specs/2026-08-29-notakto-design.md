# Notakto — Diseño (5º juego)

Fecha: 2026-08-29
Estado: aprobado (brainstorming), pendiente de plan de implementación.

## Resumen

Notakto es tres-en-raya "neutral": ambos jugadores colocan la misma marca
(✕) y **pierde** quien complete una línea de tres. Se juega sobre **3
tableros 3×3 simultáneos**; cada tablero "muere" cuando alguien forma tres
en línea en él y deja de aceptar jugadas. La partida termina cuando muere
el último tablero vivo, y ese jugada perdedora la hizo quien pierde.

Es el 5º juego del sitio, después de Tres en raya, Puntos y Cajas, Agujero
Negro y Conquista. Reutiliza el patrón existente sin cambios estructurales.

## Decisiones de alcance (no volver a preguntar)

- **3 tableros fijos**, sin selector de cantidad (coherente con la
  cuadrícula fija de Conquista).
- **2 jugadores**, sin oponente IA. Sería el primer juego con IA y no se
  quiere ampliar el alcance; los otros 4 juegos son todos pasar-y-jugar /
  remoto sin IA.
- **Juego remoto incluido**, reusando el protocolo P2P/relay existente sin
  ningún cambio (igual que Conquista). Solo se añade gating de turno por
  asiento en el `Board.astro`.
- Sin empates: Notakto siempre termina con un perdedor y un ganador.
- El componente `<TableroJuego>` compartido y `gameSession.ts` ya existen
  (las notas antiguas decían lo contrario); este juego los usa desde el
  principio, no hay deuda de migración que arrastrar.

## Reglas implementadas por la app

1. Hay 3 tableros de 3×3, todos vacíos al empezar.
2. Por turnos, el jugador activo coloca una ✕ en cualquier casilla vacía
   de cualquier tablero **vivo**.
3. Si esa ✕ forma tres en línea (fila, columna o diagonal) en ese tablero,
   el tablero queda **muerto**: se resalta la línea y ya no acepta más
   jugadas.
4. Un tablero solo muere por tres en línea. No hay otra forma de cerrarlo
   (y en la práctica no se puede llenar un 3×3 de ✕ sin formar una línea).
5. Cuando muere el último tablero vivo, la partida termina: **pierde quien
   hizo esa jugada**, gana el otro jugador.

## Arquitectura

Sigue el patrón de extensibilidad documentado en el `README.md`:

```
src/games/notakto/
├── engine.ts        # lógica pura, sin DOM
├── engine.test.ts   # Vitest
└── Board.astro       # UI + wiring con gameSession
src/content/juegos/notakto.md   # metadata + instrucciones
src/pages/juegos/[slug].astro   # registro en el mapa BOARDS
```

### Engine (`src/games/notakto/engine.ts`)

Tipos:

```ts
export type CellValue = 'X' | null;
export type GameStatus = 'playing' | 'won';
export type Player = 1 | 2;

export interface Move {
  board: number; // 0..2
  cell: number;  // 0..8
}

export interface NotaktoState {
  boards: CellValue[][];            // 3 arrays de 9
  deadBoards: boolean[];            // longitud 3
  deadLines: (number[] | null)[];   // longitud 3; la línea de 3 índices que mató cada tablero
  currentPlayer: Player;
  status: GameStatus;
  loser: Player | null;
  winner: Player | null;
}
```

Constante de líneas ganadoras: las mismas 8 combinaciones que
`src/games/tres-en-raya/engine.ts`
(`[0,1,2] … [2,4,6]`). Se duplican en este engine (8 líneas, trivial); no
se introduce un módulo compartido para esto.

Funciones exportadas:

- **`createInitialState(): NotaktoState`**
  3 tableros de 9 `null`, `deadBoards` todo `false`, `deadLines` todo
  `null`, `currentPlayer: 1`, `status: 'playing'`, `loser: null`,
  `winner: null`.

- **`esJugadaValida(payload: unknown): payload is Move`**
  `true` solo si `payload` es un objeto con `board` entero en `[0,2]` y
  `cell` entero en `[0,8]`. Es la función que consume
  `gameSession.validarMovimiento` para los mensajes remotos, así que debe
  rechazar cualquier basura.

- **`playMove(state: NotaktoState, move: Move): NotaktoState`**
  Devuelve el mismo `state` (sin mutar) si:
  - `state.status !== 'playing'`, o
  - `move.board` / `move.cell` fuera de rango, o
  - `state.deadBoards[move.board]` es `true`, o
  - la casilla ya tiene `'X'`.

  Si la jugada es válida:
  1. Copia inmutable del estado; coloca `'X'` en
     `boards[move.board][move.cell]`.
  2. Busca si `move.board` tiene ahora una línea de tres `'X'`.
     - Si la hay: `deadBoards[move.board] = true`,
       `deadLines[move.board] = línea`.
  3. Si **todos** los tableros están muertos: `status = 'won'`,
     `loser = state.currentPlayer`,
     `winner = el otro jugador`. No se cambia `currentPlayer`.
  4. Si no: `currentPlayer` pasa al otro jugador. (Se cambia de turno
     siempre, incluso si esta jugada mató un tablero pero quedan vivos —
     no hay "juega de nuevo".)

  Nota: no hace falta chequear líneas en tableros distintos de
  `move.board`; una jugada solo puede afectar al tablero donde se colocó.

### Board (`src/games/notakto/Board.astro`)

Estructura del markup, dentro de `<TableroJuego>`:

- Un contenedor `#tableros` con 3 subcuadrículas `.tablero-notakto`, cada
  una con 9 `<button class="casilla" data-tablero={t} data-indice={i}>`.
- Layout: los 3 tableros en fila (flex-wrap) en pantallas anchas; apilados
  verticalmente en móvil vía `@media`. Cada casilla respeta
  `--tap-target-min`.

Script (idéntico en forma al de `tres-en-raya/Board.astro`):

```ts
import { createInitialState, esJugadaValida, playMove, type NotaktoState, type Move } from './engine';
import { iniciarSesionJuego } from '../../lib/gameSession';
```

- `let state = createInitialState();`
- `const sesion = iniciarSesionJuego<Move>({ validarMovimiento: esJugadaValida, onMovimientoRemoto: m => jugar(m, false), onAplicarReinicio: …, onRender: render, onDesconectar: … });`
- `jugar(move: Move, emitirRemoto = true)`: `state = playMove(state, move); render(); if (emitirRemoto) sesion.enviarMovimiento(move);`
- `render()`:
  - `jugadorDelTurno = state.currentPlayer` (ya es `1 | 2`).
  - `esMiTurno = sesion.esMiTurno(jugadorDelTurno)`.
  - Por cada casilla: pinta `✕` o vacío; `disabled` si la casilla está
    ocupada, o su tablero está muerto, o `state.status !== 'playing'`, o
    `!esMiTurno`.
  - Marca visualmente los tableros muertos (atenuados + distintivo
    "muerto") y resalta las 3 casillas de `deadLines[t]`.
  - Si `status === 'playing'`:
    `sesion.mostrarTurno({ jugador: jugadorDelTurno, etiqueta: `${sesion.nombres[jugadorDelTurno]} (pone ✕)` });`
  - Si `status === 'won'`:
    `sesion.mostrarFinDeJuego({ titulo: `💀 ¡Perdió ${sesion.nombres[state.loser!]}! Ganó ${sesion.nombres[state.winner!]}` });`
- `onDesconectar`: deshabilita todas las casillas.
- Listener de `click` en cada casilla → `jugar({ board: +dataset.tablero, cell: +dataset.indice })`.
- Navegación por teclado: coherente con los demás Board (los `<button>`
  nativos ya dan foco y Enter/Espacio; no hace falta manejo especial de
  flechas si los otros juegos no lo tienen — verificar contra
  `conquista/Board.astro` y replicar el nivel que exista ahí).

### Contenido (`src/content/juegos/notakto.md`)

```md
---
title: "Notakto"
description: "Tres en raya neutral: ambos ponen ✕ y pierde quien complete la línea."
icono: "✕"
minJugadores: 2
maxJugadores: 2
---

1. Hay 3 tableros de 3×3. Por turnos, cada jugador coloca una ✕ en
   cualquier casilla vacía de cualquier tablero que siga vivo.
2. Ambos jugadores usan la misma marca: ✕.
3. Cuando alguien forma tres ✕ en línea (fila, columna o diagonal) en un
   tablero, ese tablero "muere": queda cerrado y ya no se puede jugar en
   él.
4. Pierdes si tu jugada forma la línea que mata el último tablero vivo.
   El otro jugador gana.
```

### Registro (`src/pages/juegos/[slug].astro`)

- `import NotaktoBoard from '../../games/notakto/Board.astro';`
- Añadir `'notakto': NotaktoBoard,` al objeto `BOARDS`.

No hay que tocar `ModalModoJuego`, `ModalJuegoRemoto`, `ModalJugadores`
ni el índice de juegos: el slug se descubre solo por la colección de
contenido y el buscador del índice lo toma automáticamente.

## Flujo de datos

Igual que Tres en raya:

1. Usuario elige modo local o remoto en `ModalModoJuego`.
2. Local: evento `modo-elegido-local` muestra el tablero.
   Remoto: `ModalJuegoRemoto` negocia sala y dispara `canal-remoto-listo`.
3. `gameSession` inyecta `nombres`, `miAsiento`, y el canal de mensajes.
4. Click local → `jugar(move)` → `playMove` → `render` → `enviarMovimiento`.
5. Mensaje remoto → `esJugadaValida` filtra → `onMovimientoRemoto` →
   `jugar(move, false)` (no re-emite).
6. `sesion.esMiTurno(jugadorDelTurno)` bloquea el tablero cuando no es tu
   asiento en modo remoto; en local siempre deja jugar.

## Manejo de errores / casos borde

- Payload remoto malformado: `esJugadaValida` lo rechaza antes de llegar
  al engine.
- Jugada sobre tablero muerto o casilla ocupada: `playMove` devuelve el
  estado sin cambios; `render` no hace nada visible.
- Jugada tras terminar la partida: bloqueada por `status !== 'playing'`.
- Doble click / carrera local: `playMove` es idempotente sobre casillas
  ocupadas.
- Desconexión remota a mitad de partida: `onDesconectar` congela el
  tablero (sin reconexión automática, coherente con el resto del sitio).

## Tests (`src/games/notakto/engine.test.ts`)

Con Vitest, solo el engine (sin DOM):

1. `createInitialState`: 3 tableros de 9 `null`, nada muerto,
   `currentPlayer === 1`, `status === 'playing'`.
2. `esJugadaValida`: acepta `{ board: 0, cell: 8 }`; rechaza
   `{ board: 3, cell: 0 }`, `{ board: 0, cell: 9 }`, `{ board: 0 }`,
   `{ board: 1.5, cell: 2 }`, `null`, `42`, `'x'`,
   `{ board: 0, cell: 0, extra: 1 }` → decidir si se acepta o rechaza
   propiedades extra; por defecto **aceptar** (solo se validan las dos
   claves usadas, como hace `esJugadaValida` de tres-en-raya con su
   `number`).
3. `playMove` válido: coloca `'X'`, cambia `currentPlayer` de 1 a 2.
4. `playMove` inválido: casilla ocupada / tablero fuera de rango / celda
   fuera de rango / `status === 'won'` → devuelve el mismo estado
   (idealmente misma referencia).
5. Muerte de tablero: una jugada que completa `[0,1,2]` marca
   `deadBoards[t] === true` y `deadLines[t]` igual a la línea; y **se
   cambia de turno** (quedan tableros vivos).
6. No se puede jugar en un tablero muerto: `playMove` sobre él no cambia
   nada.
7. Fin de partida: matar el 3er tablero vivo →
   `status === 'won'`, `loser === ` jugador que hizo la jugada,
   `winner === ` el otro, `currentPlayer` sin cambiar.
8. Secuencia completa determinista: construir una partida corta paso a
   paso hasta el final y verificar el perdedor.

## Plan de implementación (previsto)

`subagent-driven-development` como en Conquista, ~5–6 tareas:

1. `engine.ts` + `engine.test.ts` (TDD).
2. `notakto.md` (contenido/reglas).
3. `Board.astro` (markup + estilos).
4. `Board.astro` (script + wiring con `gameSession`).
5. Registro en `[slug].astro` + verificación de build (`astro check`,
   `npm run build`) y del índice/buscador.
6. Revisión de todo el branch + playtest manual (local + remoto con 2
   contextos aislados + teclado) con Chrome DevTools MCP.

## Verificación de "hecho"

- `npm test` (raíz) en verde, incluidos los nuevos tests de Notakto.
- `astro check` sin errores.
- `npm run build` genera `/juegos/notakto`.
- Notakto aparece en el índice y en el buscador.
- Playtest manual: partida local completa hasta un perdedor; partida
  remota con gating de turno correcto; "jugar de nuevo" reinicia los 3
  tableros; desconexión congela el tablero.
