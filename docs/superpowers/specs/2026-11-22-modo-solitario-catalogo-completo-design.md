# Modo solitario contra el robot (catálogo completo) — Diseño

Fecha: 2026-11-22
Estado: borrador validado en brainstorming, pendiente de revisión del usuario y plan de implementación.
Base arquitectónica: `docs/superpowers/specs/2026-11-21-modo-solitario-bots-design.md`.

## Objetivo

Completar el modo solitario contra el robot en **3 niveles de dificultad calibrados** (`facil`, `medio`, `dificil`) para los **21 juegos restantes** del catálogo, alcanzando cobertura total (**27/27** juegos de 2 jugadores).

Cada bot mantiene los mismos principios de la entrega inicial:
- TypeScript puro y **100 % síncrono**, sin Web Workers ni dependencias externas.
- Presupuesto de cómputo **< 30 ms** por jugada en dispositivos modestos, con complejidad acotada de forma determinista por operaciones/nodos (sin depender de reloj/`Date.now()`).
- Desempate aleatorio controlado mediante `rng: Rng = Math.random` para variar partidas reales y garantizar pruebas reproducibles.
- **Garantía anti-trampa estricta** en los juegos con información oculta o turnos simultáneos (`battleship` y `wild-cats`): el bot solo consulta información pública o propia de su turno.

### Fuera de alcance

- Juegos de 1 jugador puros de tipo puzle (`abstract-games-by-category/02-solo/`).
- Dificultad adaptativa automática que cambie de nivel sin elección del niño.
- Pistas o sugerencias visuales sobre el tablero durante el turno del niño.
- Web Workers o dependencias externas.
- Desactivar el botón **Deshacer** en `battleship` o `gatos-salvajes`: por decisión explícita del usuario, se mantiene habilitado en los 27 juegos para preservar consistencia y experiencia amigable para niños.

---

## Sección 1 — Infraestructura compartida, ajustes de UI y catálogo (Ola 0)

La infraestructura del lote inicial (`src/lib/bot/controladorBot.ts`, `src/lib/bot/tipos.ts`, `src/components/ModalModoJuego.astro`, `src/components/ModalOpcionesSolo.astro`, `src/components/AccionesCabecera.astro` y `src/pages/juegos/[slug].astro`) se reutiliza sin cambios estructurales. Únicamente se requieren ajustes puntuales en `gameSession.ts` y en los 5 tableros con particularidades de modo/sesión, más la actualización de metadatos del catálogo.

### 1.1 Exposición explícita de modo en `src/lib/gameSession.ts`

Actualmente algunos `Board.astro` comprueban `sesion.miAsiento !== null` asumiendo que siempre significa partida remota. En modo solitario, `alModoSolo` asigna `miAsiento = asientoHumano` (`1` o `2`), lo cual bloquea controles que solo deberían deshabilitarse en remoto.

- Añadir dos getters de solo lectura a la interfaz `GameSession<TMovimiento>` y al objeto retornado por `iniciarSesionJuego`:
  - `readonly esRemoto: boolean` (respaldado por `esRemoto()`, es decir `canal !== null`).
  - `readonly esSolo: boolean` (respaldado por `esSolo()`, es decir `controladorBot !== null && controladorBot.estaActivo()`).
- El cambio es 100 % retrocompatible con los 27 tableros y permite distinguir sin ambigüedad entre partida remota y solitaria.

### 1.2 Selectores de tamaño en `src/games/hex/Board.astro` y `src/games/y/Board.astro`

- Cambiar la condición que deshabilita los botones `.btn-tamano` (y su guardia en el manejador `click`) de `sesion.miAsiento !== null` a `sesion.esRemoto`. De este modo, el niño puede elegir `5×5 / 7×7 / 9×9` en Hex y `7 / 9 / 11` en Juego Y en modo solitario siempre que el tablero esté vacío (`!hayJugadas`).
- En `onDeshacer`: si el snapshot restaurado posee un `state.size` distinto de `currentSize`, actualizar `currentSize = state.size` y llamar a `construirTablero()` antes de `render()`, asegurando que el SVG corresponda al tamaño restaurado.

