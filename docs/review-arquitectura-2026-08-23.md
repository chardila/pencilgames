# Informe de revisión de arquitectura y diseño — Pencilgames

**Fecha**: 2026-08-23
**Alcance**: revisión de arquitectura y diseño del repositorio. No se modificó código.

---

## 1. Resumen ejecutivo

Pencilgames es un proyecto **bien diseñado y coherente con sus propios specs**. La separación de responsabilidades (motor puro → UI → contenido → transporte) es excelente, la documentación de decisiones es ejemplar y el nivel de testing de la lógica pura es sólido (~2.000 líneas de tests). La deuda principal es **duplicación de UI**, **rigor de CI ausente** y dos puntos de **robustez/seguridad operativa** que conviene atender antes de escalar a más juegos.

Severidades: 🔴 Alta · 🟠 Media · 🟡 Baja

---

## 2. Visión general de la arquitectura

```
src/content/juegos/*.md        metadata + instrucciones (content collection)
src/games/<slug>/engine.ts     motor puro, sin DOM, determinista e idempotente
src/games/<slug>/engine.test.ts tests Vitest
src/games/<slug>/Board.astro   tablero (markup + estilos + script vanilla)
src/lib/                       helpers compartidos (players, turnIndicator, winnerBanner, miNombre, remoto/*)
src/components/                modales autocontenidos (instrucciones, modo, jugadores, remoto)
src/pages/                     index.astro + [slug].astro (orquestación vía CustomEvents)
worker/                        Worker de señalización (Durable Object, proyecto npm independiente)
```

Fortalezas clave:

- **Motores puros e idempotentes**: una jugada ilegal devuelve el estado sin cambios. Esto es lo que hace segura la sincronización remota sin numerar mensajes ni reconciliar estado (`esFenceLegal`/`jugarFence` en conquista son el ejemplo extremo de rigor).
- **Patrón de extensibilidad real**: agregar un juego = 1 `.md` + 1 carpeta `engine.ts`/`Board.astro` + 1 línea en el mapa `BOARDS`. Se cumple en los 4 juegos.
- **Documentación de diseño excepcional** (`docs/superpowers/specs/` y `plans/`): registra decisiones, asunciones explícitas y hasta bugs encontrados por el test de propiedad que corrigieron el diseño original. Es un activo real.
- **Escaping XSS correcto**: `turnIndicator.ts`/`winnerBanner.ts` construyen el esqueleto y asignan los valores dinámicos vía `textContent` (fix documentado en el spec de nombres).
- **Worker minimalista**: solo señalización + STUN/relay de respaldo; el protocolo de juego viaja por el canal P2P sin que el worker entienda el juego.
- **Mitigación de seguridad en el worker**: validación de formato del código **antes** de tocar el Durable Object, y chequeo de `Origin`.

---

## 3. Hallazgos y recomendaciones

### 🔴 A2 — `mensaje.payload` se castea sin validar en los 4 `Board.astro`

`tres-en-raya`: `jugar(mensaje.payload as number)` · `puntos-y-cajas`: `as LineId` · `agujero-negro`: `as number` · `conquista`: `as Fence`.

La idempotencia del motor protege contra desincronización de **estado**, pero no contra excepciones de **tipo**: en conquista `jugarFence` llama a `fenceKey(fence.a, fence.b)`, y si `payload` no es `{a,b}` válidos se lanza un `TypeError` dentro del callback de recepción, rompiendo el render del receptor. El propio spec lo anota como "fuera de alcance: endurecer el cast".

**Recomendación**: validar/coercionar la forma del `payload` antes de invocar al motor (guardas de tipo mínimas en cada `Board.astro`, o un helper `parsePayload` por juego). Con 4 juegos, conviene centralizarlo antes de que llegue un 5º.

### 🔴 A3 — CI no ejecuta tests ni typecheck

`.github/workflows/deploy.yml` hace `npm ci` + `npm run build` + deploy, pero **no corre `npm test`**, ni `worker/test`, ni `astro check`. `@astrojs/check` está instalado pero no hay script que lo use. Una regresión en un `engine.ts` llega a producción sin ser detectada.

**Recomendación**: añadir un job (o pasos) `npm test` + `cd worker && npm test` + `npx astro check` antes del deploy. Son baratos y cubren justo la lógica más delicada del proyecto.

