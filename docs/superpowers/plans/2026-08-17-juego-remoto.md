# Juego remoto (unirse a una partida por internet) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que dos jugadores jueguen los 3 juegos existentes (Tres en raya, Puntos y cajas, Agujero Negro) desde dos computadoras distintas, por internet, uniéndose con un código corto de sala.

**Architecture:** Un Worker de Cloudflare nuevo (`worker/`, Durable Object por sala) hace de señalización WebRTC y de credenciales TURN; los movimientos del juego viajan peer-to-peer por un data channel WebRTC, con el mismo WebSocket de señalización como respaldo si el P2P no se establece. El cliente gana un módulo `src/lib/remoto/` (transporte, agnóstico del juego) y cada `Board.astro` se conecta a él por un `CustomEvent`.

**Tech Stack:** Cloudflare Workers + Durable Objects (SQLite storage backend, plan Free), Cloudflare Realtime (STUN/TURN), WebRTC (`RTCPeerConnection`/`RTCDataChannel` nativos del navegador), Astro + TypeScript (sin cambios de stack en el sitio), Vitest (+ `@cloudflare/vitest-pool-workers` para el Worker).

## Global Constraints

- Todo debe permanecer **gratis**: Durable Objects únicamente con **SQLite storage backend** (`new_sqlite_classes` en las migraciones) — nunca KV-backed, que requiere plan de pago.
- **Sin cuentas de usuario**, sin persistencia de partidas más allá de la sala activa, sin reconexión automática tras una desconexión a mitad de partida (decisiones deliberadas del spec).
- Todo el texto de interfaz en **español**; nombres de variables/funciones/tipos del código nuevo en español, siguiendo el estilo ya usado en el repo (`nombres`, `reiniciar`, `jugador`, etc.).
- Código de sala: **6 caracteres**, alfabeto `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (sin `0/O`, `1/I/L`).
- Expiración de sala: **10 minutos** sin que se una el segundo jugador.
- TTL de credenciales TURN: **3600 segundos** (1 hora — de sobra para una sesión de juego, y muy por debajo del máximo de 48h que permite la API de Cloudflare Realtime).
- No se toca la extracción del componente `<TableroJuego>` compartido (backlog separado) ni se agregan juegos nuevos en este plan.
- Spec de referencia: `docs/superpowers/specs/2026-08-17-juego-remoto-design.md`.
- `worker/vitest.config.ts` corre con `poolOptions.workers.isolatedStorage: false` + `singleWorker: true` (agregado en la Tarea 4 — requisito real de `@cloudflare/vitest-pool-workers` para poder testear WebSockets + Durable Objects, documentado como limitación conocida de esa librería). Consecuencia para cualquier test nuevo en `worker/` que toque storage de un Durable Object (Tareas 5-6 y en adelante): **el storage NO se aísla por test** — cada test debe usar su propia clave/código único (como ya hacen los tests de la Tarea 4) en vez de asumir que el storage se resetea entre tests.
- Los tests de WebSocket en `worker/` que necesiten esperar un tipo de mensaje específico deben usar el patrón de "buzón" persistente (un listener adjuntado una sola vez al conectar, que reparte cada mensaje entrante a quien lo esté esperando o lo guarda en buffer) — nunca `addEventListener(..., {once:true})` registrado de nuevo en cada espera, que pierde mensajes llegados en la ventana entre dos `await`s (hallazgo de la Tarea 4, ver su Step 1 para la implementación de referencia).

---

## Task 1: Andamiaje del Worker de señalización

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/wrangler.toml`
- Create: `worker/vitest.config.ts`
- Create: `worker/src/index.ts`
- Test: `worker/test/index.test.ts`

**Interfaces:**
- Produces: un proyecto Worker independiente, testeable con `npm test` desde `worker/`, con un `fetch` handler mínimo que responde `404` a cualquier ruta (las tareas siguientes lo completan).

- [ ] **Step 1: Crear `worker/package.json`**

```json
{
  "name": "pencilgames-signal",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.7.0",
    "@cloudflare/workers-types": "^4.20260101.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Instalar dependencias**

Run: `cd worker && npm install`
Expected: se crea `worker/package-lock.json` con las versiones resueltas (los `^` de arriba se fijan al instalar).

- [ ] **Step 3: Crear `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  }
}
```

- [ ] **Step 4: Crear `worker/wrangler.toml` (mínimo, sin ruta de dominio todavía — eso es la Tarea 6)**

```toml
name = "pencilgames-signal"
main = "src/index.ts"
compatibility_date = "2026-08-17"

[[durable_objects.bindings]]
name = "ROOMS"
class_name = "Room"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["Room"]
```

- [ ] **Step 5: Crear `worker/vitest.config.ts`**

```ts
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

- [ ] **Step 6: Escribir el test que falla primero**

`worker/test/index.test.ts`:

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker por defecto', () => {
  it('responde 404 a una ruta desconocida', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/lo-que-sea');
    expect(respuesta.status).toBe(404);
  });
});
```

- [ ] **Step 7: Correr el test y verificar que falla**

Run: `cd worker && npm test`
Expected: FAIL — `worker/src/index.ts` no existe todavía.

- [ ] **Step 8: Implementación mínima**

`worker/src/index.ts`:

```ts
export interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('No encontrado', { status: 404 });
  },
};
```

Nota: `wrangler.toml` referencia una clase `Room` que todavía no existe (Tarea 4). Antes de esa tarea, comenta temporalmente el bloque `[[durable_objects.bindings]]` y `[[migrations]]` en `wrangler.toml`, o el `npm test` de este paso fallará al arrancar el runtime. Vuelve a descomentarlos en la Tarea 4, cuando `Room` ya exista.

- [ ] **Step 9: Correr el test y verificar que pasa**

Run: `cd worker && npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
cd worker && git add -A
git commit -m "chore: scaffold del Worker de señalización remota"
```

---

## Task 2: Generador de código de sala

**Files:**
- Create: `worker/src/roomCode.ts`
- Test: `worker/test/roomCode.test.ts`

**Interfaces:**
- Produces: `generarCodigoSala(): string` — 6 caracteres del alfabeto sin ambigüedades.

- [ ] **Step 1: Escribir el test que falla primero**

`worker/test/roomCode.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generarCodigoSala } from '../src/roomCode';

