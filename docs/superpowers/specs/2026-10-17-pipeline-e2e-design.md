# Pipeline de pruebas e2e con selección automática — diseño

Fecha: 2026-10-17

## Intención y por qué

Hoy el repo tiene pruebas unitarias (vitest en la raíz y en `worker/`) y typecheck, pero ninguna prueba que abra la aplicación en un navegador. Los tests unitarios cubren los motores de juego y la lógica de `src/lib`, pero no que la UI realmente cargue, que el tablero sea clickeable, que la portada filtre o que el service worker se registre. No hay un incidente que motive esto: es prevención. Se quiere que el pipeline lo detecte antes de desplegar, sin que nadie tenga que acordarse de correr nada.

El pipeline debe además **decidir solo qué e2e correr** según los archivos que toca el cambio, y **ser prerrequisito del despliegue** a Cloudflare Pages y del worker.

## Objetivos

- Pruebas e2e con Playwright sobre el `dist` ya construido (no sobre `astro dev`).
- Un paso de selección automática: dado el diff, produce la lista de suites a correr.
- Criterio **conservador**: ante la duda, corren todas.
- Las e2e son chequeo requerido en PRs a `main` y bloquean `deploy.yml` (Pages y worker).
- Un juego nuevo queda cubierto sin escribir pruebas nuevas.

## No objetivos

- No reemplazar ni duplicar los tests unitarios existentes.
- No escenarios de partida completa por juego en la fase 1 (hasta ganar/perder).
- No pruebas visuales de capturas (screenshot diffing).
- No probar contra producción ni contra el worker desplegado: siempre contra el build local del cambio.

## Anti-objetivos (fracasaría aunque «funcione»)

- Un pipeline que se salta e2e que debió correr porque la regla de selección tenía un hueco. Por eso la regla falla hacia «correr todo».
- Pruebas flaky que la gente aprende a reintentar o ignorar. Mejor pocas y estables.
- Un chequeo requerido que no reporta estado cuando se omite, dejando los PR bloqueados para siempre (ver «Restricción de ruleset»).
- Que el tiempo de CI crezca linealmente de forma incontrolada con el número de juegos.

## Fases

**Fase 1 (este diseño, a implementar):** infraestructura Playwright, selector de suites, e2e de juegos (genérica desde el catálogo) y e2e de portada, integración en CI y en deploy.

**Fase 2 (fuera de este documento, solo se deja el gancho):** e2e de modo remoto con dos navegadores contra el worker de señalización local; escenarios a mano para juegos concretos. El selector de la fase 1 ya debe conocer la suite `remoto` y la regla «solo `worker/` ⇒ remoto» aunque la suite aún no exista (si no existe, se omite sin fallar).

## Contexto del repo (hechos verificados)

- Astro 7, Node ≥ 22.12 (`.node-version`), npm (no pnpm). 21 juegos en `src/games/<slug>/Board.astro`; los metadatos viven en `src/content/juegos/<slug>.md` y se renderizan en `src/pages/juegos/[slug].astro`, que importa cada `Board` en un mapa `BOARDS`.
- Workflows: `.github/workflows/_test.yml` (reutilizable: typecheck + vitest raíz + vitest worker), `ci.yml` (en PR a `main`), `deploy.yml` (en push a `main`; jobs `test-and-check` → `deploy` Pages y `deploy-worker`).
- Existe un ruleset activo `CI` en `main` con el chequeo requerido **`test / test-and-check`** y `strict_required_status_checks_policy: true`.
- El service worker `public/sw.js` lleva `__CACHE_VERSION__` que se sustituye en el build (`astro.config.mjs`).
- Los tableros no comparten un único marcado: algunos usan `<button class="casilla" data-indice>`, otros SVG con `role="grid"` y `data-indice`, Nim usa `role="gridcell"` con `data-fila`/`data-pos` y requiere «Confirmar». El tablero está dentro de `TableroJuego.astro` (`#tablero-juego`, `#indicador-turno`, `#banner-ganador`).

## Selección de suites

Un script (en `scripts/`, Node, sin dependencias nuevas, con tests unitarios de vitest) recibe la lista de archivos cambiados y emite un JSON con las suites a ejecutar. Reglas, evaluadas en este orden; la primera que aplique decide:

