# Portada: metadatos, filtros y últimos jugados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un niño encuentre un juego apropiado en menos de diez segundos: cada tarjeta muestra duración, edad y tipo; la portada filtra por duración y tipo y muestra una fila `Seguir jugando` con los últimos juegos abiertos.

**Architecture:** Los metadatos viven en el frontmatter de `src/content/juegos/*.md` (única fuente), validados por zod en `content.config.ts` con enums definidos en `src/lib/catalogo.ts`. La lógica de filtrado y de recientes son módulos puros en `src/lib/` con pruebas vitest; la portada los consume desde un `<script>` de Astro y filtra con `hidden` sobre los `<a>` que ya se renderizan (sin generar enlaces por JS).

**Tech Stack:** Astro (content collections + zod), TypeScript vanilla, vitest (entorno `node`), CSS con variables compartidas. Sin dependencias nuevas.

**Spec:** `specs/07-portada-metadatos-y-filtros.md` (contexto compartido: `specs/00-contexto-compartido.md`)

## Global Constraints

- No introducir dependencias nuevas. Astro + CSS + TS vanilla.
- Todo texto de interfaz en español, tuteando al niño.
- Piso absoluto de cualquier zona tocable: **48 px**; botones de filtro ≥ 48 px.
- Verificar a **600×960** y **960×600**; a 600 px los filtros no provocan scroll horizontal.
- `duracion`: `rapido` (< 5 min) · `medio` (5–15) · `largo` (> 15). `edad`: `5`, `7` o `9`. `tipo`: `conectar` · `bloquear` · `capturar` · `dibujar` · `adivinar`.
- Los enlaces de las tarjetas siguen siendo `<a href>` reales; la rejilla sigue siendo navegable con teclado.
- Sin juegos recientes, la fila `Seguir jugando` no aparece (ni hueco vacío).
- Clave de almacenamiento: `pencilgames:recientes`. Mismo patrón de `try/catch` silencioso que `src/lib/marcador.ts`.
- Cualquier animación nueva va envuelta en `@media (prefers-reduced-motion: reduce)` (este plan no añade ninguna).
- Fuera de alcance: favoritos, perfiles por niño, buscador difuso o por sinónimos, filtro por edad, persistir filtros entre visitas.
- Los commits terminan con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` (segundo `-m`). Si el guard de git bloquea el comando, el usuario lo ejecuta con `!`.
- Trabajar en el worktree `../pencilgames-spec07`, rama `spec07-portada-filtros`. Comandos npm con `npm`, no pnpm.

## Review Focus

- `localStorage` con JSON corrupto, que no es array, o con elementos que no son cadenas → la portada se comporta como "sin recientes" (Task 2).
- `localStorage` inaccesible (modo privado, cuota) → registrar no lanza ni rompe la página del juego (Task 2).
- Abrir dos veces el mismo juego, o más de 4 distintos → sin duplicados y máximo 4, el último primero (Task 2).
- Consulta de búsqueda con mayúsculas o solo espacios → mayúsculas coinciden igual; solo espacios equivale a sin consulta (Task 3).
- Filtros que no devuelven nada → mensaje amable con botón que restaura los 21 juegos, no rejilla vacía (Task 5, verificado en Task 7).
- Un slug guardado de un juego que ya no existe → se ignora en `Seguir jugando` sin error (Task 6, verificado en Task 7).
- Volver a la portada con el botón atrás (bfcache) → `Seguir jugando` se refresca (Task 6, verificado en Task 7).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/catalogo.ts` (nuevo) | Tipos y constantes de `duracion`/`edad`/`tipo` + etiquetas e iconos. Una sola fuente para esquema, tarjeta y filtros. |
| `src/lib/catalogo.test.ts` (nuevo) | Comprueba que los 21 `.md` tienen los tres campos con valores válidos. |
| `src/lib/recientes.ts` (nuevo) | Lista de últimos juegos abiertos en `localStorage`. |
| `src/lib/recientes.test.ts` (nuevo) | Pruebas de recientes. |
| `src/lib/filtros.ts` (nuevo) | `coincide` y `alternar`, puros. |
| `src/lib/filtros.test.ts` (nuevo) | Pruebas de filtros. |
| `src/content.config.ts` | Añade los tres campos al esquema. |
| `src/content/juegos/*.md` (21) | Añade `duracion`, `edad`, `tipo`. |
| `src/components/GameCard.astro` | Muestra las tres etiquetas con icono. |
| `src/pages/index.astro` | Filtros, buscador degradado, estado vacío, fila `Seguir jugando`. |
| `src/pages/juegos/[slug].astro` | Registra el juego como reciente al abrirse. |

---

### Task 1: Metadatos de los juegos (esquema + datos)

**Files:**
- Create: `src/lib/catalogo.ts`
- Create: `src/lib/catalogo.test.ts`
- Modify: `src/content.config.ts`
- Modify: los 21 archivos de `src/content/juegos/*.md`

**Interfaces:**
- Produces (`src/lib/catalogo.ts`):
  - `DURACIONES: readonly ['rapido','medio','largo']`, `TIPOS: readonly ['conectar','bloquear','capturar','dibujar','adivinar']`, `EDADES: readonly [5,7,9]`
  - `type Duracion`, `type Tipo`, `type Edad`
  - `DURACION_INFO: Record<Duracion, { icono: string; texto: string }>`
  - `TIPO_INFO: Record<Tipo, { icono: string; texto: string }>`
  - `ICONO_EDAD: string`
  - `textoEdad(edad: number): string` → `"5+ años"`

- [ ] **Step 1: Escribir la prueba que falla**

Crear `src/lib/catalogo.test.ts`:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DURACIONES,
  DURACION_INFO,
  EDADES,
  TIPOS,
  TIPO_INFO,
  textoEdad,
} from './catalogo';