describe('generarCodigoSala', () => {
  it('genera un código de 6 caracteres', () => {
    expect(generarCodigoSala()).toHaveLength(6);
  });

  it('solo usa caracteres del alfabeto sin ambigüedades', () => {
    const codigo = generarCodigoSala();
    expect(codigo).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('genera códigos distintos en llamadas sucesivas (no determinista)', () => {
    const codigos = new Set(Array.from({ length: 20 }, () => generarCodigoSala()));
    expect(codigos.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd worker && npm test -- roomCode`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementación**

`worker/src/roomCode.ts`:

```ts
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGITUD = 6;

export function generarCodigoSala(): string {
  let codigo = '';
  for (let i = 0; i < LONGITUD; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd worker && npm test -- roomCode`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd worker && git add src/roomCode.ts test/roomCode.test.ts
git commit -m "feat: generador de código corto de sala"
```

---

## Task 3: Minteo de credenciales TURN

**Files:**
- Create: `worker/src/turn.ts`
- Test: `worker/test/turn.test.ts`

**Interfaces:**
- Consumes: `Env` (de `worker/src/index.ts`) — específicamente `TURN_KEY_ID`, `TURN_KEY_API_TOKEN`.
- Produces: `IceServer` (tipo), `ICE_SERVERS_STUN_FALLBACK: IceServer[]`, `obtenerCredencialesTurn(env: Env): Promise<IceServer[]>`.

- [ ] **Step 1: Escribir el test que falla primero**

`worker/test/turn.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICE_SERVERS_STUN_FALLBACK, obtenerCredencialesTurn } from '../src/turn';
import type { Env } from '../src/index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('obtenerCredencialesTurn', () => {
  it('llama al endpoint de Cloudflare Realtime con el TTL correcto y devuelve iceServers', async () => {
    const respuestaFalsa = {
      iceServers: [{ urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' }],
    };
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(respuestaFalsa),
    });
    vi.stubGlobal('fetch', fetchFalso);

    const env = { TURN_KEY_ID: 'clave-123', TURN_KEY_API_TOKEN: 'token-abc' } as Env;
    const resultado = await obtenerCredencialesTurn(env);

    expect(fetchFalso).toHaveBeenCalledWith(
      'https://rtc.live.cloudflare.com/v1/turn/keys/clave-123/credentials/generate-ice-servers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
        body: JSON.stringify({ ttl: 3600 }),
      })
    );
    expect(resultado).toEqual(respuestaFalsa.iceServers);
  });

  it('lanza un error si faltan las credenciales de cuenta', async () => {
    await expect(obtenerCredencialesTurn({} as Env)).rejects.toThrow();
  });

  it('lanza un error si la API responde con un status de error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const env = { TURN_KEY_ID: 'x', TURN_KEY_API_TOKEN: 'y' } as Env;
    await expect(obtenerCredencialesTurn(env)).rejects.toThrow();
  });
});

describe('ICE_SERVERS_STUN_FALLBACK', () => {
  it('incluye el STUN gratuito de Cloudflare', () => {
    expect(ICE_SERVERS_STUN_FALLBACK[0].urls).toContain('stun:stun.cloudflare.com:3478');
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd worker && npm test -- turn`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementación**

`worker/src/turn.ts`:

```ts
import type { Env } from './index';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const ICE_SERVERS_STUN_FALLBACK: IceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
];

const TTL_SEGUNDOS = 3600;

export async function obtenerCredencialesTurn(env: Env): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
    throw new Error('Credenciales TURN no configuradas (TURN_KEY_ID / TURN_KEY_API_TOKEN)');
  }

  const respuesta = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TTL_SEGUNDOS }),
    }
  );

  if (!respuesta.ok) {
    throw new Error(`La API de Cloudflare Realtime respondió ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as { iceServers: IceServer[] };
  return datos.iceServers;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd worker && npm test -- turn`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd worker && git add src/turn.ts test/turn.test.ts
git commit -m "feat: minteo de credenciales TURN de Cloudflare Realtime"
```

---

## Task 4: Durable Object `Room`

**Files:**
- Create: `worker/src/room.ts`
- Modify: `worker/wrangler.toml` (descomentar el binding/migración de la Tarea 1 si se habían comentado)
- Test: `worker/test/room.test.ts`

**Interfaces:**
- Consumes: `Env` (de `./index`), `obtenerCredencialesTurn`/`ICE_SERVERS_STUN_FALLBACK` (de `./turn`).
- Produces: clase `Room` (Durable Object) exportada, con `fetch(request: Request): Promise<Response>`. Espera una URL con query params `rol` (`'crear' | 'unirse'`) y `codigo`, y el header `Upgrade: websocket`.
- Protocolo de mensajes que `Room` envía por WebSocket: `{tipo:'conectado', asiento, codigo}`, `{tipo:'rival-conectado'}`, `{tipo:'rival-desconectado'}`, `{tipo:'ice-servers', iceServers}`, y cualquier otro mensaje recibido de un jugador se retransmite tal cual al otro.
- Cierra el socket con código `4040` (código inválido/expirado) o `4090` (sala llena) cuando corresponde, **después** de aceptar la conexión (un WebSocket no puede transportar el status HTTP original al cliente si se rechaza el upgrade).

- [ ] **Step 1: Escribir los tests que fallan primero**

Nota de diseño: estos tests llaman al Durable Object **directamente** (vía `env.ROOMS`), no a través de las rutas públicas `/crear`/`/unirse` del Worker — esas rutas (y la generación del código de sala) las agrega recién la Tarea 5. `Room.fetch()` ya lee `rol` y `codigo` de los query params tal cual, así que se le pueden pasar directamente. Cada test usa un código de sala distinto para que las instancias del Durable Object no se pisen entre tests (cada nombre de código direcciona a una instancia separada).

`worker/test/room.test.ts`:

```ts
import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

function conectar(rol: 'crear' | 'unirse', codigo: string): Promise<WebSocket> {
  const id = env.ROOMS.idFromName(codigo);
  const stub = env.ROOMS.get(id);
  return stub
    .fetch(`https://ejemplo.test/conectar?rol=${rol}&codigo=${codigo}`, {
      headers: { Upgrade: 'websocket' },
    })
    .then(respuesta => {
      const ws = respuesta.webSocket!;
      ws.accept();
      return ws;
    });
}

function esperarMensajeDeTipo(ws: WebSocket, tipo: string): Promise<any> {
  return new Promise(resolve => {
    const manejador = (evento: MessageEvent) => {
      const mensaje = JSON.parse(evento.data as string);
      if (mensaje.tipo === tipo) {
        ws.removeEventListener('message', manejador);
        resolve(mensaje);
      }
    };
    ws.addEventListener('message', manejador);
  });
}

function esperarCierre(ws: WebSocket): Promise<number> {
  return new Promise(resolve => {
    ws.addEventListener('close', evento => resolve(evento.code), { once: true });
  });
}

describe('Room', () => {
  it('crea una sala y confirma el asiento 1', async () => {
    const ws = await conectar('crear', 'CODIGO01');
    const mensaje = await esperarMensajeDeTipo(ws, 'conectado');
    expect(mensaje).toEqual({ tipo: 'conectado', asiento: 1, codigo: 'CODIGO01' });
  });

  it('permite unirse con un código válido y avisa a ambos que el rival se conectó', async () => {
    const ws1 = await conectar('crear', 'CODIGO02');
    await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar('unirse', 'CODIGO02');
    const conectado2 = await esperarMensajeDeTipo(ws2, 'conectado');
    expect(conectado2).toEqual({ tipo: 'conectado', asiento: 2, codigo: 'CODIGO02' });

    const rival1 = await esperarMensajeDeTipo(ws1, 'rival-conectado');
    expect(rival1.tipo).toBe('rival-conectado');
  });

  it('rechaza un código inexistente con cierre 4040', async () => {
    const ws = await conectar('unirse', 'NOEXISTE');
    const codigoCierre = await esperarCierre(ws);
    expect(codigoCierre).toBe(4040);
  });

  it('rechaza unirse a una sala ya llena con cierre 4090', async () => {
    const ws1 = await conectar('crear', 'CODIGO03');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'CODIGO03');
    await esperarMensajeDeTipo(ws2, 'conectado');

    const ws3 = await conectar('unirse', 'CODIGO03');
    const codigoCierre = await esperarCierre(ws3);
    expect(codigoCierre).toBe(4090);
  });

  it('retransmite un mensaje de un jugador al otro', async () => {
    const ws1 = await conectar('crear', 'CODIGO04');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'CODIGO04');
    await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws1.send(JSON.stringify({ tipo: 'movimiento', payload: 4 }));
    const recibido = await esperarMensajeDeTipo(ws2, 'movimiento');
    expect(recibido).toEqual({ tipo: 'movimiento', payload: 4 });
  });

  it('avisa al rival cuando un jugador se desconecta', async () => {
    const ws1 = await conectar('crear', 'CODIGO05');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'CODIGO05');
    await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws2.close();
    const aviso = await esperarMensajeDeTipo(ws1, 'rival-desconectado');
    expect(aviso).toEqual({ tipo: 'rival-desconectado' });
  });
});
```

Si algún test falla por estado cruzado entre tests (en vez de por la lógica de `Room` en sí), repórtalo en vez de agregar limpieza de storage no especificada aquí (p. ej. `beforeEach`) — los códigos únicos por test ya deberían bastar dado que cada uno direcciona a una instancia de Durable Object distinta.

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd worker && npm test -- room`
Expected: FAIL — `worker/src/room.ts` no existe (y `wrangler.toml` puede necesitar el binding descomentado, ver Step 4).

- [ ] **Step 3: Implementación**

`worker/src/room.ts`:

```ts
import type { Env } from './index';
import { ICE_SERVERS_STUN_FALLBACK, obtenerCredencialesTurn } from './turn';

const EXPIRACION_MS = 10 * 60 * 1000;

type Asiento = 1 | 2;

export class Room {
  private sockets = new Map<Asiento, WebSocket>();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Se esperaba una conexión WebSocket', { status: 426 });
    }

    const url = new URL(request.url);
    const rol = url.searchParams.get('rol');
    const codigo = url.searchParams.get('codigo') ?? '';

    const par = new WebSocketPair();
    const cliente = par[0];
    const servidor = par[1];
    servidor.accept();

    if (rol === 'unirse') {
      const creadaEn = await this.state.storage.get<number>('creadaEn');
      const ahora = Date.now();

      // `!this.sockets.has(1)` cuenta como código inválido, no como sala
      // llena: si el creador no está conectado (nunca lo estuvo en esta
      // instancia del Durable Object, o se desconectó), no hay con quién
      // jugar. Nota de limitación conocida y aceptada: `sockets` vive sólo
      // en memoria, así que si el Durable Object se recicla entre que el
      // creador se conecta y el segundo jugador se une, esta instancia
      // despierta con `creadaEn` en el storage pero `sockets` vacío, y un
      // jugador que se una en ese momento recibe "código inválido" aunque
      // el creador siga con su pestaña abierta. Aceptado deliberadamente
      // (coherente con "sin reconexión, sin persistencia" — sección 2 del
      // spec) en vez de agregar la Hibernation API de WebSockets, fuera de
      // alcance de este plan.
      if (!creadaEn || ahora - creadaEn >= EXPIRACION_MS || !this.sockets.has(1)) {
        servidor.close(4040, 'codigo-invalido');
        return new Response(null, { status: 101, webSocket: cliente });
      }
      if (this.sockets.has(2)) {
        servidor.close(4090, 'sala-llena');
        return new Response(null, { status: 101, webSocket: cliente });
      }

      this.registrarConexion(servidor, 2, codigo);
      await this.completarSala();
      return new Response(null, { status: 101, webSocket: cliente });
    }

    // rol === 'crear'
    await this.state.storage.put('creadaEn', Date.now());
    this.sockets.clear();
    this.registrarConexion(servidor, 1, codigo);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  private registrarConexion(servidor: WebSocket, asiento: Asiento, codigo: string): void {
    this.sockets.set(asiento, servidor);

    servidor.addEventListener('message', evento => {
      this.retransmitir(asiento, evento.data as string);
    });

    servidor.addEventListener('close', () => {
      this.sockets.delete(asiento);
      this.enviarControl(asiento === 1 ? 2 : 1, { tipo: 'rival-desconectado' });
    });

    servidor.send(JSON.stringify({ tipo: 'conectado', asiento, codigo }));
  }

  private async completarSala(): Promise<void> {
    const iceServers = await obtenerCredencialesTurn(this.env).catch(() => ICE_SERVERS_STUN_FALLBACK);
    const mensajeIce = JSON.stringify({ tipo: 'ice-servers', iceServers });
    this.sockets.get(1)?.send(mensajeIce);
    this.sockets.get(2)?.send(mensajeIce);
    this.enviarControl(1, { tipo: 'rival-conectado' });
    this.enviarControl(2, { tipo: 'rival-conectado' });
  }

  private retransmitir(desde: Asiento, datos: string): void {
    const hacia = desde === 1 ? 2 : 1;
    this.sockets.get(hacia)?.send(datos);
  }

  private enviarControl(hacia: Asiento, mensaje: Record<string, unknown>): void {
    this.sockets.get(hacia)?.send(JSON.stringify(mensaje));
  }
}
```

- [ ] **Step 4: Conectar `Room` al Worker y confirmar el binding en `wrangler.toml`**

`worker/src/index.ts` — agregar el export de `Room` (el resto del archivo lo completa la Tarea 5):

```ts
export { Room } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('No encontrado', { status: 404 });
  },
};
```

Confirma que `worker/wrangler.toml` tiene el bloque `[[durable_objects.bindings]]` y `[[migrations]]` de la Tarea 1 sin comentar.

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd worker && npm test -- room`
Expected: PASS (los 6 tests)

- [ ] **Step 6: Commit**

```bash
cd worker && git add -A
git commit -m "feat: Durable Object Room con señalización, expiración y relay"
```

---

## Task 5: Endpoint HTTP del Worker (`/crear`, `/unirse`) + test de extremo a extremo

**Files:**
- Modify: `worker/src/index.ts`
- Test: `worker/test/index.test.ts` (reemplaza el smoke test de la Tarea 1)

**Interfaces:**
- Produces: `GET /crear` y `GET /unirse?codigo=XXX` (ambos esperan `Upgrade: websocket`), que enrutan al `Room` correspondiente por código.

- [ ] **Step 1: Escribir el test que falla primero**

Reemplaza `worker/test/index.test.ts`:

Nota de diseño (corregida tras la Tarea 4): el helper de espera de mensajes usa un patrón de "buzón" persistente por socket — un único listener se adjunta al conectar, y cada mensaje entrante resuelve la espera pendiente de su tipo o queda guardado en un buffer si nadie lo está esperando todavía. La Tarea 4 encontró que un helper que agrega/quita el listener en cada espera (`addEventListener(..., {once:true})`) **pierde mensajes** que llegan en la ventana entre dos `await`s — en particular, `Room.completarSala()` envía `ice-servers` y `rival-conectado` a ambos sockets de forma síncrona apenas se conecta el segundo jugador, antes de que el test tenga oportunidad de registrar el siguiente listener. Usa el mismo patrón aquí.

```ts
import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

interface Buzon {
  mensajes: any[];
  esperas: Array<{ tipo: string; resolver: (mensaje: any) => void }>;
}

const buzones = new WeakMap<WebSocket, Buzon>();

function conectar(path: string): Promise<WebSocket> {
  return SELF.fetch(`https://ejemplo.test${path}`, {
    headers: { Upgrade: 'websocket' },
  }).then(respuesta => {
    const ws = respuesta.webSocket!;
    ws.accept();
    adjuntarBuzon(ws);
    return ws;
  });
}

function adjuntarBuzon(ws: WebSocket): void {
  const buzon: Buzon = { mensajes: [], esperas: [] };
  buzones.set(ws, buzon);
  ws.addEventListener('message', evento => {
    const mensaje = JSON.parse(evento.data as string);
    const indice = buzon.esperas.findIndex(e => e.tipo === mensaje.tipo);
    if (indice >= 0) {
      const [espera] = buzon.esperas.splice(indice, 1);
      espera.resolver(mensaje);
    } else {
      buzon.mensajes.push(mensaje);
    }
  });
}

function esperarMensajeDeTipo(ws: WebSocket, tipo: string): Promise<any> {
  const buzon = buzones.get(ws)!;
  const indice = buzon.mensajes.findIndex(m => m.tipo === tipo);
  if (indice >= 0) {
    const [mensaje] = buzon.mensajes.splice(indice, 1);
    return Promise.resolve(mensaje);
  }
  return new Promise(resolve => {
    buzon.esperas.push({ tipo, resolver: resolve });
  });
}

describe('Worker — flujo completo crear/unirse', () => {
  it('responde 404 a una ruta desconocida', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/lo-que-sea');
    expect(respuesta.status).toBe(404);
  });

  it('responde 400 a /unirse sin código', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/unirse', {
      headers: { Upgrade: 'websocket' },
    });
    expect(respuesta.status).toBe(400);
  });

  it('/crear seguido de /unirse con ese código conecta a los dos jugadores', async () => {
    const ws1 = await conectar('/crear');
    const { codigo } = await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar(`/unirse?codigo=${codigo}`);
    const conectado2 = await esperarMensajeDeTipo(ws2, 'conectado');
    expect(conectado2.asiento).toBe(2);

    ws1.send(JSON.stringify({ tipo: 'movimiento', payload: 7 }));
    const recibido = await esperarMensajeDeTipo(ws2, 'movimiento');
    expect(recibido).toEqual({ tipo: 'movimiento', payload: 7 });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd worker && npm test -- index`
Expected: FAIL — `/crear` y `/unirse` todavía devuelven 404.

- [ ] **Step 3: Implementación**

`worker/src/index.ts` (versión completa):

```ts
export { Room } from './room';
import { generarCodigoSala } from './roomCode';

export interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/crear') {
      return derivarASala(request, env, 'crear', generarCodigoSala());
    }

    if (url.pathname === '/unirse') {
      const codigo = url.searchParams.get('codigo');
      if (!codigo) {
        return new Response('Falta el código de sala', { status: 400 });
      }
      return derivarASala(request, env, 'unirse', codigo);
    }

    return new Response('No encontrado', { status: 404 });
  },
};