1. Evento distinto de `pull_request`/`push` (p. ej. `workflow_dispatch`) o imposibilidad de calcular el diff (rama sin base, push inicial, error de git): **todas**.
2. Algún archivo no clasificado por ninguna regla de abajo: **todas**.
3. Todos los archivos son docs/specs (`docs/**`, `specs/**`, `*.md` de la raíz, `abstract-games-by-category/**`): **ninguna**.
4. Cualquier archivo del núcleo compartido: **todas**. Núcleo = `src/lib/**`, `src/components/**`, `src/layouts/**`, `src/pages/**`, `src/content.config.ts`, `public/**`, `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `.node-version`, `.github/**`, la propia config y pruebas de Playwright, `scripts/**`.
5. Si solo hay cambios en `worker/**`: suite `remoto` (cuando exista).
6. Si hay cambios en `src/games/<slug>/**` y/o `src/content/juegos/<slug>.md`: suite `juegos` restringida a esos slugs, más la suite `portada` (humo).
7. Combinación de las anteriores (p. ej. juegos + worker): la unión.

Notas:
- Los archivos de test unitario (`*.test.ts`) dentro de `src/games/` y `src/lib/` se tratan igual que su carpeta (decisión mía: no se excluyen, por simplicidad y por la regla conservadora).
- Cambiar `src/pages/**` es núcleo porque `[slug].astro` monta todos los juegos.
- La salida debe ser determinista y estar cubierta por tests unitarios con una tabla de casos (entrada → suites), incluyendo los casos «archivo desconocido ⇒ todas» y «lista vacía ⇒ todas».

## Pruebas, fase 1

### Juegos (genérica, generada desde el catálogo)

Se generan un caso por juego a partir de los archivos de `src/content/juegos/*.md` (la misma fuente que usa el sitio), de modo que un juego nuevo queda cubierto automáticamente. Para cada juego, en escritorio y en un perfil móvil (≈390×844):

1. Abre `/juegos/<slug>/` sin errores de consola ni respuestas de red fallidas propias.
2. El tablero (`#tablero-juego` y su contenido) es visible y no desborda horizontalmente el viewport.
3. Tras iniciar la partida (la UI de arranque puede mostrar modales de modo/jugadores: la prueba los atraviesa por la opción local), un clic en una casilla/zona legal cambia el estado observable (casilla ocupada, cambia el indicador de turno, etc.).

Cómo hacer el paso 3 de forma genérica es **decisión del builder**: los marcados difieren (ver contexto). Se acepta, y se prefiere, un pequeño adaptador por juego (un mapa `slug → cómo hacer una jugada legal y cómo observarla`) si la heurística genérica no basta; lo importante es que un juego sin adaptador **falle la suite con un mensaje claro** («juego X sin adaptador e2e») en lugar de omitirse en silencio. Los juegos con particularidades (Nim: confirmar; Battleship: colocación; Conquista) pueden requerir pasos adicionales en su adaptador.

### Portada

Sobre `/`:
- Se muestran tantas tarjetas como juegos hay en el catálogo.
- El buscador filtra por texto; «Limpiar filtros» restablece la lista y devuelve el foco al buscador (regresión conocida, #77).
- Los filtros por duración/tipo/edad reducen la lista.
- Clic en una tarjeta navega a `/juegos/<slug>/`.
- El service worker queda registrado y activo tras cargar (`navigator.serviceWorker.ready`).
- No hay errores de consola.

## Pipeline

- Nuevo workflow reutilizable `_e2e.yml`: checkout, setup-node (como `_test.yml`), `npm ci`, instala Chromium de Playwright, `npm run build` (con las mismas variables públicas que `deploy.yml`, o un valor ficticio para la URL del worker, ya que la fase 1 no usa modo remoto), ejecuta el selector, sirve `dist` localmente y corre solo las suites seleccionadas. Sube el reporte HTML y las trazas de fallos como artefactos.
- `ci.yml`: añade el job e2e para PRs a `main`.
- `deploy.yml`: `deploy` y `deploy-worker` pasan a `needs: [test-and-check, e2e]`. Un e2e fallido bloquea ambos despliegues.
- **Restricción de ruleset:** `main` exige el chequeo `test / test-and-check` y estado `strict`. Un chequeo requerido cuya ejecución se omite por filtros de ruta se queda «pendiente» y bloquea el merge. Por eso el job e2e **siempre se ejecuta** y decide internamente (si el selector devuelve «ninguna», termina en verde en segundos). Añadir el nuevo chequeo (`e2e / ...` o el nombre que resulte) a los chequeos requeridos del ruleset es un paso explícito del plan, que necesita acción del dueño del repo en GitHub (la API de rulesets); el plan debe dejarlo como paso manual o scripteado con `gh api` pidiendo confirmación antes de tocar el ruleset.
- `npm audit`/Dependabot no cambia; Dependabot ya vigila `package.json`, y `@playwright/test` entra como devDependency fijada a una versión exacta (el repo fija versiones; ver la memoria sobre pines de TypeScript/vitest).

## Decisiones tomadas por mí (no por Carlos)

- Playwright con Chromium; perfil móvil además del de escritorio. No Firefox/WebKit en la fase 1.
- Pruebas contra `dist` servido con `astro preview` o un servidor estático equivalente (a elección del builder).
- Los `*.test.ts` bajo `src/games/` cuentan como cambio del juego.
- Dónde viven: carpeta `e2e/` en la raíz, con su propia config `playwright.config.ts`; scripts de selección en `scripts/`.
- Reintentos: máximo 1 en CI, y un test que solo pasa en el reintento se reporta como flaky (no se oculta).

## Lo que queda al builder

- Heurística/adaptadores concretos de «jugada legal» por juego.
- Elección del servidor estático, estructura interna de `e2e/`, nombres de scripts npm.
- Cómo paralelizar (shards o workers) para acotar el tiempo si 21 juegos × 2 perfiles resulta lento.
- Cómo exponer los slugs seleccionados a Playwright (variable de entorno, filtro `--grep`, o proyectos por suite).
- Cachear los navegadores de Playwright entre ejecuciones.

## Criterios de éxito

- Un PR que solo cambia `docs/` pasa el chequeo e2e en segundos sin ejecutar navegadores.
- Un PR que solo cambia `src/games/hex/` ejecuta únicamente Hex y el humo de la portada.
- Un PR que cambia `src/lib/` o `package-lock.json` ejecuta todo.
- Romper a propósito el tablero de un juego (p. ej. quitar su `Board` del mapa) hace fallar el e2e y bloquea el despliegue.
- Un juego nuevo añadido al catálogo sin adaptador e2e hace fallar la suite con un mensaje claro.