### 1.3 Selección de mapa en `src/games/col/Board.astro`

- En modo solitario (`sesion.esSolo`), el niño **siempre elige el mapa** (tanto en la partida inicial como tras una revancha donde el robot pasa a empezar coloreando):
  - En `render()`, durante `state.fase === 'seleccion'`, calcular `meTocaElegir = sesion.esSolo || sesion.esMiTurno(state.currentPlayer)` para mostrar `#col-selector` al niño.
  - Al elegir mapa, `playMove` pasa a `fase: 'jugando'` conservando `currentPlayer`. Si en `onAplicarReinicio` se usa siempre `createInitialState(1)` cuando `sesion.esSolo` es `true`, entonces en `jugando` el turno `1` corresponde siempre al asiento 1: cuando el niño es asiento 1 abre él, y cuando tras una revancha el niño es asiento 2 (`miAsiento === 2`), `mostrarTurno({ jugador: 1 })` dispara al robot para colocar la primera región a los ~500 ms.
  - Evita que la alternancia propia `jugadorInicialSiguiente` de `col/Board.astro` colisione o cancele la alternancia `revanchaSolo()` de `gameSession.ts`.
- Defensivamente, `src/games/col/bot.ts` también soporta `state.fase === 'seleccion'` devolviendo `{ tipo: 'mapa', mapaId }` elegido con `rng`.

### 1.4 Revelación de ronda en `src/games/wild-cats/Board.astro`

- En Gatos Salvajes, cuando el niño juega como asiento 2 (en revancha) y confirma su jugada, `jugar` fija `verRevelacion = true`. A los 500 ms el robot confirma su elección secreta como J1 para la siguiente ronda; actualmente `if (prev.currentPlayer === 1)` borra `verRevelacion = false`, ocultando la revelación anterior antes de que el niño pueda leerla.
- Ajuste en `jugar`: al resolver `prev.currentPlayer === 1`, limpiar `verRevelacion = false` **solo cuando** `emitirRemoto || sesion.miAsiento === null` (es decir, en local pasar-y-jugar o cuando el humano confirma como J1). Cuando el robot (o un rival remoto) envía su elección secreta J1, `verRevelacion` permanece visible hasta que el niño toque una casilla para elegir en la nueva ronda (`verRevelacion = false` en el `click` de casilla).

### 1.5 Interstitial en `src/games/battleship/Board.astro`

- Mantener **Deshacer** habilitado en solitario (igual que en local y en el resto de juegos).
- En `render()`, cambiar el texto del interstitial de colocación de `` `Jugador ${state.currentPlayer} (${FICHAS[state.currentPlayer]}): coloca tu flota` `` a `` `${sesion.nombres[state.currentPlayer]} (${FICHAS[state.currentPlayer]}): coloca tu flota` `` para que muestre el nombre del niño o personalizado.
- El flujo de colocación (`'flota'`) y disparos (`'disparo'`) ya notifica `mostrarTurno` en cada cambio de jugador, y `handoffPendiente` ya se omite automáticamente cuando `sesion.miAsiento !== null`.

### 1.6 Catálogo (`src/content/juegos/*.md`)

- Actualizar `minJugadores: 2` → `minJugadores: 1` en los **21 archivos `.md`** correspondientes en `src/content/juegos/`.
- Mantener el filtro `🤖 Jugar solo` en `src/pages/index.astro` (ahora filtra los 27/27 juegos y queda preparado por si en el futuro se agregan juegos exclusivos de 2 jugadores).

---

## Sección 2 — Diseño algorítmico de los 21 bots (3 oleadas × 3 dificultades)

### 2.1 Contrato compartido y calibración general

Cada uno de los 21 juegos añade `src/games/<dir>/bot.ts` exportando:

```ts
export function elegirMovimiento(
  state: <EstadoDelJuego>,
  dificultad: Dificultad,
  rng: Rng = Math.random
): <MovimientoDelJuego>;
```