function derivarASala(request: Request, env: Env, rol: 'crear' | 'unirse', codigo: string): Promise<Response> {
  const id = env.ROOMS.idFromName(codigo);
  const stub = env.ROOMS.get(id);
  const url = new URL(request.url);
  url.pathname = '/conectar';
  url.searchParams.set('rol', rol);
  url.searchParams.set('codigo', codigo);
  return stub.fetch(new Request(url, request));
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd worker && npm test`
Expected: PASS — todos los tests del Worker (Tareas 2-5) en verde.

- [ ] **Step 5: Commit**

```bash
cd worker && git add -A
git commit -m "feat: endpoints /crear y /unirse del Worker de señalización"
```

---

## Task 6: Deploy del Worker (dominio, CI, secretos)

**Files:**
- Modify: `worker/wrangler.toml`
- Modify: `.github/workflows/deploy.yml`

**Interfaces:**
- Produces: el Worker desplegado y accesible en `https://signal.games.cardila.com`, con `TURN_KEY_ID`/`TURN_KEY_API_TOKEN` configurados como secretos del Worker.

- [ ] **Step 1: Agregar la ruta de dominio a `worker/wrangler.toml`**

```toml
routes = [
  { pattern = "signal.games.cardila.com", custom_domain = true }
]
```

(Se agrega al final del archivo existente, sin tocar el resto.)

- [ ] **Step 2: Paso manual único — habilitar Cloudflare Realtime y crear la TURN key**

Antes del primer deploy: en el dashboard de Cloudflare, sección **Realtime → TURN**, crear una TURN key. Anotar el `TURN_KEY_ID` (aparece en el dashboard) y el `TURN_KEY_API_TOKEN` (token generado al crear la key, solo se muestra una vez).

- [ ] **Step 3: Configurar los secretos del Worker (una sola vez, no en CI)**

Run (desde `worker/`, con `wrangler` ya autenticado como se documenta en `pencilgames-status` — misma cuenta que ya usa `wrangler` para Pages):

```bash
cd worker
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
```

(Cada comando pide el valor por stdin de forma interactiva; los secretos quedan guardados del lado de Cloudflare, no en el repo.)

- [ ] **Step 4: Agregar el job de deploy del Worker a `.github/workflows/deploy.yml`**

Modificar el step de build del job `deploy` existente para pasar la URL pública del Worker al build de Astro, y agregar un job nuevo `deploy-worker`:

```yaml
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

(El primer bloque reemplaza el `- run: npm ci` / `- run: npm run build` existentes dentro del job `deploy`; el segundo bloque, `deploy-worker`, se agrega como job nuevo al mismo nivel que `deploy`.)

- [ ] **Step 5: Verificación manual antes de commitear**

Run: `cd worker && npx wrangler deploy --dry-run`
Expected: build exitoso, sin errores de configuración (confirma que `wrangler.toml` es válido antes de depender de CI).

- [ ] **Step 6: Commit**

```bash
git add worker/wrangler.toml .github/workflows/deploy.yml
git commit -m "ci: desplegar el Worker de señalización junto al sitio"
```

---

## Task 7: Cliente — tipos de transporte y `CanalWebRTC`

**Files:**
- Create: `src/lib/remoto/types.ts`
- Create: `src/lib/remoto/canalWebRTC.ts`
- Test: `src/lib/remoto/canalWebRTC.test.ts`

**Interfaces:**
- Produces: `EstadoConexion`, `MensajeJuego`, `MoveChannel`, `ErrorSala` (en `types.ts`); `CanalWebRTC` con `static crear(workerUrl): Promise<{channel, codigo}>` y `static unirse(workerUrl, codigo): Promise<CanalWebRTC>`, implementando `MoveChannel`.

- [ ] **Step 1: Crear `src/lib/remoto/types.ts`**

```ts
export type EstadoConexion = 'conectando' | 'conectado' | 'desconectado';

export type MensajeJuego =
  | { tipo: 'nombre'; nombre: string }
  | { tipo: 'movimiento'; payload: unknown }
  | { tipo: 'reiniciar' };

export interface MoveChannel {
  readonly asiento: 1 | 2;
  estado: EstadoConexion;
  enviar(mensaje: MensajeJuego): void;
  alRecibir(callback: (mensaje: MensajeJuego) => void): void;
  alCambiarEstado(callback: (estado: EstadoConexion) => void): void;
}

export class ErrorSala extends Error {
  constructor(
    public readonly codigo: 'invalido' | 'llena' | 'conexion',
    mensaje: string
  ) {
    super(mensaje);
    this.name = 'ErrorSala';
  }
}
```

- [ ] **Step 2: Escribir los tests que fallan primero**

`src/lib/remoto/canalWebRTC.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanalWebRTC } from './canalWebRTC';