---

### 🟠 M1 — Duplicación del "chrome" y del wiring remoto en los 4 `Board.astro`

Cada board repite ~50–60 líneas: `indicador-turno`/`banner-ganador`, el listener `canal-remoto-listo`, `alRecibir` (movimiento/nombre/reiniciar), `alCambiarEstado` (desconexión), y `reiniciar`. Está explícitamente anotado como backlog (`<TableroJuego>`) y el spec de Conquista lo declaró prerequisito... que no se llegó a hacer; hoy son **4 copias** y no 3.

**Recomendación**: priorizar la extracción de un componente compartido (o al menos un módulo `src/lib/remoteBoard.ts` que encapsule `conectarCanal(channel, { jugar, nombres, render })`) antes del próximo juego. El costo de mantener 4 copias ya supera el de extraer.

### 🟠 M2 — Sin linter, formatter ni script de typecheck

No hay ESLint/Prettier, y el único script de calidad es `vitest`. El estilo es consistente a mano, pero no está automatizado.

**Recomendación**: añadir `astro check` como script (`"check": "astro check"`) y un ESLint mínimo (o al menos `prettier --check`) integrado a CI.

### 🟠 M3 — Orquestación por CustomEvents "stringly-typed"

`[slug].astro` y los modales se coordinan con nombres de eventos dispersos en strings (`instrucciones-cerradas`, `modo-elegido-local`, `abrir-modal-remoto`, `canal-remoto-listo`, `modal-remoto-cancelado`). Funciona, pero el contrato es implícito: un typo o un cambio de orden de carga de scripts produce fallas silenciosas difíciles de rastrear, y no hay tests de integración.

**Recomendación**: extraer los nombres de evento (y los tipos de `detail`) a un módulo compartido `src/lib/eventos.ts`, y documentar el contrato en el README o un spec. Considerar un tiny event-bus tipado.

### 🟠 M4 — Código de sala con `Math.random()` (30 bits, predecible)

`worker/src/roomCode.ts:13` usa `Math.random()`. El código es de 6 caracteres sobre un alfabeto de 32 (~30 bits de entropía): un adversario podría predecir/forzar un código para unirse a una sala ajena. El riesgo es bajo para uso familiar, pero es trivial de corregir.

**Recomendación**: usar `crypto.getRandomValues` (disponible en el runtime de Workers) para generar el código.

---

### 🟡 B1 — `ALL_CANDIDATES.find()` en el render de Conquista

`conquista/Board.astro:262` hace `.find(c => c.key === key)` por cada fence en cada render, aunque el motor ya exporta `CANDIDATES_BY_KEY` (un `Map`). Escala O(n·m) innecesario.

**Recomendación**: usar `CANDIDATES_BY_KEY.get(key)`.

### 🟡 B2 — Duplicación/arrastre menor en el lado servidor

- `agujero-negro/Board.astro` reimplementa `idsDeFila` duplicando la lógica de `rowStart` del engine.
- `conquista/Board.astro:2` hace `import { GRID_SIZE } from './engine'` en el frontmatter, lo que arrastra el módulo completo (incluida la precomputación de `ALL_CANDIDATES`, ~270² intersecciones) al bundle de build/SSR solo por una constante.

**Recomendación**: exportar un helper desde el engine, y mover `GRID_SIZE` (y demás constantes de UI) a un módulo ligero o inline.

### 🟡 B3 — Accesibilidad de los modales

Los modales usan `role="dialog"`/`aria-modal` pero no tienen **focus trap**, ni cierre con `Escape`, ni gestión de foco (no enfocan al abrir ni devuelven foco al cerrar). Es coherente con el público objetivo (tableta táctil), pero `Escape` y foco inicial son mejoras de bajo costo. Conquista es el único tablero con soporte de teclado (`tabindex`+`keydown`); tres en raya/puntos/agujero usan `<button>` nativo (correcto).

**Recomendación**: añadir foco inicial al abrir, devolver foco al cerrar y cerrar con `Escape` en un helper compartido de modal.

### 🟡 B4 — Service worker: versionado frágil y cache por URL con query

- El versionado se hace con un `string.replace('__CACHE_VERSION__')` en `astro.config.mjs` (frágil, depende de que `sw.js` contenga exactamente ese token).
- El cache se indexa por URL completa, incluida la query (`?sala=CODIGO`), generando entradas separadas para cada link de sala.