Y en `src/games/<dir>/Board.astro` se importa `elegirMovimiento` y se pasa en `iniciarSesionJuego`:

```ts
elegirMovimientoBot: dificultad => elegirMovimiento(state, dificultad),
```

Principios de calibración por nivel:
- **🌱 Fácil (`facil`):** jugadas legales y comprensibles, con omisión deliberada de victorias/capturas/bloqueos inmediatos (~55–65 % de las veces cuando existen alternativas legales) para permitir aprender sin frustración.
- **🎯 Medio (`medio`):** aprovecha victorias/capturas inmediatas en 1 turno y bloquea amenazas directas en 1 turno; emplea evaluación táctica a 1 ply (o aleatoria controlada entre top 3–4 candidatas) sin cálculo profundo.
- **🔥 Difícil (`dificil`):** solución matemática exacta cuando el juego lo permite o búsqueda alfa-beta/negamax sobre representaciones compactas (`number` bitmask / `Uint8Array` / tablas precalculadas), o modelo probabilístico/Nash en información oculta.

---

### 2.2 Ola 1 — 7 juegos con solución exacta o teoría de juegos combinatorios

| Directorio (`slug`) | Estado / Movimiento / Motor / Validador | 🌱 Fácil | 🎯 Medio | 🔥 Difícil |
|---|---|---|---|---|
| `sim` (`sim`) | `SimState`, `Edge` (`{ u, v }`), `playMove`, `esEdgeValido` | Arista libre al azar; si hay aristas que no forman triángulo propio, evita las suicidas con probabilidad `0.75`. | Nunca forma triángulo propio si existe arista segura; a 1–2 plies evita regalar al rival una posición donde quede obligado a cerrar triángulo. | Negamax exacto con bitmask de 15 bits por jugador (`u16`) + tabla de transposición (profundidad 8 al inicio, búsqueda exacta hasta el final con ≤ 11 aristas libres; < 5 ms). |
| `notakto` (`notakto`) | `NotaktoState`, `Move` (`{ board, cell }`), `playMove`, `esJugadaValida` | Casilla libre al azar en tablero vivo; si hay jugadas que no matan el último tablero vivo, las prefiere con probabilidad `0.65`. | Nunca mata el último tablero vivo si hay otra jugada; prefiere jugadas que mantienen tableros vivos en configuración favorable a 2 plies. | **Programación dinámica exacta** por estado canónico $D_4$ de cada tablero 3×3 y tríos de tableros canónicos (~12 300 estados, tabla lazy en módulo < 5 ms). 100 % óptimo en misère. |
| `col` (`col`) | `ColState`, `ColMove`, `playMove`, `esJugadaValida` | En `jugando`, región legal al azar (omite victoria en 1 con prob. `0.6` si hay más). En `seleccion`, mapa al azar. | Victoria inmediata en 1; evita dejar 0 jugadas propias o victoria rival en 1; desempata por mayor movilidad propia. | **Solver exacto** con bitmasks de 13 regiones sobre `MAPAS` + memoización (< 3 ms en cualquiera de los 3 mapas). En `seleccion`, elige mapa con `rng`. |
| `cram` (`cram`) | `CramState`, `Move` (`{ a, b }`), `playMove`, `esJugadaValida` | Dominó legal al azar; omite victoria inmediata con prob. `0.6` si hay otras jugadas. | Victoria en 1; evita jugadas que permitan victoria rival en 1; maximiza movilidad restante en 1 ply. | Como J2 usa **simetría rotacional de 180°** mientras sea legal; al romperse o como J1 usa **Sprague-Grundy (XOR)** exacto por componentes conexas (≤ 14 casillas) + alfa-beta en bitmask al inicio (< 10 ms). |
| `domineering` (`domineering`) | `DomineeringState`, `Move` (`{ a, b }`), `playMove`, `esJugadaValida` | Dominó legal de su orientación al azar; omite victoria inmediata con prob. `0.6` si hay alternativas. | Toma victoria en 1; evita jugadas que dejen victoria rival en 1; maximiza diferencia de dominós legales propios menos rivales. | Alfa-beta con dos bitmasks de 32 bits (`lo`, `hi`) para el tablero 8×8 (profundidad 4–5 al inicio y solución exacta con ≤ 12 jugadas legales), valorando espacios seguros exclusivos y movilidad (< 15 ms). |
| `snort` (`snort`) | `SnortState`, `number` (`0..35`), `playMove`, `esJugadaValida` | Casilla legal al azar; omite victoria inmediata con prob. `0.6` si hay alternativas. | Toma victoria en 1; evita dejar victoria rival en 1; evalúa a 1 ply diferencia de casillas exclusivas (vecinas propias seguras) y movilidad. | Alfa-beta con bitmasks de 36 bits (en `lo`/`hi` o `Uint8Array`) a profundidad 5–6 y búsqueda exacta con ≤ 12 casillas legales, valorando casillas exclusivas + paridad de componentes (< 15 ms). |
| `bridg-it` (`bridg-it`) | `BridgItState`, `Edge`, `playMove`, `esJugadaValida` | Arista legal al azar (`puedeJugar`); omite victoria inmediata con prob. `0.6` si hay alternativas. | Victoria en 1; bloqueo en 1 si el rival gana en la siguiente; en otro caso acorta camino propio mediante distancia **0-1 BFS**. | Como J1 aplica la **estrategia ganadora exacta de emparejamiento** sobre los dos árboles generadores disjuntos de la retícula 5×6; como J2 (o si se desvió de árbol) ejecuta alfa-beta (prof. 3–4) evaluando diferencia de distancias 0-1 BFS (< 15 ms). |