class WebSocketFalso {
  static instancias: WebSocketFalso[] = [];
  listeners: Record<string, Array<(e: any) => void>> = {};
  enviados: string[] = [];
  constructor(public url: string) {
    WebSocketFalso.instancias.push(this);
  }
  addEventListener(tipo: string, cb: (e: any) => void) {
    (this.listeners[tipo] ??= []).push(cb);
  }
  removeEventListener(tipo: string, cb: (e: any) => void) {
    this.listeners[tipo] = (this.listeners[tipo] ?? []).filter(f => f !== cb);
  }
  send(datos: string) {
    this.enviados.push(datos);
  }
  emitirMensaje(datos: unknown) {
    for (const cb of this.listeners['message'] ?? []) cb({ data: JSON.stringify(datos) });
  }
  emitirCierre(code: number) {
    for (const cb of this.listeners['close'] ?? []) cb({ code });
  }
}

class RTCDataChannelFalso {
  readyState: 'connecting' | 'open' | 'closed' = 'connecting';
  listeners: Record<string, Array<(e: any) => void>> = {};
  addEventListener(tipo: string, cb: (e: any) => void) {
    (this.listeners[tipo] ??= []).push(cb);
  }
  send(_datos: string) {}
}

class RTCPeerConnectionFalso {
  onicecandidate: ((e: any) => void) | null = null;
  ondatachannel: ((e: any) => void) | null = null;
  createDataChannel(_nombre: string) {
    return new RTCDataChannelFalso();
  }
  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'oferta-falsa' });
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'respuesta-falsa' });
  }
  setLocalDescription(_desc: any) {
    return Promise.resolve();
  }
  setRemoteDescription(_desc: any) {
    return Promise.resolve();
  }
  addIceCandidate(_c: any) {
    return Promise.resolve();
  }
}
```

Nota: este fake ahora cubre tanto el camino del asiento 1 (`createOffer`/`createDataChannel`) como el del asiento 2 (`createAnswer`/`ondatachannel`), aunque los tests de arriba solo ejercitan el camino del asiento 1 — se agregó `createAnswer`/`ondatachannel` de forma preventiva porque `CanalWebRTC.responderOferta()` (Step 4) los invoca, y un fake incompleto rompería cualquier test o ronda de fixes que sí ejercite ese camino.

```ts

beforeEach(() => {
  WebSocketFalso.instancias.length = 0;
  vi.stubGlobal('WebSocket', WebSocketFalso);
  vi.stubGlobal('RTCPeerConnection', RTCPeerConnectionFalso);
});

describe('CanalWebRTC.crear / unirse', () => {
  it('crear() resuelve con el asiento y código que envía el servidor', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    WebSocketFalso.instancias[0].emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel, codigo } = await promesa;
    expect(codigo).toBe('ABC123');
    expect(channel.asiento).toBe(1);
  });

  it('unirse() rechaza con ErrorSala("invalido") si el servidor cierra con 4040', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX');
    WebSocketFalso.instancias[0].emitirCierre(4040);
    await expect(promesa).rejects.toMatchObject({ codigo: 'invalido' });
  });

  it('unirse() rechaza con ErrorSala("llena") si el servidor cierra con 4090', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX');
    WebSocketFalso.instancias[0].emitirCierre(4090);
    await expect(promesa).rejects.toMatchObject({ codigo: 'llena' });
  });
});

describe('CanalWebRTC — envío de mensajes', () => {
  it('usa el WebSocket para enviar mientras el data channel no está abierto', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    channel.enviar({ tipo: 'movimiento', payload: 4 });

    expect(ws.enviados.some(m => JSON.parse(m).tipo === 'movimiento')).toBe(true);
  });

  it('entrega al callback de alRecibir un mensaje de juego llegado por el WebSocket', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    const recibidos: unknown[] = [];
    channel.alRecibir(m => recibidos.push(m));
    ws.emitirMensaje({ tipo: 'movimiento', payload: 9 });

    expect(recibidos).toEqual([{ tipo: 'movimiento', payload: 9 }]);
  });
});

describe('CanalWebRTC — desconexión', () => {
  it('cambia a estado desconectado cuando llega rival-desconectado', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));
    ws.emitirMensaje({ tipo: 'rival-desconectado' });

    expect(estados).toEqual(['desconectado']);
  });
});

describe('CanalWebRTC — fallback a relay tras timeout', () => {
  it('pasa a conectado por relay si el data channel no abre en 15s', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));

    ws.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    ws.emitirMensaje({ tipo: 'rival-conectado' });
    await vi.runOnlyPendingTimersAsync();

    vi.advanceTimersByTime(15000);

    expect(estados).toContain('conectado');
    vi.useRealTimers();
  });
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: `npm test -- canalWebRTC`
Expected: FAIL — `src/lib/remoto/canalWebRTC.ts` no existe.

- [ ] **Step 4: Implementación**

`src/lib/remoto/canalWebRTC.ts`:

