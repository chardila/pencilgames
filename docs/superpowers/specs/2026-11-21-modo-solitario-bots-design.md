# Modo solitario contra el robot — Diseño

Fecha: 2026-11-21
Estado: borrador validado en brainstorming, pendiente de revisión del usuario y plan de implementación.
Contexto compartido: `specs/00-contexto-compartido.md`.

## Objetivo

Permitir que un niño juegue solo contra la máquina (robot) cuando no tenga con quién jugar, con **3 niveles de dificultad** calibrados para aprender sin frustrarse y evitar que termine rechazando los juegos.

La arquitectura queda lista para que agregar bots al resto del catálogo más adelante solo requiera añadir un archivo puro `bot.ts`, dos líneas en `Board.astro` y marcar `minJugadores: 1` en el `.md` del juego.

## Alcance de esta primera entrega

### Lote inicial de 6 juegos

Seleccionados por ser accesibles para niños y cubrir las distintas mecánicas del catálogo (turnos alternos, turnos repetidos en cadena, tableros pequeños y medianos):

| Juego | Slug | Edad | Tipo | Mecánica que valida |
|---|---|---|---|---|
| Tres en raya | `tres-en-raya` | 5+ | conectar | Rejilla 3×3, minimax exacto |
| Puntos y cajas | `puntos-y-cajas` | 5+ | dibujar | Turnos repetidos en cadena, 24 líneas |
| Obstrucción | `obstruccion` | 5+ | bloquear | Rejilla 6×6, juego imparcial |
| Nim | `nim` | 7+ | bloquear | Invariante matemática exacta (XOR), selección en 2 pasos en UI |
| Chomp | `chomp` | 7+ | bloquear | 4×7, solucionador exacto memoizado (329 estados) |
| Gomoku | `gomoku` | 7+ | conectar | Rejilla 9×9, poda por vecindad + alfa-beta |

Los otros 21 juegos no se modifican y siguen funcionando exactamente igual (solo `local` y `remoto`).

### Fuera de alcance

- Bots para los otros 21 juegos (se añaden en lotes posteriores sobre esta misma arquitectura).
- Juegos de 1 jugador puros de tipo puzle (`abstract-games-by-category/02-solo/`).
- Dificultad adaptativa automática que cambie de nivel sin que el niño la elija.
- Pistas o sugerencias visuales sobre el tablero durante el turno del niño.
- Web Workers o dependencias externas (todo es TypeScript puro, Astro y CSS vanilla).

---

## Decisiones de arquitectura

Se eligió un **orquestador de bot desacoplado (`controladorBot.ts`) + módulos `bot.ts` puros por juego**, conectado a `gameSession.ts` mediante un callback opcional `elegirMovimientoBot`.

- **Por qué no simular un `MoveChannel` falso:** el modo remoto desactiva Deshacer, desactiva la persistencia local, no alterna asientos en revanchas y exigiría mantener una copia sombra del estado del juego que se rompería al deshacer o restaurar.
- **Por qué no un motor único genérico de búsqueda:** Nim se resuelve con un XOR de 5 líneas y Chomp 4×7 con 329 estados memoizados, mientras Gomoku 9×9 necesita poda por vecindad y heurística de patrones. Cada `bot.ts` elige el algoritmo ideal y rápido (< 30 ms) para su juego.
- **Mantenibilidad:** `gameSession.ts` ya supera las 850 líneas; aislar el ciclo de vida del bot en `src/lib/bot/controladorBot.ts` evita seguir engordándolo y permite probar timers, cadenas y cancelaciones de forma independiente.

---

## Sección 1 — Portada, flujo de entrada y controles de partida

### 1.1 Portada y catálogo