**Recomendación**: cachear ignorando query para páginas, y/o usar un hash de build real en vez del replace; documentar la estrategia de cache (qué assets son inmutables).

### 🟡 B5 — `minJugadores`/`maxJugadores` validados pero sin uso

El schema de `content.config.ts` los valida, pero ningún componente los lee (todos los juegos son de 2). Metadata muerta.

**Recomendación**: o bien mostrarlos en `GameCard` (badge "2 jugadores"), o eliminarlos del schema para no mantener campos sin efecto.

### 🟡 B6 — Dos proyectos npm con versiones divergentes

Raíz (`vitest@3`) y `worker/` (`vitest@4`, `@cloudflare/vitest-pool-workers`, `wrangler@4`). Justificado por runners distintos, pero la divergencia de majors de Vitest y de `typescript` aumenta la fricción de mantenimiento y el riesgo de configs desincronizadas.

**Recomendación**: documentar por qué difieren (ya hay comentarios en `vitest.config.ts`) y, si es posible, alinear versiones en una renovación de dependencias.

### 🟡 B7 — Higiene del repositorio

`git status` muestra un directorio `abstract-games-by-category/` sin trackear y un `juegos-lapiz-papel-markdown/` con borrados no commiteados. Son material de referencia mezclado con el código, sin relación con el build.

**Recomendación**: mover el material de referencia a un repo/`docs/` separado o trackearlo explícitamente, y resolver los borrados pendientes para que `git status` quede limpio.

### 🟡 B8 — Decisión "STUN-only" no reflejada en código ni documentación

Con `TURN_KEY_ID`/`TURN_KEY_API_TOKEN` sin configurar, `obtenerCredencialesTurn()` (`worker/src/turn.ts:16`) lanza `Error` de inmediato y `completarSala()` (`worker/src/room.ts:100`) cae siempre a `ICE_SERVERS_STUN_FALLBACK`. El endpoint de Realtime **nunca se invoca**: no hay superficie de costo facturable.

Lo que sí queda:

1. **Drift de código/docs (lo importante).** Varios puntos siguen asumiendo que TURN se usa, contradiciendo la decisión real (STUN-only, sin TURN, por no querer tarjeta de crédito):
   - `worker/src/index.ts:34-39` — comentario sobre "mintear credenciales TURN reales (facturables)".
   - `README.md:34-36` — "Requiere una TURN key... paso manual único".
   - `docs/superpowers/specs/2026-08-17-juego-remoto-design.md` §4 — describe TURN como activo.
2. **Abuso del relay gratuito (bajo).** Sin `ALLOWED_ORIGIN`, un tercero podría usar el Worker como relay de señalización anónimo. No facturable; irrelevante para uso familiar.

**Recomendación**: documentar la decisión real y alinear comentarios/README/spec. Opcional: eliminar `turn.ts` y el comentario engañoso si la decisión es definitiva (el `.catch` los hace inofensivos si se dejan). La red de seguridad real de conectividad es el relay por WebSocket (`usaRelay`), que ya está implementado y testeado.

---

## 4. Priorización sugerida

| Orden | Acción | Severidad | Esfuerzo |
|---|---|---|---|
| 1 | Añadir tests + `astro check` a CI | 🔴 | Bajo |
| 2 | Validar `payload` antes de `jugar()` en los boards | 🔴 | Medio |
| 3 | Extraer el wiring remoto/chrome compartido (4→1) | 🟠 | Medio |
| 4 | `crypto.getRandomValues` en el código de sala | 🟠 | Bajo |
| 5 | Eventos tipados + linter/formatter | 🟠 | Medio |
| 6 | Alinear docs/código con la decisión STUN-only (B8) | 🟡 | Bajo |
| 7 | Mejoras B1–B7 | 🟡 | Bajo–Medio |

---

**Conclusión**: la arquitectura base es sólida y está bien documentada. El trabajo pendiente no es rediseñar, sino (a) cerrar dos huecos de robustez (A2) y hacer cumplir la calidad que ya se tiene con CI (A3), (b) empezar a amortizar la duplicación de boards antes del próximo juego (M1), y (c) alinear docs con decisiones reales como la de STUN-only (B8).