```ts
import type { EstadoConexion, MensajeJuego, MoveChannel } from './types';
import { ErrorSala } from './types';

const ICE_SERVERS_INICIALES: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const TIMEOUT_DATACHANNEL_MS = 15000;

type MensajeControl =
  | { tipo: 'conectado'; asiento: 1 | 2; codigo: string }
  | { tipo: 'rival-conectado' }
  | { tipo: 'rival-desconectado' }
  | { tipo: 'ice-servers'; iceServers: RTCIceServer[] }
  | { tipo: 'oferta'; sdp: string }
  | { tipo: 'respuesta'; sdp: string }
  | { tipo: 'ice'; candidate: RTCIceCandidateInit };

const TIPOS_CONTROL = new Set([
  'conectado',
  'rival-conectado',
  'rival-desconectado',
  'ice-servers',
  'oferta',
  'respuesta',
  'ice',
]);

function esperarConectado(ws: WebSocket): Promise<{ asiento: 1 | 2; codigo: string }> {
  return new Promise((resolve, reject) => {
    const limpiar = () => {
      ws.removeEventListener('message', alMensaje);
      ws.removeEventListener('close', alCerrar);
      ws.removeEventListener('error', alError);
    };
    const alMensaje = (evento: MessageEvent) => {
      const mensaje = JSON.parse(evento.data as string) as MensajeControl;
      if (mensaje.tipo === 'conectado') {
        limpiar();
        resolve({ asiento: mensaje.asiento, codigo: mensaje.codigo });
      }
    };
    const alCerrar = (evento: CloseEvent) => {
      limpiar();
      if (evento.code === 4040) reject(new ErrorSala('invalido', 'Ese código no es válido'));
      else if (evento.code === 4090) reject(new ErrorSala('llena', 'Esa sala ya está llena'));
      else reject(new ErrorSala('conexion', 'No pudimos conectar'));
    };
    const alError = () => {
      limpiar();
      reject(new ErrorSala('conexion', 'No pudimos conectar'));
    };
    ws.addEventListener('message', alMensaje);
    ws.addEventListener('close', alCerrar);
    ws.addEventListener('error', alError);
  });
}

export class CanalWebRTC implements MoveChannel {
  estado: EstadoConexion = 'conectando';
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private usaRelay = false;
  private rivalConectado = false;
  private iceServers: RTCIceServer[] = ICE_SERVERS_INICIALES;
  private callbacksMensaje: Array<(m: MensajeJuego) => void> = [];
  private callbacksEstado: Array<(e: EstadoConexion) => void> = [];
  private timeoutFallback: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    public readonly asiento: 1 | 2,
    private readonly ws: WebSocket
  ) {
    this.ws.addEventListener('message', evento => this.alMensajeWs(evento as MessageEvent));
    this.ws.addEventListener('close', () => this.cambiarEstado('desconectado'));
  }

  static async crear(workerUrl: string): Promise<{ channel: CanalWebRTC; codigo: string }> {
    const ws = new WebSocket(`${workerUrl}/crear`);
    const { asiento, codigo } = await esperarConectado(ws);
    return { channel: new CanalWebRTC(asiento, ws), codigo };
  }

  static async unirse(workerUrl: string, codigo: string): Promise<CanalWebRTC> {
    const ws = new WebSocket(`${workerUrl}/unirse?codigo=${encodeURIComponent(codigo)}`);
    const { asiento } = await esperarConectado(ws);
    return new CanalWebRTC(asiento, ws);
  }

  enviar(mensaje: MensajeJuego): void {
    const datos = JSON.stringify(mensaje);
    if (!this.usaRelay && this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(datos);
    } else {
      this.ws.send(datos);
    }
  }

  alRecibir(callback: (mensaje: MensajeJuego) => void): void {
    this.callbacksMensaje.push(callback);
  }

  alCambiarEstado(callback: (estado: EstadoConexion) => void): void {
    this.callbacksEstado.push(callback);
  }

  private cambiarEstado(estado: EstadoConexion): void {
    if (this.estado === estado) return;
    this.estado = estado;
    for (const callback of this.callbacksEstado) callback(estado);
  }

  private alMensajeWs(evento: MessageEvent): void {
    const mensaje = JSON.parse(evento.data as string);
    if (!TIPOS_CONTROL.has(mensaje.tipo)) {
      this.recibirMensajeJuego(mensaje as MensajeJuego);
      return;
    }
    this.alMensajeControl(mensaje as MensajeControl);
  }

  private alMensajeControl(mensaje: MensajeControl): void {
    switch (mensaje.tipo) {
      case 'ice-servers':
        this.iceServers = mensaje.iceServers;
        this.intentarIniciarNegociacion();
        break;
      case 'rival-conectado':
        this.rivalConectado = true;
        this.intentarIniciarNegociacion();
        break;
      case 'rival-desconectado':
        this.cambiarEstado('desconectado');
        break;
      case 'oferta':
        this.responderOferta(mensaje.sdp);
        break;
      case 'respuesta':
        this.pc?.setRemoteDescription({ type: 'answer', sdp: mensaje.sdp });
        break;
      case 'ice':
        this.pc?.addIceCandidate(mensaje.candidate).catch(() => {});
        break;
    }
  }

  private intentarIniciarNegociacion(): void {
    if (this.asiento !== 1 || !this.rivalConectado || this.pc) return;
    this.crearConexion();
    this.dataChannel = this.pc!.createDataChannel('juego');
    this.prepararDataChannel(this.dataChannel);

    this.pc!.createOffer()
      .then(oferta => this.pc!.setLocalDescription(oferta).then(() => oferta))
      .then(oferta => {
        this.ws.send(JSON.stringify({ tipo: 'oferta', sdp: oferta.sdp }));
      });

    this.iniciarTimeoutFallback();
  }

  private responderOferta(sdp: string): void {
    if (this.pc) return;
    this.crearConexion();
    this.pc!.ondatachannel = evento => {
      this.dataChannel = evento.channel;
      this.prepararDataChannel(this.dataChannel);
    };

    this.pc!.setRemoteDescription({ type: 'offer', sdp })
      .then(() => this.pc!.createAnswer())
      .then(respuesta => this.pc!.setLocalDescription(respuesta).then(() => respuesta))
      .then(respuesta => {
        this.ws.send(JSON.stringify({ tipo: 'respuesta', sdp: respuesta.sdp }));
      });

    this.iniciarTimeoutFallback();
  }

  private crearConexion(): void {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    pc.onicecandidate = evento => {
      if (evento.candidate) {
        this.ws.send(JSON.stringify({ tipo: 'ice', candidate: evento.candidate.toJSON() }));
      }
    };
    this.pc = pc;
  }

  private prepararDataChannel(canal: RTCDataChannel): void {
    canal.addEventListener('open', () => {
      if (this.timeoutFallback) clearTimeout(this.timeoutFallback);
      this.usaRelay = false;
      this.cambiarEstado('conectado');
    });
    canal.addEventListener('message', evento => {
      this.recibirMensajeJuego(JSON.parse((evento as MessageEvent).data as string));
    });
  }

  private iniciarTimeoutFallback(): void {
    this.timeoutFallback = setTimeout(() => {
      if (this.dataChannel?.readyState !== 'open') {
        this.usaRelay = true;
        this.cambiarEstado('conectado');
      }
    }, TIMEOUT_DATACHANNEL_MS);
  }

  private recibirMensajeJuego(mensaje: MensajeJuego): void {
    for (const callback of this.callbacksMensaje) callback(mensaje);
  }
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- canalWebRTC`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/remoto/types.ts src/lib/remoto/canalWebRTC.ts src/lib/remoto/canalWebRTC.test.ts
git commit -m "feat: CanalWebRTC (señalización, negociación P2P y fallback a relay)"
```

---

## Task 8: Cliente — API de sala (`crearSala`/`unirseASala`) y configuración de entorno

**Files:**
- Create: `src/lib/remoto/sala.ts`
- Create: `.env.example`
- Test: `src/lib/remoto/sala.test.ts`

**Interfaces:**
- Consumes: `CanalWebRTC` (de `./canalWebRTC`), `MoveChannel`/`ErrorSala` (de `./types`).
- Produces: `crearSala(workerUrl?: string): Promise<{channel: MoveChannel; codigo: string}>`, `unirseASala(codigo: string, workerUrl?: string): Promise<MoveChannel>`, re-exporta `ErrorSala`. Sin argumento, `workerUrl` se toma de `import.meta.env.PUBLIC_SIGNAL_WORKER_URL` (convertido de `http(s)` a `ws(s)`).

- [ ] **Step 1: Escribir los tests que fallan primero**

`src/lib/remoto/sala.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import * as canalWebRTC from './canalWebRTC';
import { crearSala, unirseASala } from './sala';

describe('crearSala', () => {
  it('delega en CanalWebRTC.crear con la URL dada', async () => {
    const resultadoFalso = { channel: {} as any, codigo: 'ABC123' };
    const espia = vi.spyOn(canalWebRTC.CanalWebRTC, 'crear').mockResolvedValue(resultadoFalso);

    const resultado = await crearSala('wss://ejemplo.test');

    expect(espia).toHaveBeenCalledWith('wss://ejemplo.test');
    expect(resultado).toBe(resultadoFalso);
    espia.mockRestore();
  });
});

describe('unirseASala', () => {
  it('delega en CanalWebRTC.unirse con la URL y el código dados', async () => {
    const canalFalso = {} as any;
    const espia = vi.spyOn(canalWebRTC.CanalWebRTC, 'unirse').mockResolvedValue(canalFalso);

    const resultado = await unirseASala('ABC123', 'wss://ejemplo.test');

    expect(espia).toHaveBeenCalledWith('wss://ejemplo.test', 'ABC123');
    expect(resultado).toBe(canalFalso);
    espia.mockRestore();
  });
});
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- sala.test`
Expected: FAIL — `src/lib/remoto/sala.ts` no existe.

- [ ] **Step 3: Implementación**

`src/lib/remoto/sala.ts`:

```ts
import { CanalWebRTC } from './canalWebRTC';
import type { MoveChannel } from './types';

export { ErrorSala } from './types';

function urlWorkerPorDefecto(): string {
  const url = import.meta.env.PUBLIC_SIGNAL_WORKER_URL;
  if (!url) {
    throw new Error('Falta configurar PUBLIC_SIGNAL_WORKER_URL');
  }
  return url.replace(/^http/, 'ws');
}

export async function crearSala(
  workerUrl: string = urlWorkerPorDefecto()
): Promise<{ channel: MoveChannel; codigo: string }> {
  return CanalWebRTC.crear(workerUrl);
}

export async function unirseASala(
  codigo: string,
  workerUrl: string = urlWorkerPorDefecto()
): Promise<MoveChannel> {
  return CanalWebRTC.unirse(workerUrl, codigo);
}
```

- [ ] **Step 4: Crear `.env.example` en la raíz del repo**

```
# URL pública del Worker de señalización (ver worker/, Tarea 6 del plan de
# juego remoto). En desarrollo local, corre `cd worker && npm run dev` y usa
# el puerto que muestre wrangler (por defecto 8787).
PUBLIC_SIGNAL_WORKER_URL=http://localhost:8787
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `npm test -- sala.test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/remoto/sala.ts src/lib/remoto/sala.test.ts .env.example
git commit -m "feat: API de sala (crearSala/unirseASala) y config de entorno"
```

---

## Task 9: Identidad propia, `ModalJuegoRemoto` y su punto de entrada en `[slug].astro`

**Files:**
- Create: `src/lib/miNombre.ts`
- Create: `src/components/ModalJuegoRemoto.astro`
- Modify: `src/pages/juegos/[slug].astro`
- Test: `src/lib/miNombre.test.ts`

**Interfaces:**
- Produces: `getMiNombre(): string | null`, `setMiNombre(nombre: string): void` (`miNombre.ts`). `ModalJuegoRemoto` dispara un `CustomEvent('canal-remoto-listo', { detail: { channel: MoveChannel; miNombre: string } })` sobre `document` cuando la conexión queda lista — este es el evento que consumen los `Board.astro` en las Tareas 10-12.

- [ ] **Step 1: Escribir el test que falla primero**

`src/lib/miNombre.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { getMiNombre, setMiNombre } from './miNombre';

describe('miNombre', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('sin nada guardado, devuelve null', () => {
    expect(getMiNombre()).toBeNull();
  });

  it('guarda y vuelve a leer el nombre, recortando espacios', () => {
    setMiNombre('  Ana  ');
    expect(getMiNombre()).toBe('Ana');
  });

  it('no guarda un nombre vacío tras recortar espacios', () => {
    setMiNombre('   ');
    expect(getMiNombre()).toBeNull();
  });
});
```

Nota: `vitest.config.ts` usa `environment: 'node'`, que no incluye `localStorage` global. Antes de este test corra en CI, confirma si `players.test.ts` (que sí necesita `localStorage`) lo resuelve con `vi.stubGlobal` — de ser así, sigue el mismo patrón aquí en vez de asumir un `localStorage` global:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMiNombre, setMiNombre } from './miNombre';

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