---

### 2.3 Ola 2 — 8 juegos tácticos de cuadrícula, grafos y puntuación

| Directorio (`slug`) | Estado / Movimiento / Motor / Validador | 🌱 Fácil | 🎯 Medio | 🔥 Difícil |
|---|---|---|---|---|
| `agujero-negro` (`agujero-negro`) | `AgujeroNegroState`, `number` (`0..20`), `placeNumber`, `esJugadaValida` | Posición vacía al azar. | Evaluación 1 ply: protege sus propios números altos alejándolos de huecos candidatos finales y coloca números bajos (1–4) adyacentes a fichas altas del rival. | Alfa-beta (profundidad 4 al inicio, exacto con ≤ 8 casillas vacías) evaluando diferencia de puntos no rodeados por celdas vacías candidatas a agujero negro (< 15 ms). |
| `snakes` (`snakes`) | `SnakesState`, `number` (`0..48`), `playMove`, `esJugadaValida` | Vecina libre al azar; solo encierra al rival en 1 con prob. `0.35` si hay otras salidas. | Encierra al rival en 1 si puede; descarta salidas sin continuación y elige entre las que maximizan su área alcanzable por BFS. | Alfa-beta profundo (ramificación ≤ 3 → profundidad 10–12 y exacto en componentes separadas) evaluando **territorio Voronoi**, accesibilidad y paridad de tablero (< 10 ms). |
| `estampida` (`estampida`) | `EstampidaState`, `Move`, `playMove`, `esJugadaValida` | En `setup`: casilla vacía al azar. En `playing`: dirección legal al azar. | En `setup`: coloca con buena separación de bordes y fichas previas. En `playing`: elige dirección a 1–2 plies maximizando ganancia de fichas (evitando perder turno). | En `setup`: maximiza alcance Voronoi interior de las 5 fichas. En `playing`: alfa-beta profundo (ramificación ≤ 4 → profundidad 8–10, exacto con pocas vacías) contemplando saltos de turno (`cerrarTurno`) (< 15 ms). |
| `sos` (`sos`) | `SOSState`, `Move` (`{ row, col, letter }`), `playMove`, `esJugadaValida` | Completa `SOS` inmediato con prob. `0.45`; si no, `(celda, letra)` al azar. | Siempre completa `SOS` (siguiendo cadenas); si no hay, juega `(celda, letra)` segura (no regala `S_S` ni `SO_` en ningún eje); si solo hay sacrificios, elige el de menor regalo inmediato. | Toma cadenas completas de `SOS`; si no hay cierres, prefiere jugadas seguras que bloqueen amenazas; cuando solo quedan sacrificios simula la cadena mínima y usa alfa-beta con ≤ 10 casillas vacías (< 15 ms). |
| `order-and-chaos` (`orden-y-caos`) | `OrdenCaosState`, `Move` (`{ cell, marca }`), `playMove`, `esJugadaValida` | `(celda, marca)` al azar; Orden omite 5 en línea con prob. `0.65` si hay alternativas y Caos falla bloqueos con frecuencia. | Orden completa 5 en 1 o extiende líneas de 3–4 vivas; Caos bloquea 4 en 1 y neutraliza ventanas de 3. Evaluado a 1 ply. | Alfa-beta asimétrico (profundidad 3–4 sobre top 8 candidatas) evaluando las **28 ventanas de longitud 5**: para Orden suma amenazas activas/dobles; para Caos prioriza ventanas mixtas (muertas) (< 20 ms). |
| `metasquares` (`metasquares`) | `MetaSquaresState`, `Move` (`{ celda }`), `playMove`, `esJugadaValida` | Casilla vacía al azar; completa cuadrado inmediato con prob. `0.4` si hay más libres. | Completa cuadrado propio (alcanzando 5 o sumando puntos) y bloquea amenazas rivales de 3 esquinas; resto entre top 3–4 a 1 ply. | Tabla inversa casilla → cuadrados (de los 196 de `TODOS_LOS_CUADRADOS`). Alfa-beta (profundidad 3 sobre top 8–10 candidatas) contando cuadrados 3/4 y 2/4 propios vs rivales (< 15 ms). |
| `triggle` (`triggle`) | `TriggleState`, `Move` (`{ q, r, dir }`), `playMove`, `esMove` | Línea válida al azar (`movimientosValidos`); a veces ignora cerrar triángulo si hay otras opciones. | Elige la línea que más triángulos cierra en este turno; a igualdad evita regalar aristas que dejen triángulos con 2 lados al rival. | Alfa-beta (profundidad 3–4 sobre top candidatas, exacto en el tramo final) con máscaras de aristas sobre las 48 líneas y 54 triángulos (< 20 ms). |
| `walking-dots` (`puntos-caminantes`) | `WalkingDotsState`, `Move` (`number \| 'pasar'`), `playMove`, `esJugadaValida` | Casilla legal al azar (`casillasLegales`); pasa solo si no quedan jugadas legales. | Pasa para ganar si `pasesSeguidos === 1` y va ganando según `puntajes(board)`; si no, evita rellenar cavidades ya cercadas propias y expande frontera hacia el centro/rival. | Alfa-beta (profundidad 4–5 sobre top candidatas) con poda de auto-relleno en territorio cerrado propio, evaluación de **territorio Voronoi en frontera** y decisión exacta de `'pasar'` (< 20 ms). |