const DIR = fileURLToPath(new URL('../content/juegos/', import.meta.url));

function campo(texto: string, nombre: string): string | undefined {
  const frontmatter = texto.split('---')[1] ?? '';
  return frontmatter.match(new RegExp(`^${nombre}:\\s*"?([^"\\n]+)"?\\s*$`, 'm'))?.[1];
}

const juegos = readdirSync(DIR)
  .filter(f => f.endsWith('.md'))
  .map(f => ({ slug: f.replace(/\.md$/, ''), texto: readFileSync(DIR + f, 'utf8') }));

describe('catalogo', () => {
  it('cada duración y tipo tiene icono y texto', () => {
    for (const d of DURACIONES) {
      expect(DURACION_INFO[d].icono).not.toBe('');
      expect(DURACION_INFO[d].texto).not.toBe('');
    }
    for (const t of TIPOS) {
      expect(TIPO_INFO[t].icono).not.toBe('');
      expect(TIPO_INFO[t].texto).not.toBe('');
    }
  });

  it('textoEdad formatea la edad mínima', () => {
    expect(textoEdad(5)).toBe('5+ años');
    expect(textoEdad(9)).toBe('9+ años');
  });

  it('hay 21 juegos', () => {
    expect(juegos).toHaveLength(21);
  });

  it.each(juegos)('$slug declara duracion, edad y tipo válidos', ({ texto }) => {
    expect(DURACIONES as readonly string[]).toContain(campo(texto, 'duracion'));
    expect(EDADES.map(String)).toContain(campo(texto, 'edad'));
    expect(TIPOS as readonly string[]).toContain(campo(texto, 'tipo'));
  });

  it('cada duración y cada tipo lo usa al menos un juego (los filtros nunca nacen vacíos)', () => {
    for (const d of DURACIONES) {
      expect(juegos.some(j => campo(j.texto, 'duracion') === d)).toBe(true);
    }
    for (const t of TIPOS) {
      expect(juegos.some(j => campo(j.texto, 'tipo') === t)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/catalogo.test.ts`
Expected: FAIL — no se puede resolver `./catalogo`.

- [ ] **Step 3: Crear `src/lib/catalogo.ts`**

```ts
// Vocabulario compartido de los metadatos de cada juego (spec 07). Lo usan
// el esquema de contenido, la tarjeta y los filtros de la portada: una sola
// fuente para que no se desincronicen.

export const DURACIONES = ['rapido', 'medio', 'largo'] as const;
export const TIPOS = ['conectar', 'bloquear', 'capturar', 'dibujar', 'adivinar'] as const;
export const EDADES = [5, 7, 9] as const;

export type Duracion = (typeof DURACIONES)[number];
export type Tipo = (typeof TIPOS)[number];
export type Edad = (typeof EDADES)[number];

interface Etiqueta {
  icono: string;
  texto: string;
}

export const DURACION_INFO: Record<Duracion, Etiqueta> = {
  rapido: { icono: '⚡', texto: 'Rápido' },
  medio: { icono: '⏱️', texto: 'Medio' },
  largo: { icono: '⏳', texto: 'Largo' },
};

export const TIPO_INFO: Record<Tipo, Etiqueta> = {
  conectar: { icono: '🔗', texto: 'Conectar' },
  bloquear: { icono: '🚧', texto: 'Bloquear' },
  capturar: { icono: '🎯', texto: 'Capturar' },
  dibujar: { icono: '✏️', texto: 'Dibujar' },
  adivinar: { icono: '🔍', texto: 'Adivinar' },
};

export const ICONO_EDAD = '🧒';

export function textoEdad(edad: number): string {
  return `${edad}+ años`;
}
```

- [ ] **Step 4: Ampliar el esquema en `src/content.config.ts`**

Reemplazar el archivo por:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { DURACIONES, EDADES, TIPOS } from './lib/catalogo';

const juegos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/juegos' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icono: z.string(),
    minJugadores: z.number().int().min(1),
    maxJugadores: z.number().int().min(1),
    duracion: z.enum(DURACIONES),
    edad: z.number().refine(e => (EDADES as readonly number[]).includes(e), {
      message: `edad debe ser una de ${EDADES.join(', ')}`,
    }),
    tipo: z.enum(TIPOS),
  }),
});

export const collections = { juegos };
```

- [ ] **Step 5: Rellenar los 21 `.md`**

Run (desde la raíz del worktree) este script, que inserta los tres campos justo después de la línea `maxJugadores:` de cada archivo:

```bash
node -e '
const fs = require("fs");
const T = {
  "tres-en-raya": ["rapido", 5, "conectar"],
  "notakto": ["rapido", 7, "bloquear"],
  "nim": ["rapido", 7, "bloquear"],
  "chomp": ["rapido", 7, "bloquear"],
  "sim": ["rapido", 7, "dibujar"],
  "obstruccion": ["rapido", 5, "bloquear"],
  "agujero-negro": ["rapido", 7, "bloquear"],
  "domineering": ["medio", 7, "bloquear"],
  "col": ["medio", 9, "bloquear"],
  "snakes": ["medio", 7, "bloquear"],
  "gomoku": ["medio", 7, "conectar"],
  "hex": ["medio", 9, "conectar"],
  "juego-y": ["medio", 9, "conectar"],
  "bridg-it": ["medio", 9, "conectar"],
  "metasquares": ["medio", 9, "conectar"],
  "sos": ["medio", 7, "capturar"],
  "estampida": ["medio", 7, "capturar"],
  "puntos-y-cajas": ["medio", 5, "dibujar"],
  "triggle": ["medio", 9, "dibujar"],
  "conquista": ["medio", 9, "dibujar"],
  "battleship": ["largo", 7, "adivinar"],
};
const dir = "src/content/juegos/";
const archivos = fs.readdirSync(dir).filter(f => f.endsWith(".md"));
if (archivos.length !== 21 || Object.keys(T).length !== 21) throw new Error("se esperaban 21 juegos");
for (const f of archivos) {
  const slug = f.replace(/\.md$/, "");
  const t = T[slug];
  if (!t) throw new Error("sin metadatos para " + slug);
  const texto = fs.readFileSync(dir + f, "utf8");
  if (/^duracion:/m.test(texto)) continue;
  const nuevo = texto.replace(/^(maxJugadores:.*)$/m, `$1\nduracion: ${t[0]}\nedad: ${t[1]}\ntipo: ${t[2]}`);
  if (nuevo === texto) throw new Error("no se encontró maxJugadores en " + f);
  fs.writeFileSync(dir + f, nuevo);
}
console.log("ok");
'
git diff --stat
```

Expected: `ok` y `21 files changed`. Revisar un archivo: `sed -n 1,10p src/content/juegos/hex.md` debe mostrar `duracion: medio`, `edad: 9`, `tipo: conectar` tras `maxJugadores`.

- [ ] **Step 6: Ejecutar pruebas y chequeo de tipos/build**

Run: `npx vitest run src/lib/catalogo.test.ts && npm run check`
Expected: PASS (26 pruebas aprox.) y `astro check` sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/catalogo.ts src/lib/catalogo.test.ts src/content.config.ts src/content/juegos
git commit -m "feat(portada): metadatos de duración, edad y tipo en los 21 juegos" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Módulo de juegos recientes

**Files:**
- Create: `src/lib/recientes.ts`
- Create: `src/lib/recientes.test.ts`

**Interfaces:**
- Produces:
  - `CLAVE_RECIENTES = 'pencilgames:recientes'`, `MAX_RECIENTES = 4`
  - `obtenerRecientes(): string[]` — slugs, el más reciente primero; nunca lanza.
  - `registrarReciente(slug: string): string[]` — pone `slug` al frente, sin duplicados, máx. 4; devuelve la lista nueva; nunca lanza.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/recientes.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLAVE_RECIENTES,
  MAX_RECIENTES,
  obtenerRecientes,
  registrarReciente,
} from './recientes';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

describe('recientes', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado devuelve lista vacía', () => {
    expect(obtenerRecientes()).toEqual([]);
  });

  it('registra el más reciente primero', () => {
    registrarReciente('hex');
    registrarReciente('nim');
    expect(obtenerRecientes()).toEqual(['nim', 'hex']);
  });

  it('abrir de nuevo un juego lo sube al frente sin duplicarlo', () => {
    registrarReciente('hex');
    registrarReciente('nim');
    registrarReciente('hex');
    expect(obtenerRecientes()).toEqual(['hex', 'nim']);
  });

  it('guarda como máximo MAX_RECIENTES y descarta el más antiguo', () => {
    for (const s of ['a', 'b', 'c', 'd', 'e']) registrarReciente(s);
    expect(MAX_RECIENTES).toBe(4);
    expect(obtenerRecientes()).toEqual(['e', 'd', 'c', 'b']);
  });

  it('registrarReciente devuelve la lista nueva', () => {
    registrarReciente('hex');
    expect(registrarReciente('nim')).toEqual(['nim', 'hex']);
  });

  it('un slug vacío no se registra', () => {
    registrarReciente('hex');
    expect(registrarReciente('')).toEqual(['hex']);
    expect(obtenerRecientes()).toEqual(['hex']);
  });

  it('JSON corrupto cuenta como sin recientes y se puede volver a registrar', () => {
    storage.setItem(CLAVE_RECIENTES, '{no es json');
    expect(obtenerRecientes()).toEqual([]);
    expect(registrarReciente('hex')).toEqual(['hex']);
  });

  it('un valor guardado que no es array cuenta como sin recientes', () => {
    storage.setItem(CLAVE_RECIENTES, JSON.stringify({ hex: 1 }));
    expect(obtenerRecientes()).toEqual([]);
  });

  it('ignora elementos que no son cadenas, vacíos o repetidos, y recorta a MAX_RECIENTES', () => {
    storage.setItem(
      CLAVE_RECIENTES,
      JSON.stringify(['hex', 3, null, '', 'hex', 'nim', 'a', 'b', 'c'])
    );
    expect(obtenerRecientes()).toEqual(['hex', 'nim', 'a', 'b']);
  });

  it('si localStorage lanza, no rompe: lee [] y registrar devuelve la lista en memoria', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('bloqueado');
      },
      setItem() {
        throw new Error('bloqueado');
      },
    } as unknown as Storage);
    expect(obtenerRecientes()).toEqual([]);
    expect(registrarReciente('hex')).toEqual(['hex']);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/recientes.test.ts`
Expected: FAIL — no se puede resolver `./recientes`.

- [ ] **Step 3: Implementar `src/lib/recientes.ts`**

```ts
// Últimos juegos abiertos (spec 07). Solo guarda slugs; qué juegos existen
// lo decide la portada. Mismo patrón de try/catch silencioso que marcador.ts:
// si localStorage no está disponible, no persiste pero no rompe nada.

export const CLAVE_RECIENTES = 'pencilgames:recientes';
export const MAX_RECIENTES = 4;

export function obtenerRecientes(): string[] {
  try {
    const raw = localStorage.getItem(CLAVE_RECIENTES);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const vistos = new Set<string>();
    for (const x of parsed) {
      if (typeof x === 'string' && x !== '') vistos.add(x);
    }
    return [...vistos].slice(0, MAX_RECIENTES);
  } catch {
    return [];
  }
}

export function registrarReciente(slug: string): string[] {
  if (slug === '') return obtenerRecientes();
  const nuevos = [slug, ...obtenerRecientes().filter(s => s !== slug)].slice(0, MAX_RECIENTES);
  try {
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(nuevos));
  } catch {
    // localStorage no disponible (modo privado, cuota llena): no persiste,
    // pero abrir un juego nunca debe fallar por esto.
  }
  return nuevos;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/lib/recientes.test.ts`
Expected: PASS (10 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recientes.ts src/lib/recientes.test.ts
git commit -m "feat(portada): módulo de juegos recientes en localStorage" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lógica de filtrado

**Files:**
- Create: `src/lib/filtros.ts`
- Create: `src/lib/filtros.test.ts`

**Interfaces:**
- Consumes: `Duracion`, `Tipo` de `./catalogo` (Task 1).
- Produces:
  - `interface JuegoFiltrable { nombre: string; descripcion: string; duracion: Duracion; tipo: Tipo }`
  - `interface Filtros { duraciones: ReadonlySet<Duracion>; tipos: ReadonlySet<Tipo>; consulta: string }`
  - `coincide(juego: JuegoFiltrable, filtros: Filtros): boolean`
  - `alternar<T>(conjunto: ReadonlySet<T>, valor: T): Set<T>` — copia con `valor` añadido o quitado.

- [ ] **Step 1: Escribir las pruebas que fallan**

Crear `src/lib/filtros.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Duracion, Tipo } from './catalogo';
import { alternar, coincide, type Filtros, type JuegoFiltrable } from './filtros';

const hex: JuegoFiltrable = {
  nombre: 'Hex',
  descripcion: 'Conecta tus dos lados opuestos del tablero.',
  duracion: 'medio',
  tipo: 'conectar',
};
const nim: JuegoFiltrable = {
  nombre: 'Nim',
  descripcion: 'Retira estrellas por turnos.',
  duracion: 'rapido',
  tipo: 'bloquear',
};

function filtros(parcial: {
  duraciones?: Duracion[];
  tipos?: Tipo[];
  consulta?: string;
}): Filtros {
  return {
    duraciones: new Set(parcial.duraciones ?? []),
    tipos: new Set(parcial.tipos ?? []),
    consulta: parcial.consulta ?? '',
  };
}

describe('coincide', () => {
  it('sin filtros deja pasar todo', () => {
    expect(coincide(hex, filtros({}))).toBe(true);
    expect(coincide(nim, filtros({}))).toBe(true);
  });

  it('filtrar por rápido deja solo los rápidos', () => {
    const f = filtros({ duraciones: ['rapido'] });
    expect(coincide(nim, f)).toBe(true);
    expect(coincide(hex, f)).toBe(false);
  });

  it('dentro de una dimensión es OR', () => {
    const f = filtros({ duraciones: ['rapido', 'medio'] });
    expect(coincide(nim, f)).toBe(true);
    expect(coincide(hex, f)).toBe(true);
  });

  it('entre duración y tipo es AND', () => {
    expect(coincide(nim, filtros({ duraciones: ['rapido'], tipos: ['bloquear'] }))).toBe(true);
    expect(coincide(nim, filtros({ duraciones: ['rapido'], tipos: ['conectar'] }))).toBe(false);
  });

  it('la consulta busca en nombre y descripción, sin distinguir mayúsculas', () => {
    expect(coincide(hex, filtros({ consulta: 'HEX' }))).toBe(true);
    expect(coincide(hex, filtros({ consulta: 'opuestos' }))).toBe(true);
    expect(coincide(hex, filtros({ consulta: 'estrellas' }))).toBe(false);
  });

  it('una consulta de solo espacios equivale a no tener consulta', () => {
    expect(coincide(hex, filtros({ consulta: '   ' }))).toBe(true);
  });

  it('la consulta se combina con los filtros (AND)', () => {
    expect(coincide(nim, filtros({ consulta: 'nim', duraciones: ['medio'] }))).toBe(false);
    expect(coincide(nim, filtros({ consulta: 'nim', duraciones: ['rapido'] }))).toBe(true);
  });
});

describe('alternar', () => {
  it('añade un valor ausente', () => {
    expect([...alternar(new Set<string>(), 'a')]).toEqual(['a']);
  });

  it('quita un valor presente', () => {
    expect([...alternar(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('no muta el conjunto original', () => {
    const original = new Set(['a']);
    alternar(original, 'b');
    expect([...original]).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `npx vitest run src/lib/filtros.test.ts`
Expected: FAIL — no se puede resolver `./filtros`.

- [ ] **Step 3: Implementar `src/lib/filtros.ts`**

```ts
import type { Duracion, Tipo } from './catalogo';

// Filtrado de la portada (spec 07). Funciones puras: el DOM solo las llama.
// Un conjunto vacío significa "Todos" en esa dimensión.

export interface JuegoFiltrable {
  nombre: string;
  descripcion: string;
  duracion: Duracion;
  tipo: Tipo;
}

export interface Filtros {
  duraciones: ReadonlySet<Duracion>;
  tipos: ReadonlySet<Tipo>;
  consulta: string;
}

export function coincide(juego: JuegoFiltrable, filtros: Filtros): boolean {
  if (filtros.duraciones.size > 0 && !filtros.duraciones.has(juego.duracion)) return false;
  if (filtros.tipos.size > 0 && !filtros.tipos.has(juego.tipo)) return false;
  const consulta = filtros.consulta.trim().toLowerCase();
  if (consulta === '') return true;
  return (
    juego.nombre.toLowerCase().includes(consulta) ||
    juego.descripcion.toLowerCase().includes(consulta)
  );
}

export function alternar<T>(conjunto: ReadonlySet<T>, valor: T): Set<T> {
  const nuevo = new Set(conjunto);
  if (nuevo.has(valor)) nuevo.delete(valor);
  else nuevo.add(valor);
  return nuevo;
}
```

- [ ] **Step 4: Ejecutar y verificar que pasa**

Run: `npx vitest run src/lib/filtros.test.ts`
Expected: PASS (10 pruebas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/filtros.ts src/lib/filtros.test.ts
git commit -m "feat(portada): lógica pura de filtrado por duración, tipo y búsqueda" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Etiquetas en la tarjeta

**Files:**
- Modify: `src/components/GameCard.astro` (archivo completo, 40 líneas)

**Interfaces:**
- Consumes: `Duracion`, `Tipo`, `DURACION_INFO`, `TIPO_INFO`, `ICONO_EDAD`, `textoEdad` de `../lib/catalogo` (Task 1).
- Produces: `GameCard` acepta además las props `duracion: Duracion`, `edad: number`, `tipo: Tipo`.

- [ ] **Step 1: Reescribir `GameCard.astro`**

```astro
---
import {
  DURACION_INFO,
  ICONO_EDAD,
  TIPO_INFO,
  textoEdad,
  type Duracion,
  type Tipo,
} from '../lib/catalogo';

interface Props {
  href: string;
  icono: string;
  title: string;
  description: string;
  duracion: Duracion;
  edad: number;
  tipo: Tipo;
}

const { href, icono, title, description, duracion, edad, tipo } = Astro.props;

const etiquetas = [
  DURACION_INFO[duracion],
  { icono: ICONO_EDAD, texto: textoEdad(edad) },
  TIPO_INFO[tipo],
];
---

<a class="game-card" href={href}>
  <span class="game-card__icono" aria-hidden="true">{icono}</span>
  <span class="game-card__title">{title}</span>
  <span class="game-card__description">{description}</span>
  <span class="game-card__etiquetas">
    {
      etiquetas.map(e => (
        <span class="game-card__etiqueta">
          <span aria-hidden="true">{e.icono}</span>
          {e.texto}
        </span>
      ))
    }
  </span>
</a>

<style>
  .game-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.25rem;
    border-radius: var(--radius);
    background: var(--color-surface);
    text-decoration: none;
    color: var(--color-text);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    min-height: var(--tap-target-min);
    height: 100%;
  }

  .game-card__icono {
    font-size: 2.5rem;
  }

  .game-card__title {
    font-size: 1.25rem;
    font-weight: 700;
  }

  .game-card__description {
    font-size: 0.95rem;
    opacity: 0.8;
  }

  .game-card__etiquetas {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: auto;
    padding-top: 0.25rem;
  }

  .game-card__etiqueta {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.06);
    font-size: 0.8rem;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
```

(`height: 100%` + `margin-top: auto` alinean las etiquetas al fondo cuando las descripciones tienen distinta longitud. El contenedor `.indice__item` es el hijo de la rejilla y se estira por defecto.)

- [ ] **Step 2: Pasar las props nuevas desde `index.astro`**

En `src/pages/index.astro`, dentro de `<GameCard ... />`, añadir tras `description={juego.data.description}`:

```astro
              duracion={juego.data.duracion}
              edad={juego.data.edad}
              tipo={juego.data.tipo}
```

- [ ] **Step 3: Chequeo de tipos y build**

Run: `npm run check && npm run build`
Expected: sin errores; el build genera las 21 páginas de juego y la portada.

- [ ] **Step 4: Commit**

```bash
git add src/components/GameCard.astro src/pages/index.astro
git commit -m "feat(portada): etiquetas de duración, edad y tipo en cada tarjeta" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Filtros, buscador degradado y estado vacío

**Files:**
- Modify: `src/pages/index.astro` (archivo completo)

**Interfaces:**
- Consumes: `DURACIONES`, `TIPOS`, `DURACION_INFO`, `TIPO_INFO`, `Duracion`, `Tipo` (Task 1); `coincide`, `alternar`, `Filtros` (Task 3); `GameCard` con props nuevas (Task 4).
- Produces: en el DOM, cada `.indice__item` dentro de `#grid-juegos` lleva `data-slug`, `data-nombre`, `data-descripcion`, `data-duracion`, `data-tipo`. Task 6 usa `data-slug` y la constante `items`.

- [ ] **Step 1: Reescribir `src/pages/index.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import GameCard from '../components/GameCard.astro';
import { getCollection } from 'astro:content';
import { DURACIONES, DURACION_INFO, TIPOS, TIPO_INFO } from '../lib/catalogo';

const juegos = (await getCollection('juegos')).sort((a, b) =>
  a.data.title.localeCompare(b.data.title, 'es')
);

const grupos = [
  {
    id: 'duracion',
    titulo: 'Cuánto dura',
    opciones: DURACIONES.map(valor => ({ valor, ...DURACION_INFO[valor] })),
  },
  {
    id: 'tipo',
    titulo: 'Cómo se juega',
    opciones: TIPOS.map(valor => ({ valor, ...TIPO_INFO[valor] })),
  },
];
---

<BaseLayout title="Juegos">
  <main class="indice">
    <h1>Pencilgames</h1>
    <p>Juegos de lápiz y papel para jugar en familia, en una sola tableta.</p>

    <section class="indice__filtros" aria-label="Filtrar juegos">
      {
        grupos.map(grupo => (
          <div class="indice__grupo" role="group" aria-label={grupo.titulo} data-grupo={grupo.id}>
            <span class="indice__grupo-titulo" aria-hidden="true">
              {grupo.titulo}
            </span>
            <button type="button" class="filtro" data-todos aria-pressed="true">
              Todos
            </button>
            {grupo.opciones.map(op => (
              <button type="button" class="filtro" data-valor={op.valor} aria-pressed="false">
                <span aria-hidden="true">{op.icono}</span>
                {op.texto}
              </button>
            ))}
          </div>
        ))
      }
    </section>

    <input
      type="search"
      id="buscador"
      class="indice__buscador"
      placeholder="Buscar por nombre..."
      aria-label="Buscar un juego"
    />

    <div id="grid-juegos" class="indice__grid">
      {
        juegos.map(juego => (
          <div
            class="indice__item"
            data-slug={juego.id}
            data-nombre={juego.data.title.toLowerCase()}
            data-descripcion={juego.data.description.toLowerCase()}
            data-duracion={juego.data.duracion}
            data-tipo={juego.data.tipo}
          >
            <GameCard
              href={`/juegos/${juego.id}`}
              icono={juego.data.icono}
              title={juego.data.title}
              description={juego.data.description}
              duracion={juego.data.duracion}
              edad={juego.data.edad}
              tipo={juego.data.tipo}
            />
          </div>
        ))
      }
    </div>

    <div id="sin-resultados" class="indice__vacio" hidden>
      <p>No encontramos ningún juego con eso. ¡Prueba con otros filtros!</p>
      <button type="button" id="limpiar-filtros" class="filtro filtro--accion">
        Limpiar filtros
      </button>
    </div>
  </main>
</BaseLayout>

<style>
  .indice {
    max-width: 60rem;
    margin: 0 auto;
    padding: var(--spacing);
  }

  .indice__filtros {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .indice__grupo {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }

  .indice__grupo-titulo {
    flex-basis: 100%;
    font-size: 0.85rem;
    font-weight: 700;
    opacity: 0.7;
  }

  .filtro {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-height: 48px;
    min-width: 48px;
    padding: 0 1rem;
    border: 2px solid rgba(0, 0, 0, 0.15);
    border-radius: 999px;
    background: var(--color-surface);
    color: var(--color-text);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .filtro[aria-pressed='true'] {
    background: var(--color-accent);
    border-color: var(--color-text);
  }

  .filtro:focus-visible {
    outline: 3px solid var(--color-text);
    outline-offset: 2px;
  }

  .indice__buscador {
    width: 100%;
    max-width: 24rem;
    padding: 0.5rem 1rem;
    font-size: 0.95rem;
    border-radius: var(--radius);
    border: 1px solid #ddd;
    margin: 0 0 1rem;
    min-height: var(--tap-target-min);
  }

  .indice__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr));
    gap: 1rem;
  }

  .indice__vacio {
    text-align: center;
    padding: 2rem 0;
  }

  .indice__vacio[hidden] {
    display: none;
  }
</style>

<script>
  import type { Duracion, Tipo } from '../lib/catalogo';
  import { alternar, coincide } from '../lib/filtros';

  const buscador = document.getElementById('buscador') as HTMLInputElement;
  const items = Array.from(document.querySelectorAll<HTMLElement>('#grid-juegos .indice__item'));
  const sinResultados = document.getElementById('sin-resultados')!;
  const botonLimpiar = document.getElementById('limpiar-filtros')!;
  const panelFiltros = document.querySelector<HTMLElement>('.indice__filtros')!;
  const botones = Array.from(panelFiltros.querySelectorAll<HTMLButtonElement>('.filtro'));

  let duraciones = new Set<Duracion>();
  let tipos = new Set<Tipo>();

  function grupoDe(boton: HTMLElement): string {
    return boton.closest<HTMLElement>('[data-grupo]')!.dataset.grupo!;
  }

  function aplicar() {
    const filtros = { duraciones, tipos, consulta: buscador.value };
    let visibles = 0;

    for (const item of items) {
      const visible = coincide(
        {
          nombre: item.dataset.nombre!,
          descripcion: item.dataset.descripcion!,
          duracion: item.dataset.duracion as Duracion,
          tipo: item.dataset.tipo as Tipo,
        },
        filtros
      );
      item.hidden = !visible;
      if (visible) visibles++;
    }

    sinResultados.hidden = visibles > 0;

    for (const boton of botones) {
      const conjunto: ReadonlySet<string> = grupoDe(boton) === 'duracion' ? duraciones : tipos;
      const activo = boton.hasAttribute('data-todos')
        ? conjunto.size === 0
        : conjunto.has(boton.dataset.valor!);
      boton.setAttribute('aria-pressed', String(activo));
    }
  }

  panelFiltros.addEventListener('click', evento => {
    const boton = (evento.target as HTMLElement).closest<HTMLButtonElement>('.filtro');
    if (!boton) return;
    const esTodos = boton.hasAttribute('data-todos');

    if (grupoDe(boton) === 'duracion') {
      duraciones = esTodos ? new Set() : alternar(duraciones, boton.dataset.valor as Duracion);
    } else {
      tipos = esTodos ? new Set() : alternar(tipos, boton.dataset.valor as Tipo);
    }
    aplicar();
  });

  buscador.addEventListener('input', aplicar);

  botonLimpiar.addEventListener('click', () => {
    duraciones = new Set();
    tipos = new Set();
    buscador.value = '';
    aplicar();
  });
</script>
```

- [ ] **Step 2: Chequeo de tipos y build**

Run: `npm run check && npm run build`
Expected: sin errores ni avisos nuevos.

- [ ] **Step 3: Comprobación rápida en el navegador (humo)**

Run: `npx astro dev --port 4410` en segundo plano y abrir `http://localhost:4410/`.
Expected: dos filas de botones (`Todos`, ⚡ Rápido, ⏱️ Medio, ⏳ Largo / `Todos`, 🔗 Conectar, …). Pulsar `Rápido` deja 7 tarjetas; pulsar además `Adivinar` muestra el mensaje vacío; `Limpiar filtros` devuelve 21. La verificación formal a 600×960 y 960×600 se hace en la Task 7.

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat(portada): filtros por duración y tipo, buscador degradado y estado vacío" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: «Seguir jugando» (registro + fila)

**Files:**
- Modify: `src/pages/juegos/[slug].astro` (atributo `data-slug` y script)
- Modify: `src/pages/index.astro` (sección + estilos + script)

**Interfaces:**
- Consumes: `registrarReciente`, `obtenerRecientes` (Task 2); `data-slug` y la constante `items` de `index.astro` (Task 5).
- Produces: sección `#recientes` con rejilla `#grid-recientes`; visible solo si hay al menos un reciente existente.

- [ ] **Step 1: Registrar el reciente al abrir un juego**

En `src/pages/juegos/[slug].astro`, cambiar el contenedor del tablero:

```astro
  <div id="contenedor-tablero" data-slug={juego.id} hidden>
```

y, en el `<script>` del final, justo debajo de la línea `const contenedorTablero = document.getElementById('contenedor-tablero')!;`, añadir la importación al inicio del script y la llamada:

```ts
  import { registrarReciente } from '../../lib/recientes';
```

(al principio del bloque `<script>`, antes de las constantes) y

```ts
  registrarReciente(contenedorTablero.dataset.slug!);
```

(inmediatamente después de declarar `contenedorTablero`).

- [ ] **Step 2: Añadir la sección en `index.astro`**

En `src/pages/index.astro`, insertar entre el `<p>` de la cabecera y `<section class="indice__filtros"`:

```astro
    <section id="recientes" class="indice__recientes" aria-labelledby="recientes-titulo" hidden>
      <h2 id="recientes-titulo">Seguir jugando</h2>
      <div id="grid-recientes" class="indice__grid"></div>
    </section>
```

Añadir a los estilos:

```css
  .indice__recientes {
    margin: 1rem 0;
  }

  .indice__recientes[hidden] {
    display: none;
  }

  .indice__recientes h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }
```

- [ ] **Step 3: Rellenar la fila desde el script de la portada**

En el `<script>` de `index.astro`, añadir la importación junto a las demás:

```ts
  import { obtenerRecientes } from '../lib/recientes';
```

y al final del script (después del manejador de `botonLimpiar`):

```ts
  const seccionRecientes = document.getElementById('recientes')!;
  const gridRecientes = document.getElementById('grid-recientes')!;

  // Clona las tarjetas ya renderizadas (siguen siendo <a href> reales) en el
  // orden de recientes; un slug que ya no existe se ignora sin error.
  function mostrarRecientes() {
    const porSlug = new Map(items.map(item => [item.dataset.slug!, item]));
    const tarjetas = obtenerRecientes()
      .map(slug => porSlug.get(slug))
      .filter((item): item is HTMLElement => item !== undefined)
      .map(item => {
        const copia = item.cloneNode(true) as HTMLElement;
        copia.hidden = false;
        return copia;
      });
    gridRecientes.replaceChildren(...tarjetas);
    seccionRecientes.hidden = tarjetas.length === 0;
  }

  mostrarRecientes();

  // Al volver con «atrás» la página puede salir de la caché del navegador
  // (bfcache) sin volver a ejecutar el script: se refresca la fila.
  window.addEventListener('pageshow', evento => {
    if (evento.persisted) mostrarRecientes();
  });
```

(Las copias quedan fuera de `#grid-juegos`, así que no las afectan los filtros: `Seguir jugando` ignora filtros a propósito.)

- [ ] **Step 4: Chequeo de tipos, pruebas y build**

Run: `npm run check && npm test && npm run build`
Expected: todo en verde.

- [ ] **Step 5: Comprobación rápida en el navegador (humo)**

Con `npx astro dev --port 4410`: abrir `/`, sin sección `Seguir jugando`; entrar a `/juegos/hex`, volver a `/` → aparece la fila con Hex; entrar a `/juegos/nim` y volver → Nim primero, luego Hex.

- [ ] **Step 6: Commit**

```bash
git add src/pages/index.astro "src/pages/juegos/[slug].astro"
git commit -m "feat(portada): fila «Seguir jugando» con los últimos juegos abiertos" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Verificación a 600×960 y 960×600

**Files:**
- Ninguno en el repo. Script temporal en el directorio scratchpad de la sesión (no se commitea).

**Interfaces:**
- Consumes: la portada completa (Tasks 1–6) servida con `astro dev`.

- [ ] **Step 1: Pruebas completas**

Run: `npm run test:all && npm run check && npm run build`
Expected: todo en verde.

- [ ] **Step 2: Arrancar el servidor y Chrome headless**

El MCP de chrome-devtools falla sin X: usar Chrome headless por CDP. `astro preview` no sirve aquí; usar `astro dev` en un puerto propio (el 4399 suele estar ocupado por el dev server del repo principal).

```bash
npx astro dev --port 4410 &
CHROME=$(command -v google-chrome chromium chromium-browser | head -1)
$CHROME --headless=new --remote-debugging-port=9333 --user-data-dir=$(mktemp -d) about:blank &
```

- [ ] **Step 3: Escribir y ejecutar el script de medición**

Crear `medir.mjs` en el directorio scratchpad:

```js
// uso: node medir.mjs <ancho> <alto>   (Node >= 22: WebSocket y fetch globales)
const [w, h] = process.argv.slice(2).map(Number);
const base = 'http://localhost:4410';
const pestana = await (await fetch('http://localhost:9333/json/new?about:blank', { method: 'PUT' })).json();
const ws = new WebSocket(pestana.webSocketDebuggerUrl);
await new Promise(r => (ws.onopen = r));
let id = 0;
const pend = new Map();
ws.onmessage = m => {
  const d = JSON.parse(m.data);
  pend.get(d.id)?.(d);
};
const send = (method, params = {}) =>
  new Promise(r => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async expr =>
  (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.result.value;
const esperar = ms => new Promise(r => setTimeout(r, ms));
const ir = async ruta => {
  await send('Page.navigate', { url: base + ruta });
  await esperar(1500);
};
const resultados = [];
const check = (nombre, ok, dato) => resultados.push(`${ok ? 'OK  ' : 'FALLA'} ${nombre} ${dato ?? ''}`);

await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await ir('/');
await ev('localStorage.clear()');
await ir('/');

check('sin scroll horizontal', await ev('document.documentElement.scrollWidth <= innerWidth'),
  await ev('document.documentElement.scrollWidth + "/" + innerWidth'));
check('botones de filtro >= 48px',
  await ev('[...document.querySelectorAll(".filtro")].every(b => b.getBoundingClientRect().height >= 47.5)'));
check('21 tarjetas visibles al inicio',
  (await ev('[...document.querySelectorAll("#grid-juegos .indice__item")].filter(i => !i.hidden).length')) === 21);
check('sin recientes la sección está oculta y no ocupa hueco',
  await ev('document.getElementById("recientes").hidden && document.getElementById("recientes").getBoundingClientRect().height === 0'));
check('cada tarjeta muestra 3 etiquetas',
  await ev('[...document.querySelectorAll("#grid-juegos .game-card")].every(c => c.querySelectorAll(".game-card__etiqueta").length === 3)'));

await ev('document.querySelector(".indice__grupo[data-grupo=duracion] [data-valor=rapido]").click()');
const esperados = await ev('document.querySelectorAll("#grid-juegos .indice__item[data-duracion=rapido]").length');
const visibles = await ev('[...document.querySelectorAll("#grid-juegos .indice__item")].filter(i => !i.hidden).length');
check('filtro rápido deja solo los rápidos', visibles === esperados && esperados > 0, `${visibles}/${esperados}`);

await ev('document.querySelector(".indice__grupo[data-grupo=tipo] [data-valor=adivinar]").click()');
check('rápido + adivinar muestra el estado vacío',
  await ev('!document.getElementById("sin-resultados").hidden && [...document.querySelectorAll("#grid-juegos .indice__item")].every(i => i.hidden)'));
await ev('document.getElementById("limpiar-filtros").click()');
check('limpiar filtros devuelve los 21',
  (await ev('[...document.querySelectorAll("#grid-juegos .indice__item")].filter(i => !i.hidden).length')) === 21);

await ir('/juegos/hex');
await ir('/juegos/nim');
await ir('/');
check('Seguir jugando visible con Nim y Hex en ese orden',
  await ev('JSON.stringify([...document.querySelectorAll("#grid-recientes a")].map(a => a.getAttribute("href")))') === '["/juegos/nim","/juegos/hex"]');
check('Seguir jugando no desborda a lo ancho', await ev('document.documentElement.scrollWidth <= innerWidth'));

await ev('localStorage.setItem("pencilgames:recientes", JSON.stringify(["juego-inexistente","hex"]))');
await ir('/');
check('slug inexistente se ignora',
  await ev('JSON.stringify([...document.querySelectorAll("#grid-recientes a")].map(a => a.getAttribute("href")))') === '["/juegos/hex"]');

await ev('localStorage.setItem("pencilgames:recientes", "{corrupto")');
await ir('/');
check('JSON corrupto: sin sección y sin error', await ev('document.getElementById("recientes").hidden'));

console.log(`--- ${w}x${h} ---\n` + resultados.join('\n'));
await send('Page.captureScreenshot').then(async r => {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(`portada-${w}x${h}.png`, Buffer.from(r.result.data, 'base64'));
});
ws.close();
process.exit(0);
```

Run:

```bash
node medir.mjs 600 960
node medir.mjs 960 600
```

Expected: todas las líneas `OK`. Si alguna dice `FALLA`, corregir en la tarea que corresponda (no en el script) y repetir.

- [ ] **Step 4: Revisar las capturas**

Abrir `portada-600x960.png` y `portada-960x600.png` con la herramienta Read: comprobar que las dos filas de filtros se ven completas (envuelven, no se cortan), que las etiquetas de las tarjetas son legibles y que el buscador queda por debajo de los filtros.

- [ ] **Step 5: Navegación con teclado**

Con el script o a mano en `astro dev`: `Tab` recorre `Todos` y los botones de filtro (se ve el contorno de foco), luego el buscador, luego los enlaces de las tarjetas; `Enter`/`Espacio` activan un filtro. Anotar el resultado en la descripción del PR.

- [ ] **Step 6: Limpieza**

```bash
kill %1 %2 2>/dev/null; git status --short
```

Expected: el árbol de trabajo está limpio (el script y las capturas viven en el scratchpad, no en el repo).

---

## Autoevaluación

**Cobertura de la spec:**
- R1 → Task 1 (esquema + 21 juegos desde una única fuente).
- R2 → Task 4.
- R3 → Tasks 3 y 5 (multiselección, `Todos`, botones ≥ 48 px, sin `<select>`).
- R4 → Tasks 2 y 6.
- R5 → Task 5 (buscador debajo de los filtros, menor tamaño) y Task 6 (recientes arriba).
- R6 → Task 5 (mensaje + botón `Limpiar filtros`).
- R7 → Tasks 4–6 filtran con `hidden` sobre los `<a href>` ya renderizados; Task 7 comprueba el teclado.
- Criterios de aceptación → Task 7 (script).

**Consistencia de nombres:** `catalogo.ts` (Task 1) define `DURACIONES`, `TIPOS`, `EDADES`, `DURACION_INFO`, `TIPO_INFO`, `ICONO_EDAD`, `textoEdad`, usados con esos nombres en Tasks 3–5. `coincide`/`alternar`/`Filtros`/`JuegoFiltrable` (Task 3) se usan igual en Task 5. `obtenerRecientes`/`registrarReciente` (Task 2) se usan igual en Task 6. `data-slug` se declara en Task 5 y se consume en Task 6.
