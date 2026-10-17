# Pipeline e2e con selección automática — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pruebas e2e con Playwright que un script selecciona según los archivos cambiados, y que bloquean el despliegue a Cloudflare si fallan.

**Architecture:** Un selector puro (`scripts/seleccionar-e2e.mjs`) convierte la lista de archivos cambiados en una `Seleccion`. Playwright (`e2e/`) prueba el `dist` servido con `astro preview` y filtra por suite/slug mediante variables de entorno. Un workflow reutilizable `_e2e.yml` encadena build → selector → Playwright; `ci.yml` y `deploy.yml` lo invocan, y `deploy.yml` lo exige antes de ambos despliegues.

**Tech Stack:** Astro 7, Node ≥ 22.12, npm, `@playwright/test` (versión exacta fijada), vitest (selector), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-17-pipeline-e2e-design.md`

## Global Constraints

- Criterio conservador: ante la duda, corren **todas** las suites.
- Playwright con **Chromium** únicamente; dos proyectos: escritorio y móvil (≈390×844).
- Se prueba el `dist` construido (`astro preview`), nunca `astro dev`.
- Se usa **npm** (no pnpm). `@playwright/test` como devDependency con versión **exacta** (sin `^`), como el resto de pines del repo.
- Node vía `.node-version` (`actions/setup-node@v7` con `node-version-file`), igual que `_test.yml`.
- El job e2e **siempre se ejecuta** (nunca se omite por `paths`/`if` a nivel de job): el ruleset de `main` exige chequeos y uno omitido bloquea el merge. Si no hay nada que correr, termina en verde.
- Reintentos: máximo 1 en CI; un test que pasa solo al reintentar se reporta como flaky.
- Un juego del catálogo sin forma de jugar en e2e **falla** con el mensaje `juego <slug> sin adaptador e2e`; nunca se omite en silencio.
- No tocar el ruleset de GitHub sin confirmación explícita de Carlos.
- Tests unitarios existentes (`npm test`, `npm test --prefix worker`) deben seguir pasando; vitest no debe recoger `e2e/`.

## Review Focus

1. Un archivo **renombrado o movido** entre juegos (`src/games/a/x` → `src/games/b/x`): deben seleccionarse ambos juegos → el diff usa `--no-renames`. (Task 2)
2. Un juego **borrado** (su `.md` ya no existe): el slug seleccionado no está en el catálogo → no se intenta correr; la portada sí corre. (Task 2 y 4)
3. Lista de archivos **vacía** (merge sin cambios, base inexistente, `before` todo ceros): se trata como «todas». (Task 2)
4. Rutas con **espacios o caracteres no ASCII**: el diff se lee con `-z`. (Task 2)
5. Una partida **a medias** guardada en el navegador mostraría el modal «Tienes una partida a medias» y rompería el flujo: cada test usa contexto limpio, y el helper de arranque tolera ese modal. (Task 4)

---

## File Structure

- `scripts/seleccionar-e2e.mjs` — lógica pura de selección + CLI que lee el diff de git y escribe `GITHUB_OUTPUT`.
- `scripts/seleccionar-e2e.test.ts` — tabla de casos del selector (vitest).
- `playwright.config.ts` — proyectos escritorio/móvil, `webServer`, filtros por entorno.
- `e2e/catalogo.ts` — slugs del catálogo, leídos de `src/content/juegos/*.md`.
- `e2e/seleccion.ts` — lee `E2E_SUITES`/`E2E_SLUGS` y decide qué describe corre.
- `e2e/portada.spec.ts` — suite `portada`.
- `e2e/juegos.spec.ts` + `e2e/juegos/arranque.ts` + `e2e/juegos/adaptadores.ts` — suite `juegos`.
- `.github/workflows/_e2e.yml` — workflow reutilizable.
- Modificar: `package.json`, `vitest.config.ts`, `.gitignore`, `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`.

---

### Task 1: Andamiaje de Playwright

**Files:**
- Create: `playwright.config.ts`, `e2e/catalogo.ts`, `e2e/seleccion.ts`, `e2e/humo.spec.ts` (temporal)
- Modify: `package.json`, `vitest.config.ts`, `.gitignore`

**Interfaces:**
- Produces:
  - `slugsDelCatalogo(): string[]` en `e2e/catalogo.ts` (nombres de archivo sin `.md` en `src/content/juegos`, ordenados).
  - `suiteActiva(nombre: 'portada' | 'juegos' | 'remoto'): boolean` y `slugsActivos(): string[]` en `e2e/seleccion.ts`.
  - Variables de entorno: `E2E_SUITES` (lista separada por comas; `todas` o vacío ⇒ todas) y `E2E_SLUGS` (lista de slugs separada por comas; vacío ⇒ todos los del catálogo).
  - Scripts npm: `test:e2e` (`playwright test`) y `test:e2e:install` (`playwright install --with-deps chromium`).

- [ ] **Step 1: Instalar** `@playwright/test` como devDependency con versión exacta (`npm install -D --save-exact @playwright/test`) y confirmar que `package-lock.json` cambia.
- [ ] **Step 2: Escribir `e2e/humo.spec.ts`** con un test `la portada responde` que hace `page.goto('/')` y espera `expect(page).toHaveTitle(/.+/)`.
- [ ] **Step 3: Crear `playwright.config.ts`**: `testDir: 'e2e'`, `retries: process.env.CI ? 1 : 0`, `reporter: process.env.CI ? [['html', {open:'never'}], ['list']] : 'list'`, `use.baseURL: 'http://localhost:4321'`, `trace: 'retain-on-failure'`, `webServer: { command: 'npm run preview -- --port 4321', url: 'http://localhost:4321', reuseExistingServer: !process.env.CI }`, proyectos `escritorio` (Desktop Chrome) y `movil` (`devices['Pixel 7']` o viewport 390×844 con Chromium).
- [ ] **Step 4: Implementar** `e2e/catalogo.ts` y `e2e/seleccion.ts` según las firmas de Interfaces.
- [ ] **Step 5: Añadir scripts npm** `test:e2e` y `test:e2e:install`; añadir `e2e/**` a `exclude` de `vitest.config.ts`; añadir `playwright-report/` y `test-results/` a `.gitignore`.
- [ ] **Step 6: Verificar.** `npm run build && npm run test:e2e:install && npm run test:e2e` → el test de humo pasa en ambos proyectos. `npm test` sigue verde y no menciona `e2e/`.
- [ ] **Step 7: Commit** `chore(e2e): andamiaje de Playwright`.

---

### Task 2: Selector de suites

**Files:**
- Create: `scripts/seleccionar-e2e.mjs`, `scripts/seleccionar-e2e.test.ts`

**Interfaces:**
- Produces, en `scripts/seleccionar-e2e.mjs`:
  - `seleccionarSuites(archivos: string[] | null): Seleccion` donde `Seleccion = { todas: boolean; portada: boolean; juegos: string[]; remoto: boolean }`. `null` significa «diff no calculable».
  - `slugsDeArchivos(archivos: string[]): string[]` (auxiliar exportada).
  - CLI: `node scripts/seleccionar-e2e.mjs [--base <sha>]`. Calcula `git diff --name-only --no-renames -z <base>...HEAD`; sin `--base`, base vacía, base de ceros o error de git ⇒ `null`. Imprime la `Seleccion` en JSON por stdout y, si existe `GITHUB_OUTPUT`, escribe `suites=<lista>` (`todas` o nombres separados por comas, vacío si ninguna) y `slugs=<lista de slugs>`.
- Reglas de decisión: exactamente las de la sección «Selección de suites» del spec, en ese orden. Tratamiento: `null` o lista vacía ⇒ `todas: true`; archivo sin clasificar ⇒ `todas: true`; todo docs/specs ⇒ nada; núcleo ⇒ `todas: true`; solo `worker/**` ⇒ `remoto: true`; `src/games/<slug>/**` y `src/content/juegos/<slug>.md` ⇒ `juegos` con el slug más `portada: true`.

- [ ] **Step 1: Escribir `scripts/seleccionar-e2e.test.ts`** con una tabla de casos `(archivos → Seleccion)`; aserciones mínimas:
  - `null` → `{todas:true, …}`; `[]` → `todas: true`.
  - `['docs/superpowers/specs/x.md']` → `todas:false, portada:false, juegos:[], remoto:false`.
  - `['README.md', 'specs/a.md']` → ninguna.
  - `['src/games/hex/Board.astro']` → `juegos:['hex'], portada:true, todas:false`.
  - `['src/games/hex/engine.test.ts', 'src/content/juegos/nim.md']` → `juegos:['hex','nim']` ordenados.
  - `['src/games/hex/Board.astro', 'src/games/nim/Board.astro']` (movimiento entre juegos, con `--no-renames`) → ambos slugs.
  - `['src/lib/gameSession.ts']`, `['package-lock.json']`, `['.github/workflows/ci.yml']`, `['src/pages/index.astro']`, `['scripts/seleccionar-e2e.mjs']` → `todas: true`.
  - `['worker/src/index.ts']` → `remoto:true, todas:false`.
  - `['worker/src/index.ts', 'src/games/hex/Board.astro']` → `remoto:true, juegos:['hex'], portada:true`.
  - `['archivo-raro.xyz']` → `todas: true`.
  - `['src/games/mi juego/ñ.astro']` → clasifica sin romper (slug `mi juego`).
- [ ] **Step 2: Ejecutar** `npx vitest run scripts/seleccionar-e2e.test.ts` → FALLA (módulo inexistente).
- [ ] **Step 3: Implementar `seleccionarSuites` y `slugsDeArchivos`** como funciones puras; el CLI en el mismo archivo, protegido con `import.meta.url === pathToFileURL(process.argv[1]).href`. Leer el diff con `git diff --name-only --no-renames -z` y dividir por `\0`.
- [ ] **Step 4: Ejecutar** el test → PASA; `npm test` completo → verde.
- [ ] **Step 5: Verificar el CLI** manualmente: `node scripts/seleccionar-e2e.mjs --base HEAD~1` imprime JSON; sin `--base` imprime `todas: true`.
- [ ] **Step 6: Commit** `feat(e2e): selector de suites según archivos cambiados`.

---

### Task 3: Suite de portada

**Files:**
- Create: `e2e/portada.spec.ts`
- Delete: `e2e/humo.spec.ts`

**Interfaces:**
- Consumes: `suiteActiva`, `slugsDelCatalogo` (Task 1).
- Selectores reales de la portada (`src/pages/index.astro`): buscador `#buscador`; botón `#limpiar-filtros` dentro de `#sin-resultados`; contenedor `#grid-juegos`; tarjetas `.indice__item[data-slug]`; botones de filtro `.filtro` con `aria-pressed` dentro de `[data-grupo]`, con `data-todos` o `data-valor`.

- [ ] **Step 1: Escribir los tests** en `portada.spec.ts`, envueltos en `test.describe` que se hace `test.skip` cuando `!suiteActiva('portada')`:
  - `muestra una tarjeta por juego del catálogo`: `#grid-juegos .indice__item` visibles = `slugsDelCatalogo().length`.
  - `el buscador filtra por texto`: escribir `hex` en `#buscador` deja visible la tarjeta `[data-slug="hex"]` y menos tarjetas que el total.
  - `sin resultados + limpiar filtros devuelve el foco al buscador`: buscar `zzzzzz`, `#sin-resultados` visible, clic en `#limpiar-filtros` con teclado (`focus` + Enter), todas las tarjetas vuelven y `#buscador` tiene foco (regresión #77).
  - `un filtro reduce la lista`: pulsar un botón `.filtro[data-valor]` pone `aria-pressed="true"` y deja menos tarjetas visibles que el total.
  - `clic en una tarjeta navega al juego`: clic en la tarjeta de `hex` ⇒ `page.url()` contiene `/juegos/hex`.
  - `registra el service worker`: `await page.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active))` es `true`.
  - `no hay errores de consola`: recoger `page.on('console')` de tipo `error` y `pageerror` durante la carga; esperar array vacío.
- [ ] **Step 2: Ejecutar** `npm run build && npm run test:e2e -- portada` → ajustar selectores solo si el DOM real difiere; los tests deben PASAR en escritorio y móvil.
- [ ] **Step 3: Borrar `e2e/humo.spec.ts`**.
- [ ] **Step 4: Commit** `test(e2e): suite de portada`.

---

### Task 4: Suite de juegos (genérica desde el catálogo)

**Files:**
- Create: `e2e/juegos.spec.ts`, `e2e/juegos/arranque.ts`, `e2e/juegos/adaptadores.ts`

**Interfaces:**
- Consumes: `suiteActiva`, `slugsActivos`, `slugsDelCatalogo` (Task 1).
- Produces:
  - `arrancarPartidaLocal(page: Page): Promise<void>` en `arranque.ts`: atraviesa, si aparecen, `#modal-continuar-partida` (clic en `#modal-continuar-no`), `#modal-modo-juego` (clic en `#modal-modo-juego-local`) y `#modal-jugadores` (clic en `#modal-jugadores-guardar`), esperando a que `#tablero-juego` sea interactuable. Tolera que cualquiera falte.
  - `type Adaptador = { jugar(page: Page): Promise<void>; huella(page: Page): Promise<string> }` y `adaptadorDe(slug: string): Adaptador` en `adaptadores.ts`. `adaptadorDe` devuelve el adaptador específico si existe en el mapa `ESPECIFICOS`; si no, el **genérico**: `huella` = `innerHTML` de `#tablero-juego` (más el texto de `#indicador-turno`); `jugar` = clic en el primer elemento habilitado y visible de `#tablero-juego` que coincida con `[data-indice]:not([data-ocupada="true"]), [data-pos], button.casilla, [role="gridcell"]`. Si no encuentra candidato, lanza `Error('juego <slug> sin adaptador e2e')`.

- [ ] **Step 1: Escribir `juegos.spec.ts`**: para cada `slug` de `slugsActivos()` (cuando `suiteActiva('juegos')`), un test `<slug>: carga, muestra tablero y acepta una jugada` que:
  1. Registra errores de consola/`pageerror` y respuestas de red propias con estado ≥ 400.
  2. `page.goto('/juegos/<slug>/')`, `arrancarPartidaLocal(page)`.
  3. Comprueba `#tablero-juego` visible y `scrollWidth <= clientWidth` del `documentElement` (sin desborde horizontal).
  4. `const antes = await adaptador.huella(page); await adaptador.jugar(page); await expect.poll(() => adaptador.huella(page)).not.toBe(antes);`
  5. Afirma que no hubo errores registrados.
  Cada test usa el contexto limpio por defecto de Playwright (sin partida guardada).
- [ ] **Step 2: Escribir un test** `slugsActivos ignora slugs que no están en el catálogo` (Review Focus 2) como test unitario de vitest sobre `e2e/seleccion.ts`, o como comprobación dentro de `seleccion.ts` que filtra por `slugsDelCatalogo()`.
- [ ] **Step 3: Implementar** `arranque.ts` y `adaptadores.ts` con el genérico; mapa `ESPECIFICOS` vacío al inicio.
- [ ] **Step 4: Ejecutar** `npm run build && npm run test:e2e -- juegos` y revisar los fallos juego a juego. Para cada juego que falle porque el genérico no basta (se esperan al menos Nim, que exige confirmar, y Battleship, que parte con colocación; el resto lo descubre la ejecución), añadir una entrada en `ESPECIFICOS` con su `jugar` y, si hace falta, su `huella`. Repetir hasta que los 21 pasen en ambos proyectos.
- [ ] **Step 5: Verificar el mensaje de fallo**: forzar temporalmente un slug falso en `E2E_SLUGS` no debe ejecutarse (filtrado), y quitar temporalmente el candidato de un juego en local debe producir `juego <slug> sin adaptador e2e`. Revertir.
- [ ] **Step 6: Verificar selección**: `E2E_SUITES=juegos E2E_SLUGS=hex npm run test:e2e` ejecuta solo Hex.
- [ ] **Step 7: Commit** `test(e2e): suite genérica de juegos desde el catálogo`.

---

### Task 5: Integración en CI y en el despliegue

**Files:**
- Create: `.github/workflows/_e2e.yml`
- Modify: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: CLI del selector (Task 2: salidas `suites` y `slugs`), variables `E2E_SUITES`/`E2E_SLUGS` (Task 1).
- Produces: workflow reutilizable `_e2e.yml` con `on.workflow_call.inputs.base` (string, opcional). Job `e2e` (se invoca desde otros workflows como `e2e`, por lo que el chequeo aparecerá como `e2e / e2e`; confirmar el nombre real tras la primera ejecución).

- [ ] **Step 1: Crear `_e2e.yml`** con un único job `e2e` en `ubuntu-latest`: `actions/checkout@v7` con `fetch-depth: 0`; `actions/setup-node@v7` (node-version-file, cache npm); `npm ci`; paso `Seleccionar suites` que ejecuta `node scripts/seleccionar-e2e.mjs --base "${{ inputs.base }}"` con `id: sel`; si `steps.sel.outputs.suites == ''` los pasos siguientes se saltan **a nivel de paso** (el job nunca se omite); instalar Chromium (`npm run test:e2e:install`); `npm run build` con `PUBLIC_SIGNAL_WORKER_URL: https://signal.games.cardila.com` (mismo valor que `deploy.yml`); `npm run test:e2e` con `E2E_SUITES` y `E2E_SLUGS` tomados de los outputs; subir `playwright-report/` como artefacto con `if: ${{ !cancelled() }}`. Cachear `~/.cache/ms-playwright` con `actions/cache` indexado por el hash de `package-lock.json`.
- [ ] **Step 2: Modificar `ci.yml`**: añadir job `e2e` con `uses: ./.github/workflows/_e2e.yml` y `with: base: ${{ github.event.pull_request.base.sha }}`.
- [ ] **Step 3: Modificar `deploy.yml`**: añadir job `e2e` con `uses: ./.github/workflows/_e2e.yml` y `with: base: ${{ github.event.before }}`; cambiar `needs` de `deploy` y `deploy-worker` a `[test-and-check, e2e]`.
- [ ] **Step 4: Documentar** en `README.md` una sección corta: cómo correr e2e en local (`npm run build`, `npm run test:e2e:install`, `npm run test:e2e`), cómo filtrar (`E2E_SUITES`, `E2E_SLUGS`) y qué hace el selector.
- [ ] **Step 5: Validar sintaxis** de los workflows (`actionlint` si está disponible; si no, revisión manual) y abrir un PR de prueba con tres commits temporales que se descartan: (a) solo `docs/` ⇒ el job e2e termina verde sin navegadores; (b) un cambio trivial en `src/games/hex/` ⇒ corre solo Hex y portada; (c) un cambio en `package.json` ⇒ corren todas. Anotar la URL de las ejecuciones.
- [ ] **Step 6: Commit** `ci(e2e): workflow reutilizable y prerrequisito de despliegue`.

---

### Task 6: Ruleset (paso con confirmación) y verificación de aceptación

**Files:** ninguno (acciones sobre GitHub y comprobaciones).

- [ ] **Step 1: Pedir confirmación a Carlos** antes de modificar el ruleset `CI` (id `21880808`): mostrar el chequeo nuevo exacto (nombre observado en la ejecución del PR de Task 5) y el comando `gh api` que lo añadiría a `required_status_checks` junto a `test / test-and-check`. Sin confirmación, dejarlo como instrucción pendiente.
- [ ] **Step 2: Con confirmación**, añadir el chequeo requerido; mantener `strict_required_status_checks_policy: true`.
- [ ] **Step 3: Aceptación** (criterios del spec): PR solo de docs verde en segundos; PR sobre `src/games/hex/` ejecuta solo Hex + portada; PR sobre `src/lib/` o `package-lock.json` ejecuta todo; romper a propósito un tablero (quitar su `Board` del mapa `BOARDS`) hace fallar la suite en un PR y, si ese cambio llegara a `main`, el job `deploy` no se ejecutaría; un juego nuevo en el catálogo sin candidato clicable falla con `juego <slug> sin adaptador e2e`.
- [ ] **Step 4: Cerrar** la rama según `superpowers:finishing-a-development-branch`.

---

## Auto-revisión

- **Cobertura del spec:** selección (Task 2), suites juegos y portada (Tasks 3–4), pipeline CI + deploy `needs` (Task 5), restricción de ruleset y job siempre activo (Tasks 5–6), criterios de éxito (Task 6), fase 2 solo como gancho (`remoto` en el selector y `suiteActiva('remoto')`; no hay suite).
- **Consistencia de tipos:** `Seleccion` y las variables `E2E_SUITES`/`E2E_SLUGS` se definen una vez (Tasks 1–2) y se consumen en Tasks 3–5.
- **Decisión del plan, no del spec:** `ESPECIFICOS` empieza vacío y se llena según lo que falle en la ejecución real, porque el marcado difiere por juego y no es verificable sin correrlo.