---

### 2.4 Ola 3 — 6 juegos de conexión topológica, geometría planar e información oculta/simultánea

| Directorio (`slug`) | Estado / Movimiento / Motor / Validador | 🌱 Fácil | 🎯 Medio | 🔥 Difícil |
|---|---|---|---|---|
| `hex` (`hex`) | `HexState` (`size`: 5, 7 o 9), `number`, `playMove`, `esJugadaValida` | Casilla vacía al azar; toma victoria en 1 con prob. `0.35` si hay más libres. | Toma victoria en 1, bloquea derrota en 1, y elige entre top 3–4 candidatas por distancia **0-1 BFS** al borde + cercanía al centro. | Defensa inmediata de **puentes virtuales** atacados + métrica **two-distance** (segundo camino más corto, resistente a bloqueos simples) + alfa-beta (profundidad 2–3 sobre top 8–10 candidatas) adaptado a `state.size` (< 25 ms). |
| `y` (`juego-y`) | `YState` (`size`: 7, 9 o 11), `number`, `playMove`, `esJugadaValida` | Casilla vacía al azar; toma victoria en 1 con prob. `0.35` si hay más libres. | Victoria/bloqueo en 1 + top 3–4 candidatas por suma mínima de distancias 0-1 BFS a los 3 lados del triángulo. | Defensa de puentes + cota **Steiner a los 3 lados** basada en *two-distance* + alfa-beta (profundidad 2–3 sobre top 8–10 candidatas) adaptado a `state.size` (< 25 ms). |
| `kropki` (`kropki`) | `KropkiState`, `number` (`0..63`), `playMove`, `esJugadaValida` | Casilla legal al azar (prefiriendo cercanía con ruido alto); toma captura en 1 con prob. `0.45`. | Captura inmediata y escape/bloqueo si el rival puede capturar en 1 turno; resto entre top 3–4 por captura/cercanía. | Poda por vecindad + alfa-beta (profundidad 3 sobre top 8–10 candidatas) sobre `Uint8Array(64)` con flood-fill ligero, evaluando capturas, territorio ganado y puntos propios amenazados (< 25 ms). |
| `conquista` (`conquista`) | `ConquistaState`, `Fence`, `jugarFence`, `esFence` | Valla legal al azar (`ALL_CANDIDATES` filtradas con `esFenceLegal`); cierra cara inmediata con prob. `0.45`. | Cierra la cara de mayor área disponible; si no hay cierres, elige valla que no cierre ni regale un ciclo de cierre inmediato al rival. | **Union-Find** de vértices para detectar en < 0,2 ms qué vallas de `ALL_CANDIDATES` cierran ciclos (o dejan ciclos a 1 arista de cerrarse) → toma cadenas óptimas, prioriza vallas seguras y sacrifica la cara de menor área cuando no quedan seguras (< 25 ms). |
| `battleship` (`battleship`) | `BattleshipState`, `Move` (`flota` o `disparo`), `playMove`, `esJugadaValida` | `flota`: aleatoria con `rng`. `disparo`: celda sin disparar al azar (sigue casillas adyacentes a `'tocado'` solo ~40 %). | `flota`: colocación aleatoria rechazando barcos pegados entre sí cuando sea posible. `disparo`: **Hunt & Target** con paridad de tablero (tablero de ajedrez) al cazar y seguimiento de eje al impactar (`'tocado'`). | `flota`: colocación anti-patrón (evita concentración en bordes/esquinas y adyacencias). `disparo`: **mapa de densidad probabilística bayesiano** calculando cuántas posiciones válidas de los barcos aún a flote cubren cada celda sin disparar sobre `state.disparos[yo]` (< 2 ms). |
| `wild-cats` (`gatos-salvajes`) | `WildCatsState`, `Move` (`{ celda }`), `playMove`, `esJugadaValida` | Casilla elegible (`celdasElegibles`) al azar; busca completar línea de 4 con prob. `0.35`. | Evalúa casillas elegibles (potencial de líneas propias + amenaza de 3-en-línea rival para provocar choque) y elige al azar entre top 3–4 candidatas. | Construye matriz de pagos $M(a, b)$ sobre las top 8–10 candidatas (incluyendo resultado si $a = b$ provoca `choque` y veto) y calcula estrategia mixta mediante **regret matching (~70 iteraciones)** muestreando con `rng` (< 10 ms). |