- **`src/content/juegos/{tres-en-raya,puntos-y-cajas,obstruccion,nim,chomp,gomoku}.md`**: cambiar `minJugadores: 2` a `minJugadores: 1`. Esa propiedad del frontmatter (ya permitida por `src/content.config.ts`) es la única fuente de verdad de soporte solitario.
- **`src/lib/catalogo.ts`**: añadir la constante compartida `ETIQUETA_SOLO = { icono: '🤖', texto: '1 jugador' }`.
- **`src/components/GameCard.astro`**: aceptar prop `solo?: boolean`. Si es `true`, renderizar la etiqueta `🤖 1 jugador` en `.game-card__etiquetas` con el mismo estilo de pastilla existente.
- **`src/lib/filtros.ts`**:
  - Añadir `solo: boolean` a `JuegoFiltrable`.
  - Añadir `solo: boolean` a `Filtros` (si es `true`, exige `juego.solo === true`).
- **`src/pages/index.astro`**:
  - Añadir el atributo `data-solo={juego.data.minJugadores === 1 ? 'true' : 'false'}` en `.indice__item` y pasar `solo={juego.data.minJugadores === 1}` a `GameCard`.
  - Añadir un grupo de filtros **`Jugadores`** (`data-grupo="jugadores"`) en `.indice__filtros` con las píldoras `Todos` (`data-todos`) y `🤖 Jugar solo` (`data-valor="solo"`). Combinable con duración, tipo y buscador, y reseteado por «Limpiar filtros».

### 1.2 Persistencia de preferencia de modo (`src/lib/entrada.ts`)

- Extender `export type Modo = 'solo' | 'local' | 'remoto'`.
- Añadir clave `pencilgames:dificultad` con funciones puras y `try/catch` silencioso:
  - `getDificultadGuardada(): Dificultad` (devuelve `'facil'` si no existe o es inválida).
  - `guardarDificultad(dificultad: Dificultad): void`.

### 1.3 Flujo de arranque (`src/components/ModalModoJuego.astro` y `src/pages/juegos/[slug].astro`)

- `[slug].astro` calcula `const soportaSolo = juego.data.minJugadores === 1` y lo pasa a `ModalModoJuego`, `AccionesCabecera` y `ModalOpcionesSolo` (este último solo se renderiza si `soportaSolo` es `true`).
- **`ModalModoJuego.astro`** (recibe prop `soportaSolo?: boolean` reflejada en `data-soporta-solo`):
  - **Vista 1 («¿Cómo van a jugar?»):** si `soportaSolo`, muestra 3 botones grandes (≥ 48 px): `🤖 Jugar solo` (`#modal-modo-juego-solo`), `📱 Misma tableta` (`#modal-modo-juego-local`), `🌐 Por internet` (`#modal-modo-juego-remoto`). Si `!soportaSolo`, el botón de solitario no se renderiza.
  - **Vista 2 (selector de dificultad en el mismo modal, sin abrir un segundo popup):** al tocar `🤖 Jugar solo`, oculta los botones de modo y muestra los 3 niveles (≥ 56 px cada uno) más el botón `← Otro modo`:
    - `🌱 Fácil` — *Para aprender*
    - `🎯 Medio` — *Partida reñida*
    - `🔥 Difícil` — *Todo un reto*
  - Al elegir dificultad: guarda `guardarModo('solo')` y `guardarDificultad(dificultad)`, oculta el modal y dispara `modo-elegido-solo` con `{ detail: { dificultad } }`.
  - **Auto-salto al volver (`instrucciones-cerradas`):**
    - Si `getModoGuardado() === 'solo'` y `soportaSolo === true`: salta el modal y dispara directamente `modo-elegido-solo` con `{ detail: { dificultad: getDificultadGuardada() } }`.
    - Si `getModoGuardado() === 'solo'` y `soportaSolo === false`: **no** borra la preferencia `'solo'` y muestra el modal con `📱 Misma tableta` y `🌐 Por internet`.
  - Escucha `modo-elegido-solo` para marcar `modoYaElegido = true`, `tableroVisible = true` y ocultar el modal (análogo a `modo-elegido-local`).
- **`ModalInstrucciones.astro`**: escucha `modo-elegido-solo` para marcar `tableroVisible = true` y ocultar `botonRemoto` (idéntico a `modo-elegido-local`).

### 1.4 Cabecera y opciones en partida (`AccionesCabecera.astro`, `ModalOpcionesSolo.astro`, `[slug].astro`)