describe('miNombre', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage() as unknown as Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sin nada guardado, devuelve null', () => {
    expect(getMiNombre()).toBeNull();
  });

  it('guarda y vuelve a leer el nombre, recortando espacios', () => {
    setMiNombre('  Ana  ');
    expect(getMiNombre()).toBe('Ana');
  });

  it('no guarda un nombre vacío tras recortar espacios', () => {
    setMiNombre('   ');
    expect(getMiNombre()).toBeNull();
  });
});
```

Usa esta segunda versión (coincide con el patrón de `src/lib/players.test.ts`).

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- miNombre`
Expected: FAIL — el módulo no existe.

- [ ] **Step 3: Implementación de `src/lib/miNombre.ts`**

```ts
const STORAGE_KEY = 'pencilgames:mi-nombre';

export function getMiNombre(): string | null {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    return guardado?.trim() || null;
  } catch {
    return null;
  }
}

export function setMiNombre(nombre: string): void {
  const limpio = nombre.trim();
  if (!limpio) return;
  try {
    localStorage.setItem(STORAGE_KEY, limpio);
  } catch {
    // localStorage no disponible: no persiste, no rompe el flujo.
  }
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- miNombre`
Expected: PASS

- [ ] **Step 5: Crear `src/components/ModalJuegoRemoto.astro`**

```astro
<div
  id="modal-remoto"
  class="modal-remoto"
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-remoto-titulo"
  hidden
>
  <div class="modal-remoto__contenido">
    <h2 id="modal-remoto-titulo">Jugar por internet</h2>

    <div id="modal-remoto-elegir" class="modal-remoto__paso">
      <button type="button" id="modal-remoto-crear" class="modal-remoto__boton">Crear sala</button>
      <button type="button" id="modal-remoto-mostrar-unirse" class="modal-remoto__boton">
        Unirse con código
      </button>
    </div>

    <div id="modal-remoto-unirse" class="modal-remoto__paso" hidden>
      <label class="modal-remoto__campo">
        Código de sala
        <input
          type="text"
          id="modal-remoto-input-codigo"
          maxlength="6"
          placeholder="ABC123"
          autocapitalize="characters"
        />
      </label>
      <button type="button" id="modal-remoto-confirmar-unirse" class="modal-remoto__boton">
        Unirse
      </button>
    </div>

    <div id="modal-remoto-esperando" class="modal-remoto__paso" hidden>
      <p>Comparte este código con tu rival:</p>
      <p id="modal-remoto-codigo" class="modal-remoto__codigo"></p>
      <button type="button" id="modal-remoto-copiar" class="modal-remoto__boton">
        Copiar link para compartir
      </button>
      <p id="modal-remoto-estado">Esperando al otro jugador…</p>
    </div>

    <p id="modal-remoto-error" class="modal-remoto__error" hidden></p>
    <button type="button" id="modal-remoto-cerrar" class="modal-remoto__cerrar">Cancelar</button>
  </div>
</div>

<button type="button" id="modal-remoto-abrir" class="modal-remoto__abrir">🌐 Jugar por internet</button>

<style>
  .modal-remoto {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing);
    z-index: 20;
  }

  .modal-remoto[hidden] {
    display: none;
  }

  .modal-remoto__contenido {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    max-width: 24rem;
    width: 100%;
  }

  .modal-remoto__paso {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .modal-remoto__paso[hidden] {
    display: none;
  }

  .modal-remoto__campo {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-weight: 700;
  }

  .modal-remoto__campo input {
    padding: 0.75rem;
    font-size: 1.25rem;
    text-align: center;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    border-radius: var(--radius);
    border: 1px solid #ddd;
    min-height: var(--tap-target-min);
  }

  .modal-remoto__boton {
    padding: 0.75rem;
    border: none;
    border-radius: var(--radius);
    background: var(--color-accent);
    font-size: 1rem;
    font-weight: 700;
    min-height: var(--tap-target-min);
  }

  .modal-remoto__codigo {
    font-size: 2rem;
    font-weight: 700;
    text-align: center;
    letter-spacing: 0.2em;
  }

  .modal-remoto__error {
    margin-top: 1rem;
    color: #b00020;
    font-weight: 700;
  }

  .modal-remoto__error[hidden] {
    display: none;
  }

  .modal-remoto__cerrar {
    margin-top: 1rem;
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: var(--radius);
    background: var(--color-surface);
    min-height: var(--tap-target-min);
  }

  .modal-remoto__abrir {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border: 1px solid #ddd;
    border-radius: var(--radius);
    background: var(--color-surface);
    font-weight: 700;
    min-height: var(--tap-target-min);
  }
</style>

<script>
  import { crearSala, unirseASala, ErrorSala } from '../lib/remoto/sala';
  import { getMiNombre, setMiNombre } from '../lib/miNombre';
  import type { MoveChannel } from '../lib/remoto/types';

  const modal = document.getElementById('modal-remoto')!;
  const abrir = document.getElementById('modal-remoto-abrir')!;
  const cerrar = document.getElementById('modal-remoto-cerrar')!;
  const pasoElegir = document.getElementById('modal-remoto-elegir')!;
  const pasoUnirse = document.getElementById('modal-remoto-unirse')!;
  const pasoEsperando = document.getElementById('modal-remoto-esperando')!;
  const botonCrear = document.getElementById('modal-remoto-crear')!;
  const botonMostrarUnirse = document.getElementById('modal-remoto-mostrar-unirse')!;
  const botonConfirmarUnirse = document.getElementById('modal-remoto-confirmar-unirse')!;
  const inputCodigo = document.getElementById('modal-remoto-input-codigo') as HTMLInputElement;
  const codigoMostrado = document.getElementById('modal-remoto-codigo')!;
  const botonCopiar = document.getElementById('modal-remoto-copiar')!;
  const estadoTexto = document.getElementById('modal-remoto-estado')!;
  const errorTexto = document.getElementById('modal-remoto-error')!;

  function mostrarPaso(paso: HTMLElement): void {
    for (const p of [pasoElegir, pasoUnirse, pasoEsperando]) p.hidden = p !== paso;
    errorTexto.hidden = true;
  }

  function mostrarError(mensaje: string): void {
    errorTexto.textContent = mensaje;
    errorTexto.hidden = false;
  }

  function pedirMiNombreSiHaceFalta(): string {
    let nombre = getMiNombre();
    if (!nombre) {
      nombre = window.prompt('¿Cómo te llamas?')?.trim() || 'Jugador';
      setMiNombre(nombre);
    }
    return nombre;
  }

  function alConectar(channel: MoveChannel, miNombre: string): void {
    channel.enviar({ tipo: 'nombre', nombre: miNombre });
    modal.hidden = true;
    document.dispatchEvent(new CustomEvent('canal-remoto-listo', { detail: { channel, miNombre } }));
  }

  abrir.addEventListener('click', () => {
    mostrarPaso(pasoElegir);
    modal.hidden = false;
  });

  cerrar.addEventListener('click', () => {
    modal.hidden = true;
  });

  botonCrear.addEventListener('click', async () => {
    const miNombre = pedirMiNombreSiHaceFalta();
    try {
      const { channel, codigo } = await crearSala();
      mostrarPaso(pasoEsperando);
      codigoMostrado.textContent = codigo;
      channel.alCambiarEstado(estado => {
        if (estado === 'conectado') alConectar(channel, miNombre);
      });
    } catch (error) {
      mostrarError(error instanceof ErrorSala ? error.message : 'No pudimos conectar, intenten de nuevo.');
    }
  });

  botonMostrarUnirse.addEventListener('click', () => {
    mostrarPaso(pasoUnirse);
  });

  botonConfirmarUnirse.addEventListener('click', async () => {
    const miNombre = pedirMiNombreSiHaceFalta();
    const codigo = inputCodigo.value.trim().toUpperCase();
    try {
      const channel = await unirseASala(codigo);
      mostrarPaso(pasoEsperando);
      estadoTexto.textContent = 'Conectando…';
      channel.alCambiarEstado(estado => {
        if (estado === 'conectado') alConectar(channel, miNombre);
      });
    } catch (error) {
      mostrarError(error instanceof ErrorSala ? error.message : 'No pudimos conectar, intenten de nuevo.');
    }
  });

  botonCopiar.addEventListener('click', () => {
    const link = `${location.origin}${location.pathname}?sala=${codigoMostrado.textContent}`;
    navigator.clipboard?.writeText(link);
  });

  const parametros = new URLSearchParams(location.search);
  const codigoPrellenado = parametros.get('sala');
  if (codigoPrellenado) {
    inputCodigo.value = codigoPrellenado.toUpperCase();
    mostrarPaso(pasoUnirse);
    modal.hidden = false;
  }
</script>
```

- [ ] **Step 6: Registrar el componente en `src/pages/juegos/[slug].astro`**

Modificar el import y el `<header>`:

```ts
import ModalInstrucciones from '../../components/ModalInstrucciones.astro';
import ModalJuegoRemoto from '../../components/ModalJuegoRemoto.astro';
```

```astro
  <header class="cabecera-juego">
    <a href="/" class="cabecera-juego__volver">← Juegos</a>
    <h1 class="cabecera-juego__titulo">{juego.data.title}</h1>
    <ModalJuegoRemoto />
  </header>
  <ModalInstrucciones title={juego.data.title}>
    <Content />
  </ModalInstrucciones>
  <Board />
```

- [ ] **Step 7: Verificación manual**