### 2.5 Reglas estrictas anti-trampa (información oculta y simultánea)

- **`src/games/battleship/bot.ts`:** tiene prohibido leer `state.flotas` (tanto la propia como la del rival). Para deducir qué barcos faltan por hundir usa exclusivamente `state.disparos[state.currentPlayer]` y `FLOTA`: si el número de celdas `'hundido'` ya equivale a la suma de barcos hundidos o se identifican componentes conexas de `'hundido'` de longitud $L$, puede restar los barcos de longitud $L$ correspondientes (o usar el conjunto mínimo/compatible sobre `state.disparos[yo]`).
- **`src/games/wild-cats/bot.ts`:** tiene prohibido leer `state.eleccionJ1` y `state.ultimaRevelacion` para inferir la jugada pendiente. Su decisión como J2 depende únicamente de `state.tablero`, `state.vetada`, `state.ronda` y `state.fase`.

---

## Sección 3 — Pruebas, calibración y orquestación agéntica en *worktree*

### 3.1 Pruebas unitarias por bot (`src/games/<dir>/bot.test.ts`, 21 archivos)

Cada archivo de pruebas verifica:
1. **Legalidad y progreso garantizado:** `validarMovimiento(mov)` es `true` y `enginePlay(state, mov) !== state` en estados iniciales, intermedios y cercanos al final, cubriendo todos los tamaños/mapas (`hex`: 5, 7, 9; `y`: 7, 9, 11; `col`: mapas 0, 1, 2).
2. **Invariantes tácticas y matemáticas:**
   - `sim` Difícil evita perder cuando existen aristas seguras; `notakto` Difícil gana desde posiciones ganadoras conocidas; `col` Difícil gana desde posiciones ganadoras en los 3 mapas; `cram` Difícil responde por simetría como J2; `domineering`, `snort` y `bridg-it` Medio/Difícil toman victoria en 1 y bloquean en 1.
   - `agujero-negro` Difícil preserva números altos frente a `facil`; `snakes` y `estampida` Medio/Difícil toman encierro/mayor ganancia; `sos` y `conquista` Medio/Difícil toman cierres y evitan regalos triviales; `order-and-chaos` Orden completa 5 y Caos bloquea 4; `metasquares` y `triggle` completan figuras en 1; `walking-dots` pasa para ganar cuando `pasesSeguidos === 1` y va adelante.
   - `hex` y `y` Medio/Difícil ganan y bloquean en 1 en todos los tamaños; `kropki` Medio/Difícil capturan en 1.