- **`AccionesCabecera.astro`** (recibe `soportaSolo?: boolean`): añade dos botones ocultos por defecto (≥ 48 px, con variables de paleta y adaptación en horizontal `height <= 46rem`):
  - `#boton-jugar-solo` (`🤖 Jugar solo`): visible en modo `local` cuando `soportaSolo === true`.
  - `#boton-dificultad-solo` (p. ej. `🤖 Fácil`, `🤖 Medio`, `🤖 Difícil`): visible en modo `solo`, muestra icono + nivel activo.
- **`ModalOpcionesSolo.astro`** (nuevo componente enfocado únicamente en acciones a mitad de partida):
  - **Abierto desde `#boton-jugar-solo` (en modo local):** muestra los 3 botones de dificultad y `Cancelar`. Al elegir una dificultad, guarda preferencia (`solo` + dificultad), cierra el modal y dispara `modo-elegido-solo` (`{ detail: { dificultad } }`), iniciando una partida nueva contra el robot. Si cancela, la partida local sigue intacta.
  - **Abierto desde `#boton-dificultad-solo` (en modo solo):** muestra los 3 botones de dificultad (con `aria-pressed="true"` en el activo), además de dos acciones secundarias (`📱 Misma tableta`, `🌐 Por internet`) y `Cerrar`.
    - Tocar otra dificultad: guarda `guardarDificultad(dificultad)`, actualiza la etiqueta de `#boton-dificultad-solo`, cierra el modal y dispara `dificultad-solo-cambiada` (`{ detail: { dificultad } }`). **Aplica desde la siguiente jugada del robot sin reiniciar la partida en curso.**
    - Tocar `📱 Misma tableta`: guarda `guardarModo('local')`, cierra el modal y dispara `modo-elegido-local`.
    - Tocar `🌐 Por internet`: cierra el modal y dispara `abrir-modal-remoto` (sin sobrescribir el modo guardado; si se cancela la sala, la partida solitaria continúa intacta).
- **`[slug].astro`** coordina la visibilidad de botones de cabecera:
  - En `modo-elegido-local`: muestra `#contenedor-tablero`, `#modal-jugadores-abrir`, `#boton-jugar-por-internet` y (si existe) `#boton-jugar-solo`; oculta `#boton-dificultad-solo`.
  - En `modo-elegido-solo`: muestra `#contenedor-tablero` y `#boton-dificultad-solo` (con el texto del nivel); oculta `#modal-jugadores-abrir`, `#boton-jugar-por-internet` y `#boton-jugar-solo`.
  - En `canal-remoto-listo`: oculta todos los botones de cabecera locales/solo.

### 1.5 Identidad del rival, indicador de turno y tono al terminar

- **Nombre del niño:** `getMiNombre() ?? getPlayerNames()[1]` (reutiliza su nombre si ya lo personalizó, o `'Jugador 1'` por defecto; evita la frase gramaticalmente rota «¡Ganó Tú!» y no bloquea el arranque pidiendo nombre).
- **Nombre del rival:** constante `NOMBRE_BOT = 'Robot'`.
- **`src/lib/turnIndicator.ts`**: añadir opción `textoEspera?: string` en `TurnIndicatorOptions` (por defecto `'esperando…'`). En modo solitario `gameSession.ts` pasa `'pensando…'`, que también se usa en `prosaAccesible` (`Turno de Robot, pensando`).
- **Fin de partida amable (`gameSession.ts`):**
  - Si gana el niño (`ganador === miAsiento`): fanfarria (`'victoria'`), confeti y título original del juego.
  - Si gana el robot (`ganador !== null && ganador !== miAsiento`): **sin confeti**, sonido neutro (`'punto'`), título amigable `'🤖 Ganó Robot'` conservando `opciones.detalle` (puntajes, motivo) y el botón inmediato de «Revancha».
  - Si hay empate (`ganador === null`): sin confeti, sonido `'punto'` y título original.

---

## Sección 2 — Sesión, controlador del bot, Deshacer, alternancia y persistencia

### 2.1 Contratos compartidos (`src/lib/bot/tipos.ts`)