Run: `npm run dev`, abrir cualquier página de juego y confirmar que el botón "🌐 Jugar por internet" aparece en la cabecera y abre el modal (crear/unirse todavía no conectarán de verdad sin el Worker corriendo — eso se verifica en la Tarea 13).

- [ ] **Step 8: Commit**

```bash
git add src/lib/miNombre.ts src/lib/miNombre.test.ts src/components/ModalJuegoRemoto.astro src/pages/juegos/[slug].astro
git commit -m "feat: modal de juego remoto (crear/unirse) y su punto de entrada"
```

---

## Task 10: Conectar modo remoto en Tres en raya

**Files:**
- Modify: `src/games/tres-en-raya/Board.astro`

**Interfaces:**
- Consumes: `MoveChannel`, `MensajeJuego` (de `../../lib/remoto/types`), evento `canal-remoto-listo` disparado por `ModalJuegoRemoto` (Tarea 9).

- [ ] **Step 1: Reemplazar el bloque `<script>` de `src/games/tres-en-raya/Board.astro`**

```ts
<script>
  import { createInitialState, playMove, type TresEnRayaState } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';
  import { getPlayerNames } from '../../lib/players';
  import type { MoveChannel, MensajeJuego } from '../../lib/remoto/types';

  const tablero = document.getElementById('tablero')!;
  const casillas = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.casilla'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;

  const ETIQUETAS = { X: '✕', O: '●' } as const;
  const nombres = getPlayerNames();

  let state: TresEnRayaState = createInitialState();
  let canal: MoveChannel | null = null;
  let miAsiento: 1 | 2 | null = null;

  function render(): void {
    casillas.forEach((casilla, i) => {
      const valor = state.board[i];
      casilla.textContent = valor ? ETIQUETAS[valor] : '';
      if (valor) {
        casilla.dataset.valor = valor;
      } else {
        delete casilla.dataset.valor;
      }
      const jugadorDelTurno = state.currentPlayer === 'X' ? 1 : 2;
      const noEsMiTurno = miAsiento !== null && jugadorDelTurno !== miAsiento;
      casilla.disabled = valor !== null || state.status !== 'playing' || noEsMiTurno;
      casilla.classList.toggle('casilla--ganadora', state.winningLine?.includes(i) ?? false);
    });

    if (state.status === 'playing') {
      const jugador = state.currentPlayer === 'X' ? 1 : 2;
      renderTurnIndicator(indicadorTurno, {
        jugador,
        etiqueta: `${nombres[jugador]} (${ETIQUETAS[state.currentPlayer]})`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      showWinnerBanner(bannerGanador, {
        titulo:
          state.status === 'won'
            ? `🎉 ¡Ganó ${nombres[state.winner === 'X' ? 1 : 2]} (${ETIQUETAS[state.winner!]})!`
            : '🤝 ¡Empate!',
        onReiniciar: reiniciar,
      });
    }
  }

  function aplicarReinicio(): void {
    state = createInitialState();
    render();
  }

  function reiniciar(): void {
    aplicarReinicio();
    canal?.enviar({ tipo: 'reiniciar' });
  }

  function jugar(indice: number): void {
    state = playMove(state, indice);
    render();
  }

  casillas.forEach((casilla, i) => {
    casilla.addEventListener('click', () => {
      jugar(i);
      canal?.enviar({ tipo: 'movimiento', payload: i });
    });
  });

  document.addEventListener('canal-remoto-listo', evento => {
    const detalle = (evento as CustomEvent<{ channel: MoveChannel; miNombre: string }>).detail;
    canal = detalle.channel;
    miAsiento = canal.asiento;
    nombres[miAsiento] = detalle.miNombre;

    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        jugar(mensaje.payload as number);
      } else if (mensaje.tipo === 'nombre') {
        nombres[miAsiento === 1 ? 2 : 1] = mensaje.nombre;
        render();
      } else if (mensaje.tipo === 'reiniciar') {
        aplicarReinicio();
      }
    });

    canal.alCambiarEstado(estado => {
      if (estado === 'desconectado') {
        ocultarTurnIndicator(indicadorTurno);
        showWinnerBanner(bannerGanador, {
          titulo: '📡 Tu rival se desconectó',
          onReiniciar: () => location.reload(),
        });
        casillas.forEach(casilla => (casilla.disabled = true));
      }
    });

    render();
  });

  render();
</script>
```

- [ ] **Step 2: Verificar que los tests existentes del engine siguen pasando (no debieran verse afectados)**

Run: `npm test -- tres-en-raya`
Expected: PASS (sin cambios — `engine.ts`/`engine.test.ts` no se tocan)

- [ ] **Step 3: Verificación manual (modo local, sin conexión remota)**

Run: `npm run dev`, abrir `/juegos/tres-en-raya` y jugar una partida completa en modo local (sin pulsar "Jugar por internet"). Confirmar que se comporta exactamente igual que antes (gating por asiento no aplica si `miAsiento` es `null`).

- [ ] **Step 4: Commit**

```bash
git add src/games/tres-en-raya/Board.astro
git commit -m "feat: modo remoto en tres en raya"
```

---

## Task 11: Conectar modo remoto en Puntos y cajas

**Files:**
- Modify: `src/games/puntos-y-cajas/Board.astro`

**Interfaces:**
- Consumes: igual que la Tarea 10. `payload` del mensaje `"movimiento"` es un `LineId` (`{type: 'h'|'v', row, col}`), no un `number`.

- [ ] **Step 1: Reemplazar el bloque `<script>` de `src/games/puntos-y-cajas/Board.astro`**

```ts
<script>
  import { createInitialState, playLine, type PuntosYCajasState, type LineId } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';
  import { getPlayerNames } from '../../lib/players';
  import type { MoveChannel, MensajeJuego } from '../../lib/remoto/types';

  const tablero = document.getElementById('tablero')!;
  const lineas = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.linea'));
  const cajas = Array.from(tablero.querySelectorAll<HTMLElement>('.caja'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;
  const nombres = getPlayerNames();

  let state: PuntosYCajasState = createInitialState(4);
  let canal: MoveChannel | null = null;
  let miAsiento: 1 | 2 | null = null;

  function render(): void {
    const noEsMiTurno = miAsiento !== null && state.currentPlayer !== miAsiento;

    for (const linea of lineas) {
      const tipo = linea.dataset.tipo as 'h' | 'v';
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      const trazada = tipo === 'h' ? state.horizontalLines[fila][columna] : state.verticalLines[fila][columna];
      linea.dataset.trazada = String(trazada);
      linea.disabled = trazada || state.status !== 'playing' || noEsMiTurno;
    }

    for (const caja of cajas) {
      const fila = Number(caja.dataset.fila);
      const columna = Number(caja.dataset.columna);
      const dueno = state.boxOwners[fila][columna];
      if (dueno) {
        caja.dataset.jugador = String(dueno);
        caja.textContent = dueno === 1 ? '●' : '■';
      } else {
        delete caja.dataset.jugador;
        caja.textContent = '';
      }
    }

    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: nombres[state.currentPlayer],
        detalle: `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      showWinnerBanner(bannerGanador, {
        titulo: ganador ? `🎉 ¡Ganó ${nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${nombres[1]} ${state.scores[1]} · ${nombres[2]} ${state.scores[2]}`,
        onReiniciar: reiniciar,
      });
    }
  }

  function aplicarReinicio(): void {
    state = createInitialState(4);
    render();
  }

  function reiniciar(): void {
    aplicarReinicio();
    canal?.enviar({ tipo: 'reiniciar' });
  }

  function jugar(line: LineId): void {
    state = playLine(state, line);
    render();
  }

  for (const linea of lineas) {
    linea.addEventListener('click', () => {
      const tipo = linea.dataset.tipo as LineId['type'];
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      const line: LineId = { type: tipo, row: fila, col: columna };
      jugar(line);
      canal?.enviar({ tipo: 'movimiento', payload: line });
    });
  }

  document.addEventListener('canal-remoto-listo', evento => {
    const detalle = (evento as CustomEvent<{ channel: MoveChannel; miNombre: string }>).detail;
    canal = detalle.channel;
    miAsiento = canal.asiento;
    nombres[miAsiento] = detalle.miNombre;

    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        jugar(mensaje.payload as LineId);
      } else if (mensaje.tipo === 'nombre') {
        nombres[miAsiento === 1 ? 2 : 1] = mensaje.nombre;
        render();
      } else if (mensaje.tipo === 'reiniciar') {
        aplicarReinicio();
      }
    });

    canal.alCambiarEstado(estado => {
      if (estado === 'desconectado') {
        ocultarTurnIndicator(indicadorTurno);
        showWinnerBanner(bannerGanador, {
          titulo: '📡 Tu rival se desconectó',
          onReiniciar: () => location.reload(),
        });
        for (const linea of lineas) linea.disabled = true;
      }
    });

    render();
  });

  render();