3. **Pruebas anti-trampa obligatorias (`battleship` y `wild-cats`):**
   - En `battleship/bot.test.ts`: dada una partida en `disparos` y una semilla `rng` fija, cambiar `state.flotas[rival]` a una flota completamente distinta produce **exactamente el mismo** disparo en las 3 dificultades.
   - En `wild-cats/bot.test.ts`: con `currentPlayer === 2` y una semilla `rng` fija, cambiar `state.eleccionJ1` entre distintas casillas produce **exactamente la misma** jugada en las 3 dificultades.
4. **Calibración estadística con PRNG determinista:**
   - Alternando asientos (J1 y J2 en partidas espejo para juegos asimétricos): `tasaVictoria(dificil vs medio) > 0.65` y `tasaVictoria(medio vs facil) > 0.65`.
   - Un jugador aleatorio gana partidas frente a `facil`.
   - En `battleship`, además de la tasa de victoria en partidas completas, el promedio de disparos necesarios para hundir una flota cumple `dificil < medio < facil`.
5. **Rendimiento:** cada jugada en las 3 dificultades apunta a **< 15 ms** típicos para mantener margen holgado por debajo del tope de **< 30 ms** en Vitest, incluso bajo ejecución paralela.

### 3.2 Pruebas de infraestructura y E2E

- **`src/lib/gameSession.test.ts`:** verificar `sesion.esRemoto` y `sesion.esSolo` en modo local, solitario y remoto, así como la habilitación de tamaño en `hex`/`y` y el comportamiento de `col` y `wild-cats`.
- **`e2e/portada.spec.ts`:** actualizar los dos tests del lote solitario para comprobar que **todos** los juegos del catálogo (`slugsDelCatalogo().length`, 27) muestran `🤖 1 jugador` y que el filtro `🤖 Jugar solo` deja exactamente esos 27.
- **`e2e/solo.spec.ts`:**
  - Retirar el test antiguo que asumía que `hex` no tenía bot (`soportaSolo === false` ya queda cubierto por pruebas unitarias de `entrada.test.ts` y `ModalModoJuego`).
  - Añadir pruebas E2E cubriendo las nuevas mecánicas:
    - `col`: selección de mapa en solitario, respuesta del bot, y revancha donde el niño vuelve a elegir mapa y el robot abre coloreando.
    - `hex`: cambio de tamaño (p. ej. 5×5) en modo solitario antes de la primera jugada y respuesta del robot.
    - `battleship`: colocación automática/confirmación de flota, disparo del niño y respuesta del robot sin overlay de *handoff*.
    - `gatos-salvajes`: elección simultánea, revelación de ronda, y verificación tras revancha como J2 de que la revelación no desaparece a los 500 ms cuando el bot elige como J1.
    - `sos` o `puntos-caminantes`: juego completo/turno repetido o pase sin errores de consola, más verificación de layout sin desborde y zonas tocables ≥ 48 px a **600×960** y **960×600**.

