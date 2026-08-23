# Endurecimiento de payloads remotos (A2) y validación en CI (A3)

**Fecha**: 2026-08-23  
**Origen**: Hallazgos 🔴 A2 y 🔴 A3 del informe de arquitectura (`docs/review-arquitectura-2026-08-23.md`).

---

## 1. Contexto y Problema

1. **A2 — Casteo de payload sin validación en los 4 tableros**:  
   En `src/games/<slug>/Board.astro`, los mensajes de tipo `movimiento` recibidos a través del canal WebRTC se castean directamente con `as number`, `as LineId` o `as Fence` antes de ser pasados a `jugar()`. Si el peer remoto envía un payload corrupto o mal formado, el motor o el render pueden lanzar una excepción no capturada (como `TypeError: Cannot read properties of undefined` en `fenceKey` de Conquista), rompiendo la experiencia del jugador receptor.

2. **A3 — CI no ejecuta tests ni typechecking**:  
   El workflow de despliegue (`.github/workflows/deploy.yml`) ejecuta `npm ci` y `npm run build` pero omite la ejecución de `npm test`, `worker/test` y `astro check`. Las regresiones en motores o contratos de tipos pueden llegar inadvertidamente a producción. Además, `package.json` no cuenta con un script `"check"` dedicado.

---

## 2. Objetivos

- Exportar funciones de validación de tipo puro (type guards) desde cada `engine.ts` para validar cualquier payload `unknown` recibido.
- Consumir estas guardas en los cuatro `Board.astro` ignorando de forma segura (con advertencia en consola) cualquier movimiento con payload inválido.
- Agregar cobertura de pruebas unitarias exhaustivas para estas guardas en cada `engine.test.ts`.
- Incorporar el script `"check": "astro check"` en `package.json` y `"test:all"` para conveniencia local.
- Configurar un job de validación previa (`test-and-check`) en `.github/workflows/deploy.yml` que bloquee el despliegue de Pages y Workers ante fallos de tests o typecheck.

---

## 3. Fuera de alcance

- Refactorización del wiring remoto o extracción del componente `<TableroJuego>` (deuda 🟠 M1, tratada en una fase posterior).
- Cambios en el protocolo de señalización WebRTC o en el código del Worker (más allá de ejecutar sus tests en CI).

---

## 4. Diseño detallado

### 4.1. Guardas de tipo en los motores (`src/games/<slug>/engine.ts`)

Cada motor implementará y exportará una función de guarda de tipo TypeScript pura (`payload is T`):

#### 1. Tres en Raya (`src/games/tres-en-raya/engine.ts`)
- **Firma**: `export function esJugadaValida(payload: unknown): payload is number`
- **Condición**: `typeof payload === 'number' && Number.isInteger(payload) && payload >= 0 && payload <= 8`

#### 2. Agujero Negro (`src/games/agujero-negro/engine.ts`)
- **Firma**: `export function esJugadaValida(payload: unknown): payload is number`
- **Condición**: `typeof payload === 'number' && Number.isInteger(payload) && payload >= 0 && payload < TOTAL_POSITIONS`

#### 3. Puntos y Cajas (`src/games/puntos-y-cajas/engine.ts`)
- **Firma**: `export function esLineId(payload: unknown): payload is LineId`
- **Condición**:
  - `typeof payload === 'object' && payload !== null`
  - `(payload as LineId).type === 'h' || (payload as LineId).type === 'v'`
  - `Number.isInteger((payload as LineId).row) && Number.isInteger((payload as LineId).col)`

#### 4. Conquista (`src/games/conquista/engine.ts`)
- **Firma**: `export function esFence(payload: unknown): payload is Fence`
- **Condición**:
  - `typeof payload === 'object' && payload !== null`
  - Debe contener propiedades `a` y `b` de tipo objeto no nulo.
  - Tanto `a` como `b` deben tener `row` y `col` enteros en el rango `[0, GRID_SIZE - 1]`.
  - `a` y `b` no deben ser el mismo punto (`a.row !== b.row || a.col !== b.col`).

---

### 4.2. Consumo seguro en `src/games/<slug>/Board.astro`

En el listener de eventos del canal remoto de cada `Board.astro`:

```ts
canal.alRecibir((mensaje: MensajeJuego) => {
  if (mensaje.tipo === 'movimiento') {
    if (esJugadaValida(mensaje.payload)) { // o esLineId / esFence
      jugar(mensaje.payload);
    } else {
      console.warn('Mensaje de movimiento ignorado por payload inválido:', mensaje.payload);
    }
  } else if (mensaje.tipo === 'nombre') {
    // ...
  } else if (mensaje.tipo === 'reiniciar') {
    // ...
  }
});
```

---

### 4.3. Tests unitarios en `src/games/<slug>/engine.test.ts`

Cada suite de tests incluirá un bloque `describe('guardas de payload')` validando:
- Payloads válidos (movimientos típicos en esquinas, bordes y centro).
- Valores primitivos no numéricos / no válidos (`null`, `undefined`, `""`, `true`, `NaN`, `Infinity`, `{}`, `[]`).
- Números no enteros (`1.5`) o fuera de rango (`-1`, `9`, `99`).
- Para objetos (`LineId`, `Fence`): objetos vacíos, propiedades faltantes, coordenadas flotantes o fuera de tablero, y puntos duplicados `a === b`.

---

### 4.4. Pipeline de CI y Scripts

#### 1. `package.json` (Raíz)
```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:all": "npm test && npm test --prefix worker"
  }
}
```

#### 2. Workflow `.github/workflows/deploy.yml`
Se introduce el job `test-and-check`:

```yaml
name: Deploy to Cloudflare Pages

on:
  push:
    branches: [main]

jobs:
  test-and-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-node@v7
        with:
          node-version-file: ".node-version"
          cache: "npm"

      - name: Install dependencies (root)
        run: npm ci

      - name: Typecheck Astro & TypeScript
        run: npm run check

      - name: Run root unit tests
        run: npm test

      - name: Install dependencies (worker)
        run: npm ci
        working-directory: worker

      - name: Run worker unit tests
        run: npm test
        working-directory: worker

  deploy:
    needs: [test-and-check]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: ".node-version"
          cache: "npm"
      - run: npm ci
      - run: npm run build
        env:
          PUBLIC_SIGNAL_WORKER_URL: https://signal.games.cardila.com
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: 965f487aac0b6ed5c91bf7c0a829d0ca
          command: pages deploy dist --project-name=pencilgames --branch=main

  deploy-worker:
    needs: [test-and-check]
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version-file: ".node-version"
          cache: "npm"
          cache-dependency-path: worker/package-lock.json
      - run: npm ci
        working-directory: worker
      - uses: cloudflare/wrangler-action@v4
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: 965f487aac0b6ed5c91bf7c0a829d0ca
          workingDirectory: worker
          command: deploy
```

---

## 5. Criterios de aceptación y verificación

1. `npm run check` corre `astro check` y termina con 0 errores.
2. `npm test` corre todos los tests (incluyendo los nuevos tests de guardas) y pasan al 100%.
3. `npm test --prefix worker` corre todos los tests del worker y pasan al 100%.
4. `.github/workflows/deploy.yml` valida tipos y tests antes de disparar cualquier deploy.