</script>
```

- [ ] **Step 2: Verificar que los tests existentes del engine siguen pasando**

Run: `npm test -- puntos-y-cajas`
Expected: PASS

- [ ] **Step 3: Verificación manual (modo local)**

Run: `npm run dev`, jugar una partida completa en `/juegos/puntos-y-cajas` sin modo remoto, confirmando en particular que el turno extra al completar una caja se sigue comportando igual (el gating usa `state.currentPlayer` directamente, así que no debería romperse).

- [ ] **Step 4: Commit**

```bash
git add src/games/puntos-y-cajas/Board.astro
git commit -m "feat: modo remoto en puntos y cajas"
```

---

## Task 12: Conectar modo remoto en Agujero Negro

**Files:**
- Modify: `src/games/agujero-negro/Board.astro`

**Interfaces:**
- Consumes: igual que la Tarea 10. `payload` del mensaje `"movimiento"` es un `number` (`positionId`).

- [ ] **Step 1: Reemplazar el bloque `<script>` de `src/games/agujero-negro/Board.astro`**

```ts
<script>
  import { createInitialState, placeNumber, type AgujeroNegroState } from './engine';
  import { renderTurnIndicator, ocultarTurnIndicator } from '../../lib/turnIndicator';
  import { showWinnerBanner, hideWinnerBanner } from '../../lib/winnerBanner';
  import { getPlayerNames } from '../../lib/players';
  import type { MoveChannel, MensajeJuego } from '../../lib/remoto/types';

  const tablero = document.getElementById('tablero')!;
  const posiciones = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.posicion-an'));
  const indicadorTurno = document.getElementById('indicador-turno')!;
  const bannerGanador = document.getElementById('banner-ganador')!;
  const nombres = getPlayerNames();

  let state: AgujeroNegroState = createInitialState();
  let canal: MoveChannel | null = null;
  let miAsiento: 1 | 2 | null = null;

  function render(): void {
    const noEsMiTurno = miAsiento !== null && state.currentPlayer !== miAsiento;

    for (const boton of posiciones) {
      const id = Number(boton.dataset.id);
      const celda = state.cells.find(c => c.id === id)!;

      boton.textContent = celda.value !== null ? String(celda.value) : '';
      if (celda.player) {
        boton.dataset.jugador = String(celda.player);
      } else {
        delete boton.dataset.jugador;
      }
      boton.dataset.agujero = String(state.blackHole === id);
      boton.dataset.destruida = String(state.destroyedCells.includes(id));
      boton.disabled = celda.value !== null || state.status !== 'playing' || noEsMiTurno;
    }

    if (state.status === 'playing') {
      renderTurnIndicator(indicadorTurno, {
        jugador: state.currentPlayer,
        etiqueta: nombres[state.currentPlayer],
        detalle: `Coloca el número ${state.nextValue[state.currentPlayer]}`,
      });
      hideWinnerBanner(bannerGanador);
    } else {
      ocultarTurnIndicator(indicadorTurno);
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      showWinnerBanner(bannerGanador, {
        titulo: ganador ? `🎉 ¡Ganó ${nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${nombres[1]}: ${state.scores[1]} puntos · ${nombres[2]}: ${state.scores[2]} puntos`,
        onReiniciar: reiniciar,
      });
    }
  }

  function aplicarReinicio(): void {
    state = createInitialState();
    render();
  }

  function reiniciar(): void {
    aplicarReinicio();
    canal?.enviar({ tipo: 'reiniciar' });
  }

  function jugar(id: number): void {
    state = placeNumber(state, id);
    render();
  }

  for (const boton of posiciones) {
    boton.addEventListener('click', () => {
      const id = Number(boton.dataset.id);
      jugar(id);
      canal?.enviar({ tipo: 'movimiento', payload: id });
    });
  }

  document.addEventListener('canal-remoto-listo', evento => {
    const detalle = (evento as CustomEvent<{ channel: MoveChannel; miNombre: string }>).detail;
    canal = detalle.channel;
    miAsiento = canal.asiento;
    nombres[miAsiento] = detalle.miNombre;

    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        jugar(mensaje.payload as number);
      } else if (mensaje.tipo === 'nombre') {
        nombres[miAsiento === 1 ? 2 : 1] = mensaje.nombre;
        render();
      } else if (mensaje.tipo === 'reiniciar') {
        aplicarReinicio();
      }
    });

    canal.alCambiarEstado(estado => {
      if (estado === 'desconectado') {
        ocultarTurnIndicator(indicadorTurno);
        showWinnerBanner(bannerGanador, {
          titulo: '📡 Tu rival se desconectó',
          onReiniciar: () => location.reload(),
        });
        for (const boton of posiciones) boton.disabled = true;
      }
    });

    render();
  });

  render();
</script>
```

- [ ] **Step 2: Verificar que los tests existentes del engine siguen pasando**

Run: `npm test -- agujero-negro`
Expected: PASS

- [ ] **Step 3: Verificación manual (modo local)**

Run: `npm run dev`, jugar una partida completa en `/juegos/agujero-negro` sin modo remoto.

- [ ] **Step 4: Commit**

```bash
git add src/games/agujero-negro/Board.astro
git commit -m "feat: modo remoto en agujero negro"
```

---

## Task 13: Verificación de extremo a extremo, README y cierre

**Files:**
- Modify: `README.md`

**Interfaces:**
- N/A — tarea de verificación manual y documentación, no agrega código nuevo.

- [ ] **Step 1: Levantar el Worker localmente**

Run: `cd worker && npm run dev`
Expected: `wrangler dev` arranca y muestra la URL local (normalmente `http://localhost:8787`).

- [ ] **Step 2: Configurar `.env` local del sitio**

```bash
cp .env.example .env
```

(`.env.example` ya apunta a `http://localhost:8787`, que `sala.ts` convierte a `ws://localhost:8787`.)

- [ ] **Step 3: Levantar el sitio y probar el flujo completo con dos pestañas/navegadores**

Run: `npm run dev` (en otra terminal, con el Worker de Step 1 corriendo)

En una pestaña (o navegador) normal y otra en modo incógnito (para simular dos jugadores con `localStorage` separado):

1. Pestaña A: abrir `/juegos/tres-en-raya`, pulsar "🌐 Jugar por internet" → "Crear sala", ingresar un nombre. Confirmar que se muestra un código de 6 caracteres.
2. Pestaña B: abrir `/juegos/tres-en-raya`, pulsar "🌐 Jugar por internet" → "Unirse con código", ingresar el código y un nombre distinto.
3. Confirmar que ambas pestañas cierran el modal y muestran el tablero con los nombres reales de cada jugador (no "Jugador 1"/"Jugador 2").
4. Jugar la partida completa alternando turnos entre pestañas; confirmar que **no se puede jugar en el turno del rival** en ninguna de las dos pestañas.
5. Terminar la partida y pulsar "Jugar de nuevo" desde una de las pestañas; confirmar que ambas reinician sin crear una sala nueva.
6. Cerrar la pestaña B a mitad de una segunda partida; confirmar que la pestaña A muestra "📡 Tu rival se desconectó" y el tablero queda inhabilitado.
7. Repetir los puntos 1-4 para `/juegos/puntos-y-cajas` y `/juegos/agujero-negro`.
8. Probar el link de "Copiar link para compartir": abrirlo en una tercera pestaña y confirmar que precarga el código en el campo de "Unirse".

Si algún paso falla, volver a la tarea correspondiente (7-12) y corregir antes de seguir — esta es la primera vez que el sistema completo corre de punta a punta.

- [ ] **Step 4: Confirmar que la suite completa de tests pasa**

Run: `npm test && cd worker && npm test`
Expected: PASS en ambos proyectos.

- [ ] **Step 5: Actualizar `README.md`**

Agregar una sección nueva antes de "## Cómo agregar un juego nuevo":

```markdown
## Modo remoto (jugar por internet)

Los 3 juegos soportan jugar entre dos computadoras por internet, uniéndose
con un código corto de sala. Arquitectura completa en
`docs/superpowers/specs/2026-08-17-juego-remoto-design.md`.

Para desarrollar/probar en local hace falta correr el Worker de
señalización además del sitio:

```bash
cd worker && npm install && npm run dev   # sirve en http://localhost:8787
# en otra terminal, desde la raíz del repo:
cp .env.example .env
npm run dev
```

El Worker vive en `worker/` (proyecto npm independiente, se despliega por
separado — ver el job `deploy-worker` en `.github/workflows/deploy.yml`).
Requiere una TURN key de Cloudflare Realtime configurada como secreto
(`wrangler secret put TURN_KEY_ID` / `TURN_KEY_API_TOKEN`, paso manual
único, ver Tarea 6 del plan de implementación).
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: documentar el modo remoto y cómo correrlo en local"
```

---

## Self-Review (completado antes de entregar el plan)

**Cobertura del spec:** arquitectura general (Task 1-8), Worker de señalización (Task 1-6), protocolo de mensajes (Task 4, 7), manejo de errores/desconexión (Task 4 Step 1 tests de 4040/4090, Task 7 tests de ErrorSala, Task 10-12 aviso de desconexión), cambios en cliente (Task 7-12), testing (cada tarea con TDD salvo la UI de Astro, cubierta por verificación manual explícita — Task 9 Step 7, Task 10-12 Step 3, Task 13). No-objetivos (reconexión automática, persistencia, `<TableroJuego>`, juegos nuevos) — ninguna tarea los introduce.

**Placeholders:** ninguno — cada step de código tiene la implementación completa, no descripciones de "qué hacer".

**Consistencia de tipos:** `MoveChannel`/`MensajeJuego`/`EstadoConexion`/`ErrorSala` (Task 7) se usan con la misma forma en `sala.ts` (Task 8), `ModalJuegoRemoto.astro` (Task 9) y los 3 `Board.astro` (Task 10-12). El evento `canal-remoto-listo` tiene el mismo `detail: {channel, miNombre}` en el `dispatchEvent` (Task 9) y en los 3 listeners (Task 10-12). Los payloads de `"movimiento"` coinciden con la firma real de cada `engine.ts`: `number` en tres en raya y agujero negro, `LineId` en puntos y cajas.