```ts
export type Dificultad = 'facil' | 'medio' | 'dificil';
export type Rng = () => number;

export const NOMBRE_BOT = 'Robot';

export const DIFICULTADES: readonly Dificultad[] = ['facil', 'medio', 'dificil'];

export const DIFICULTAD_INFO: Record<
  Dificultad,
  { icono: string; texto: string; descripcion: string }
> = {
  facil: { icono: '🌱', texto: 'Fácil', descripcion: 'Para aprender' },
  medio: { icono: '🎯', texto: 'Medio', descripcion: 'Partida reñida' },
  dificil: { icono: '🔥', texto: 'Difícil', descripcion: 'Todo un reto' },
};

export function elegirAlAzar<T>(opciones: readonly T[], rng: Rng = Math.random): T;
```

### 2.2 Contrato de cada bot (`src/games/<slug>/bot.ts`)

Cada uno de los 6 juegos crea `src/games/<slug>/bot.ts` exportando:

```ts
export function elegirMovimiento(
  state: <EstadoDelJuego>,
  dificultad: Dificultad,
  rng?: Rng
): <MovimientoDelJuego>;
```

En `src/games/<slug>/Board.astro` solo se importa `elegirMovimiento` y se agrega una línea a `iniciarSesionJuego`:

```ts
elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

`GameSessionConfig<TMovimiento>` añade:

```ts
elegirMovimientoBot?: (dificultad: Dificultad) => TMovimiento | null;
```

### 2.3 Controlador del bot (`src/lib/bot/controladorBot.ts`)

Módulo puro (sin DOM, inyecta temporizador / preferencia de movimiento reducido para tests rápidos y deterministas):

- **Estado interno:** `activo`, `dificultad`, `asientoHumano: Player` (1 o 2), `aplicandoJugada`, `timerPendiente`, `epoch` (contador incremental).
- **Retraso natural:** `500 ms` en modo normal, `180 ms` cuando `prefers-reduced-motion: reduce`.
- **`alCambiarTurno(jugadorActual: Player)`:**
  - Si `!activo` o `jugadorActual === asientoHumano`: cancela cualquier timer pendiente y sale.
  - Si `jugadorActual !== asientoHumano` (turno del bot): cancela timer previo, incrementa `epoch` y programa un `setTimeout`.
- **Ejecución al vencer el timer:**
  1. Verifica `activo` y que `epoch` siga vigente.
  2. Obtiene el movimiento llamando `elegirMovimientoBot(dificultad)` dentro de `try/catch`.
  3. Valida con `validarMovimiento(mov)`. Si es `null`, inválido o lanza excepción, registra `console.warn` y se detiene (sin reprogramar en bucle).
  4. Captura opcionalmente el snapshot previo (`obtenerSnapshot?.()`) para detectar si el movimiento no cambió el estado (defensa extra contra bucles infinitos).
  5. Marca `aplicandoJugada = true`, invoca `aplicarMovimiento(mov)` (`onMovimientoRemoto`) dentro de `try/finally` y restablece `aplicandoJugada = false`.
- **Turnos repetidos (p. ej. Puntos y cajas):** como `aplicarMovimiento` vuelve a llamar a `render()` → `mostrarTurno({ jugador: asientoBot, repiteTurno: true })`, `alCambiarTurno` programa automáticamente la siguiente línea tras otros ~500 ms. El niño ve cada línea dibujarse una por una.
- **`cancelarTurno()`:** limpia `timerPendiente` e incrementa `epoch`. Se llama al deshacer, reiniciar, terminar partida, cambiar de modo o destruir la sesión.

### 2.4 Integración en `src/lib/gameSession.ts`

Separar explícitamente `esRemoto()` (`canal !== null`) y `esSolo()` (`controladorBot.estaActivo()`) en lugar de inferir «remoto» desde `miAsiento !== null`:

| Punto en `gameSession.ts` | Comportamiento con los 3 modos |
|---|---|
| `esMiTurno(jugador)` | Sin cambios: `miAsiento === null \|\| miAsiento === jugador`. En solitario bloquea el tablero durante el turno del robot automáticamente. |
| `guardarParaDeshacer(snap)` | Siempre marca `senales.marcar('toque')`. Si `esRemoto() \|\| controladorBot.estaAplicandoJugada()`, no apila en `pilaDeshacer`. |
| `actualizarBotonDeshacer()` | `boton.hidden = esRemoto()` (visible en local y en solitario). `boton.disabled = pilaDeshacer.length === 0`. |
| `alClicControlDeshacer()` | Permitido si `!esRemoto() && pilaDeshacer.length > 0`. Llama `controladorBot.cancelarTurno()`, saca un snapshot de `pilaDeshacer` y restaura el turno anterior del niño en un solo toque (deshace toda la respuesta o cadena del robot y la última jugada del niño). Si el robot abrió la partida y el niño aún no ha jugado, la pila está vacía y el botón queda deshabilitado. |
| `puedePersistir()` | `!esRemoto() && !!config.obtenerSnapshot`. |
| `alActualizarNombresLocales()` | Solo aplica si `!esRemoto() && !esSolo()`. |
| `alModoSolo(evento)` | Activa `controladorBot` con `dificultad` y `asientoHumano` (default `1`), actualiza `miAsiento = asientoHumano`, asigna `nombres` (`asientoHumano` = niño, otro asiento = `'Robot'`), cambia marcador a clave `${slug}:solo`. Si `!restaurando`, limpia pila/registro, descarta partida guardada y llama `onAplicarReinicio()`. |
| `alCambiarDificultadSolo(evento)` | Actualiza `controladorBot.setDificultad(dificultad)` sin reiniciar el tablero ni perder la pila. Si hay partida persistible, reprograma guardado. |
| `alModoLocal()` | Si `esSolo()`, desactiva `controladorBot`, pone `miAsiento = null`, recupera `getPlayerNames()`, cambia marcador a `slug`, limpia pila/registro, descarta partida guardada y llama `onAplicarReinicio()`. Si ya estaba en local, no hace nada. |
| `alCanalRemotoListo()` | Si `esSolo()`, desactiva `controladorBot` antes de conectar el canal remoto. |
| `destruir()` | Llama `controladorBot.cancelarTurno()` y quita los nuevos listeners (`modo-elegido-solo`, `dificultad-solo-cambiada`, `modo-elegido-local`). |

### 2.5 Alternancia en revanchas y marcador por identidad

- **Revancha (botón del banner tras terminar una partida):** en `mostrarFinDeJuego`, `showWinnerBanner` recibe un `onReiniciar` que en modo solitario **alterna `asientoHumano`** (`1 → 2` o `2 → 1`), reasigna `miAsiento` y `nombres`, y luego reinicia el tablero. Cuando el robot pasa a ser el asiento 1, el render inicial llama `mostrarTurno({ jugador: 1 })` y el robot realiza su primera jugada tras ~500 ms.
- **Reiniciar a mitad de partida (botón `↻ Reiniciar` de la barra inferior):** mantiene el `asientoHumano` actual y limpia el tablero (si el robot empezaba esa ronda, vuelve a hacer su jugada de apertura).
- **Marcador independiente por identidad:**
  - En modo solitario se usa la clave `pencilgames:marcador:${slug}:solo` (reutilizando `obtenerMarcador`/`registrarVictoria`/`limpiarMarcador` con `${slug}:solo`, sin cambiar la API de `marcador.ts`).
  - Dentro de esa clave, la posición `1` siempre cuenta victorias del **niño** y la `2` victorias del **Robot**, independientemente de qué asiento haya tenido cada uno en esa ronda: `ganadorMarcador = ganador === null ? null : ganador === miAsiento ? 1 : 2`.
  - Se formatea siempre como `formatearMarcador(marcador, { 1: nombreHumano, 2: NOMBRE_BOT })`.
  - Al volver a `/` (`alClicPosibleVolverALista`), limpia el marcador de la clave activa.

### 2.6 Persistencia de partidas en solitario (`partidaGuardada.ts` + `ModalContinuarPartida.astro`)

- En `src/lib/partidaGuardada.ts`: añadir campo opcional a `DatosPartida`:
  ```ts
  solo?: {
    dificultad: Dificultad;
    asientoHumano: Player;
  };
  ```
  `VERSION_PARTIDA` sigue siendo `1` (100 % retrocompatible con partidas locales ya guardadas). `esEntradaValida` valida `solo` si está presente (`dificultad` válida y `asientoHumano` igual a `1` o `2`).
- En `gameSession.ts`: `escribirPartida()` incluye `solo: { dificultad, asientoHumano }` cuando `esSolo()` es `true`. Si la pestaña se descarta justo mientras el bot estaba pensando, restaurar el snapshot vuelve a disparar `mostrarTurno({ jugador: asientoBot })` y el robot retoma su turno limpiamente.
- En `ModalContinuarPartida.astro`: al pulsar **Continuar**, lee `leerPartida(slug)`:
  - Si `guardada?.solo` existe: llama `guardarModo('solo')`, `guardarDificultad(guardada.solo.dificultad)`, dispara `modo-elegido-solo` con `{ detail: { dificultad: guardada.solo.dificultad, asientoHumano: guardada.solo.asientoHumano, restaurando: true } }` y después `partida-restaurar`.
  - Si no existe `solo`: mantiene el flujo local actual sin cambios.

---

## Sección 3 — Diseño de los 6 bots, calibración y pruebas

### 3.1 Principios de calibración y rendimiento

- **Presupuesto de cómputo:** cada llamada a `elegirMovimiento` debe completarse en **< 30 ms** en una tableta Android económica (100 % síncrona).
- **Variedad controlada:** ante jugadas de puntuación empatada, se elige al azar con `rng` (partidas variadas en juego real, 100 % deterministas en tests).
- **Fácil (anti-frustración):** juega legal y comprensible, pero comete descuidos deliberados (incluso deja pasar victorias en 1 turno ~60–70 % de las veces cuando existen otras jugadas legales) para que un niño aprendiendo gane con frecuencia y coja confianza.
- **Medio (puente educativo):** aprovecha victorias en 1 turno y bloquea derrotas en 1 turno (enseñando al niño a vigilar amenazas directas), pero evita cálculo profundo o trampas dobles.
- **Difícil (reto real):** estrategia óptima o búsqueda alfa-beta sólida específica de cada juego.

### 3.2 Estrategia por juego

1. **Tres en raya (`src/games/tres-en-raya/bot.ts`):**
   - *Fácil:* legal al azar; si tiene 3 en raya inmediato y hay otras casillas libres, solo lo toma con probabilidad `0.3`.
   - *Medio:* toma victoria en 1; bloquea victoria rival en 1; en otro caso, elige centro/esquina con probabilidad `0.5` o una casilla libre al azar (sin calcular dobles amenazas / *forks*).
   - *Difícil:* minimax exacto (con bonificación por ganar en menos jugadas y desempate aleatorio). Imbatible, < 2 ms.

2. **Puntos y cajas (`src/games/puntos-y-cajas/bot.ts`):**
   - Clasifica cada línea libre según las cajas adyacentes actuales: **cierra caja** (alguna adyacente tiene 3 lados), **segura** (ninguna adyacente tiene 2 lados), o **sacrificio** (alguna adyacente tiene 2 lados, dejándola con 3 para el rival).
   - *Fácil:* si hay líneas que cierran caja, toma una con probabilidad `0.5`; si no, elige cualquier línea libre al azar.
   - *Medio:* siempre cierra cajas disponibles; si no hay, elige una línea **segura** al azar; si solo quedan sacrificios, elige un sacrificio al azar.
   - *Difícil:* siempre cierra cajas disponibles; prioriza líneas seguras (prefiriendo las que no preparan cadenas largas); cuando solo quedan sacrificios, simula cada uno y sacrifica el que **regala menos cajas en cadena** (y con ≤ 12 líneas libres usa alfa-beta con evaluación de diferencia de marcador para evaluar *double-cross*). < 10 ms.

3. **Obstrucción (`src/games/obstruccion/bot.ts`):**
   - *Fácil:* casilla legal al azar; si hay victoria inmediata y existen otras casillas legales, solo toma la victoria con probabilidad `0.4`.
   - *Medio:* toma victoria inmediata (deja 0 casillas legales al rival); si no hay, evita jugadas que permitan al rival ganar en 1 turno y elige al azar entre las seguras.
   - *Difícil:* búsqueda alfa-beta con ordenamiento por movilidad/centro (profundidad 6; búsqueda exacta hasta el final cuando quedan ≤ 14 casillas legales). < 15 ms.

4. **Nim (`src/games/nim/bot.ts`):**
   - *Fácil:* con 1 solo montón, toma todas con probabilidad `0.4` y si no deja 1–2 estrellas; con 2+ montones elige una fila no vacía y retira una cantidad legal al azar.
   - *Medio:* con 1 montón gana tomando todas; con 2 montones distintos los iguala (enseña la simetría básica); con 3+ montones usa jugada óptima XOR con probabilidad `0.45` y una retirada suave (1–2 estrellas) el resto.
   - *Difícil:* estrategia exacta XOR (`nimSum = montones.reduce((a, b) => a ^ b, 0)`). Si `nimSum !== 0`, elige al azar entre todas las filas `i` con `(montones[i] ^ nimSum) < montones[i]` dejando `montones[i] ^ nimSum`. Si `nimSum === 0` (posición perdedora teórica), quita 1 estrella de un montón no vacío al azar para alargar la partida. < 1 ms.

5. **Chomp (`src/games/chomp/bot.ts`):**
   - Cada tablero legal 4×7 queda unívocamente descrito por las longitudes de sus 4 filas `(r0, r1, r2, r3)` con `7 >= r0 >= r1 >= r2 >= r3 >= 0`, `r0 >= 1`: exactamente 329 estados alcanzables. Un solucionador recursivo con tabla memoizada en módulo resuelve todos los estados en < 1 ms la primera vez que se consulta.
   - *Fácil:* jugada legal al azar; si hay victoria en 1 (dejar solo el veneno `(1,0,0,0)`) y hay otras jugadas legales, solo la toma con probabilidad `0.35`.
   - *Medio:* toma victoria en 1; evita jugadas que dejen victoria en 1 al rival (es decir, evita dejar solo la fila 0 o solo la columna 0 si existen alternativas); entre las restantes usa jugada ganadora exacta con probabilidad `0.4` y azar el resto.
   - *Difícil:* solucionador exacto; elige al azar entre todas las jugadas ganadoras. En posición perdedora elige entre las jugadas que dejan más onzas vivas para prolongar la partida.

6. **Gomoku (`src/games/gomoku/bot.ts`):**
   - Poda por vecindad: solo considera casillas vacías a distancia Chebyshev ≤ 2 de alguna ficha en el tablero (en tablero vacío, el centro `(4,4)` y sus 8 vecinas).
   - Heurística de patrones en las 4 direcciones (horizontal, vertical, diagonal ↘, diagonal ↗) valorando 5 en línea, 4 abiertos, 4 cerrados por un extremo, 3 abiertos, 3 cerrados y 2 abiertos (propios y del rival).
   - *Fácil:* elige entre casillas cercanas con heurística muy ligera + ruido alto; solo toma 5 en línea directo con probabilidad `0.4` si hay más libres y rara vez bloquea rachas de 3.
   - *Medio:* toma victoria en 1; bloquea 4 en línea rival y 3 abiertos muy peligrosos; en el resto elige al azar entre las 3–4 mejores candidatas según evaluación a 1 ply.
   - *Difícil:* detecta victoria inmediata y bloqueo obligatorio de 4; en otro caso ejecuta alfa-beta a profundidad 3 sobre las 10 mejores candidatas ordenadas por heurística. < 25 ms.

### 3.3 Plan de pruebas y criterios de verificación

1. **Tests unitarios por bot (`src/games/<slug>/bot.test.ts`, 6 archivos):**
   - Legalidad garantizada (`esJugadaValida(mov)` y `playMove(state, mov) !== state`) en estados iniciales, intermedios y finales en las 3 dificultades.
   - Invariantes tácticas por juego: Tres en raya Difícil nunca pierde contra ninguna rama; Nim Difícil siempre deja XOR = 0 desde posición ganadora; Chomp Difícil gana siempre como J1 desde estado inicial; Puntos y cajas Medio/Difícil cierra cajas y evita regalar la 3.ª línea; Obstrucción Medio/Difícil toma victoria inmediata; Gomoku Medio/Difícil gana en 1 y bloquea 4 en línea.
   - Calibración estadística con PRNG determinista (semilla fija): verifica `tasaVictoria(dificil vs medio) > 0.65`, `tasaVictoria(medio vs facil) > 0.65` y que un jugador aleatorio le gana partidas a `facil`.
   - Rendimiento: verifica tiempos de decisión holgadamente por debajo del presupuesto.
2. **Tests unitarios de infraestructura:**
   - `src/lib/bot/controladorBot.test.ts` (con `vi.useFakeTimers()`): retraso normal y `prefers-reduced-motion`, cadenas repetidas, cancelación al deshacer/reiniciar/destruir, protección frente a error o jugada inválida del bot.
   - `src/lib/gameSession.test.ts`: flujo solitario completo, Deshacer en 1 toque (y deshabilitado antes de la 1.ª jugada si abre el robot), alternancia en revancha vs mantener en reiniciar, marcador independiente por identidad, cambio de dificultad sin reiniciar, confeti solo al ganar el niño, persistencia y restauración.
   - `src/lib/entrada.test.ts`, `src/lib/filtros.test.ts`, `src/lib/partidaGuardada.test.ts`, `src/lib/catalogo.test.ts`, `src/lib/turnIndicator.test.ts`: cobertura de los nuevos campos y estados.
   - `src/lib/sinColoresFijos.test.ts`: sigue pasando con los nuevos componentes (`ModalOpcionesSolo.astro`, ajustes de `ModalModoJuego.astro` y `AccionesCabecera.astro`).
3. **Pruebas E2E (Playwright a 600×960 y 960×600):**
   - `e2e/portada.spec.ts`: etiqueta `🤖 1 jugador` en los 6 juegos y filtro `🤖 Jugar solo` mostrando exactamente esos 6.
   - Nueva suite `e2e/solo.spec.ts`: arrancar en modo solitario en varios juegos del lote (incluyendo *Puntos y cajas* y *Tres en raya*), confirmar respuesta automática del robot, probar Deshacer, cambiar dificultad desde la cabecera sin perder la partida, terminar partida y verificar alternancia en Revancha, comprobando cero errores de consola y layout válido a **600×960** y **960×600**.

---

## Criterios de aceptación

- [ ] En portada, los 6 juegos muestran `🤖 1 jugador` y el filtro `🤖 Jugar solo` deja exactamente esos 6.
- [ ] En los 6 juegos, «¿Cómo van a jugar?» ofrece `🤖 Jugar solo` → 3 niveles (`Fácil`, `Medio`, `Difícil`) con botones ≥ 48/56 px.
- [ ] En los otros 21 juegos no aparece `🤖 Jugar solo`, y si el modo guardado era `'solo'`, se abre el selector Local / Por internet sin errores ni pérdida de preferencia.
- [ ] El robot responde tras una pausa natural (~500 ms) con `pensando…` en el indicador; en *Puntos y cajas* traza las cadenas línea por línea.
- [ ] **Deshacer** revierte en un toque la respuesta del robot y la última jugada del niño (incluso si se pulsa mientras el robot piensa).
- [ ] Cambiar dificultad desde la cabecera aplica al instante en el siguiente turno del robot sin reiniciar la partida.
- [ ] Al pulsar **Revancha** tras terminar una partida, alterna quién empieza sin cruzar los puntajes del marcador.
- [ ] Si gana el robot, no sale confeti y el mensaje es amable; si gana el niño, celebra normalmente.
- [ ] Cerrar y recargar a mitad de una partida solitaria ofrece «Continuar» y restaura modo, dificultad, asiento y tablero.
- [ ] `npm test`, `npm run check`, `npm run build` y `npm run test:e2e` pasan en verde, verificando 600×960 y 960×600.