### 3.3 Orquestación agéntica en *git worktree*

El desarrollo se ejecuta íntegramente dentro del *worktree* `.worktrees/solo-catalogo-completo` (rama `feat/solo-catalogo-completo`):

1. **Ola 0 (base compartida, secuencial):**
   - `esRemoto` / `esSolo` en `gameSession.ts` + `gameSession.test.ts`, más los ajustes de `col/Board.astro`, `hex/Board.astro`, `y/Board.astro`, `wild-cats/Board.astro` y `battleship/Board.astro`.
   - Verificación `npm test && npm run check` y commit.
2. **Olas 1 (7 juegos), 2 (8 juegos) y 3 (6 juegos) en paralelo:**
   - 1 subagente independiente por juego dentro de cada oleada, con propiedad exclusiva de sus **4 archivos**:
     - `src/games/<dir>/bot.ts`
     - `src/games/<dir>/bot.test.ts`
     - `src/games/<dir>/Board.astro`
     - `src/content/juegos/<slug>.md`
   - Cero solapamiento de archivos entre subagentes de la misma oleada.
   - Cada subagente sigue TDD y ejecuta `npx vitest run src/games/<dir>/` antes de reportar.
   - **Puerta automática tras cada oleada:** `npm test && npm run check` + revisión de calidad/calibración/anti-trampa/rendimiento sobre el diff de la oleada → commit limpio por oleada.
3. **Ola 4 (E2E y verificación final):**
   - Actualizar `e2e/portada.spec.ts` y `e2e/solo.spec.ts`.
   - Ejecutar `npm test && npm run check && npm run build && npm run test:e2e`.
   - Commit final en la rama `feat/solo-catalogo-completo`, listo para revisión e integración en `main`.

---

## Criterios de aceptación

- [ ] Los **27/27** juegos del catálogo tienen `minJugadores: 1`, muestran `🤖 1 jugador` en portada y aparecen al activar el filtro `🤖 Jugar solo`.
- [ ] Todos los 21 bots nuevos exportan `elegirMovimiento(state, dificultad, rng)` en TypeScript puro y síncrono, se conectan en su `Board.astro` y ejecutan cada jugada en **< 30 ms**.
- [ ] En los 21 juegos se cumple calibración determinista (`dificil > medio > facil`, y un jugador aleatorio gana partidas a `facil`), además de las invariantes tácticas/matemáticas de cada juego.
- [ ] `battleship/bot.ts` no consulta `state.flotas` y `wild-cats/bot.ts` no consulta `state.eleccionJ1`, verificado con pruebas unitarias de invarianza.
- [ ] `hex` y `y` permiten cambiar el tamaño del tablero en modo solitario antes de la primera jugada y restauran el tamaño correcto al deshacer.
- [ ] `col` permite al niño elegir el mapa en modo solitario tanto en la primera partida como en revanchas alternadas, y el robot abre coloreando cuando le toca el asiento 1.
- [ ] `wild-cats` mantiene visible la revelación de la ronda anterior cuando el niño juega como J2 tras una revancha y el robot realiza su elección secreta J1.
- [ ] `battleship` conserva Deshacer habilitado y muestra los nombres reales en el interstitial sin *handoff* entre humano y robot.
- [ ] `npm test`, `npm run check`, `npm run build` y `npm run test:e2e` pasan al 100 % dentro del *worktree*, verificando **600×960** y **960×600** con cero errores de consola.
