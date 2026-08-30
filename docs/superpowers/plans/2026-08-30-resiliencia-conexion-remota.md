# Resiliencia de Conexión y Anti-Desconexión en Modo Remoto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar resiliencia en tres niveles (Screen Wake Lock, WebSocket Heartbeat y Reconexión con ventana de gracia de 15 segundos) para evitar desconexiones accidentales en modo remoto entre tabletas.

**Architecture:** Módulo cliente de Wake Lock para prevenir apagado de pantalla en tabletas; heartbeat periódico (ping/pong) cada 15s en `CanalWebRTC` para evitar timeouts de red; y protocolo de reconexión basado en `tokenSesion` en el Cloudflare Worker con un temporizador de gracia de 15s que pausa temporalmente el juego sin perder el estado.

**Tech Stack:** TypeScript, Astro, WebRTC, WebSockets, Cloudflare Workers (Durable Objects), Vitest, `@cloudflare/vitest-pool-workers`.

**Spec:** `docs/superpowers/specs/2026-08-30-resiliencia-conexion-remota-design.md`

## Global Constraints

- No introducir dependencias externas nuevas en `package.json` ni `worker/package.json`.
- Compatibilidad hacia atrás: Fallback seguro y silencioso si el navegador no soporta `navigator.wakeLock`.
- Idempotencia y determinismo: Los motores de juego (`engine.ts`) no se modifican; la pausa de interacción se controla en la capa de sesión (`gameSession.ts`).
- Sin persistencia en base de datos externa: Toda la gestión de estado de sala y tokens vive en la memoria de la instancia del Durable Object en el Worker.
- Tests unitarios estrictos con Vitest y Vitest Pool Workers para cada cambio.

---

### Task 1: Módulo Screen Wake Lock (`src/lib/wakeLock.ts`)

**Files:**
- Create: `src/lib/wakeLock.ts`
- Test: `src/lib/wakeLock.test.ts`

**Interfaces:**
- Produces:
  - `solicitarWakeLock(): Promise<boolean>`
  - `liberarWakeLock(): Promise<void>`
  - `registrarReactivacionWakeLock(): () => void`

- [ ] **Step 1: Escribir el test fallido para Wake Lock**

Crear `src/lib/wakeLock.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { solicitarWakeLock, liberarWakeLock, registrarReactivacionWakeLock } from './wakeLock';

describe('wakeLock', () => {
  let mockSentinel: { release: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> };
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    };
    mockRequest = vi.fn().mockResolvedValue(mockSentinel);

    vi.stubGlobal('navigator', {
      wakeLock: {
        request: mockRequest,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('solicita wake lock de tipo screen correctamente', async () => {
    const obtenido = await solicitarWakeLock();
    expect(obtenido).toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('screen');
  });

  it('maneja de forma segura si navigator.wakeLock no está soportado', async () => {
    vi.stubGlobal('navigator', {});
    const obtenido = await solicitarWakeLock();
    expect(obtenido).toBe(false);
  });

  it('maneja excepciones si request() falla (ej. permisos denegados)', async () => {
    mockRequest.mockRejectedValue(new Error('NotAllowedError'));
    const obtenido = await solicitarWakeLock();
    expect(obtenido).toBe(false);
  });

  it('libera el wake lock activo', async () => {
    await solicitarWakeLock();
    await liberarWakeLock();
    expect(mockSentinel.release).toHaveBeenCalledTimes(1);
  });

  it('re-solicita el wake lock cuando el documento vuelve a ser visible', async () => {
    let visibilityCallback: (() => void) | null = null;
    const mockDocument = {
      visibilityState: 'visible',
      addEventListener: vi.fn((event, cb) => {
        if (event === 'visibilitychange') visibilityCallback = cb;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', mockDocument);

    const limpiar = registrarReactivacionWakeLock();
    expect(mockDocument.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    mockRequest.mockClear();
    // Simular regreso a primer plano
    mockDocument.visibilityState = 'visible';
    visibilityCallback!();

    expect(mockRequest).toHaveBeenCalledWith('screen');

    limpiar();
    expect(mockDocument.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
```

- [ ] **Step 2: Ejecutar el test para verificar que falla**

Run: `npx vitest run src/lib/wakeLock.test.ts`
Expected: FAIL con error de módulo no encontrado (`./wakeLock`).

- [ ] **Step 3: Implementar `src/lib/wakeLock.ts`**

Crear `src/lib/wakeLock.ts`:
```ts
interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: string, listener: () => void): void;
}

let centinelaActivo: WakeLockSentinelLike | null = null;

export async function solicitarWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) {
    return false;
  }
  try {
    centinelaActivo = await (navigator.wakeLock as { request(type: string): Promise<WakeLockSentinelLike> }).request(
      'screen'
    );
    return true;
  } catch {
    centinelaActivo = null;
    return false;
  }
}

export async function liberarWakeLock(): Promise<void> {
  if (centinelaActivo) {
    try {
      await centinelaActivo.release();
    } catch {
      // Ignorar errores al liberar
    }
    centinelaActivo = null;
  }
}

export function registrarReactivacionWakeLock(): () => void {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return () => {};
  }

  const alCambiarVisibilidad = () => {
    if (document.visibilityState === 'visible') {
      solicitarWakeLock();
    }
  };

  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  return () => {
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  };
}
```

- [ ] **Step 4: Ejecutar el test para verificar que pasa**

Run: `npx vitest run src/lib/wakeLock.test.ts`
Expected: PASS (5 tests passing).

- [ ] **Step 5: Commit**

```bash
git add src/lib/wakeLock.ts src/lib/wakeLock.test.ts
git commit -m "feat(remoto): módulo wakeLock para evitar suspensión de pantalla"
```

---

### Task 2: Tokens de Sesión, Heartbeat y Reconexión en el Worker (`worker/`)

**Files:**
- Modify: `worker/src/index.ts`
- Modify: `worker/src/room.ts`
- Modify: `worker/test/room.test.ts`
- Modify: `worker/test/index.test.ts`

**Interfaces:**
- Produces:
  - Mensaje `{ tipo: 'conectado', asiento, codigo, tokenSesion: string }`
  - Mensaje `{ tipo: 'pong' }` ante `{ tipo: 'ping' }`
  - Endpoint `/reconectar?codigo=...&asiento=...&token=...`
  - Evento `{ tipo: 'rival-desconectado-temporal', tiempoLimiteMs: number }`
  - Evento `{ tipo: 'rival-reconectado' }`

- [ ] **Step 1: Escribir los tests fallidos en `worker/test/room.test.ts` y `worker/test/index.test.ts`**

En `worker/test/room.test.ts`, actualizar y añadir pruebas para:
1. `conectado` incluye `tokenSesion` (string no vacío).
2. Responder a `{ tipo: 'ping' }` con `{ tipo: 'pong' }` sin reenviarlo al rival.
3. Desconexión de un socket dispara `rival-desconectado-temporal` y permite reconectar con `/reconectar` y el token correcto dentro de 15s.
4. Rechazo de `/reconectar` con token incorrecto o código inexistente.

Modificar `worker/test/room.test.ts`:
```ts
// Ajustar función conectar para soportar rol 'reconectar' y token/asiento
function conectar(
  rol: 'crear' | 'unirse' | 'reconectar',
  codigo: string,
  nombre?: string,
  asiento?: 1 | 2,
  token?: string
): Promise<WebSocket> {
  const id = env.ROOMS.idFromName(codigo);
  const stub = env.ROOMS.get(id);
  const nombreQuery = nombre ? `&nombre=${encodeURIComponent(nombre)}` : '';
  const asientoQuery = asiento ? `&asiento=${asiento}` : '';
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
  return stub
    .fetch(
      `https://ejemplo.test/conectar?rol=${rol}&codigo=${codigo}${nombreQuery}${asientoQuery}${tokenQuery}`,
      {
        headers: { Upgrade: 'websocket' },
      }
    )
    .then(respuesta => {
      const ws = respuesta.webSocket!;
      ws.accept();

      const buzon: Buzon = { mensajes: [], esperas: [] };
      buzones.set(ws, buzon);
      ws.addEventListener('message', evento => {
        const mensaje = JSON.parse(evento.data as string);
        const indice = buzon.esperas.findIndex(espera => espera.tipo === mensaje.tipo);
        if (indice >= 0) {
          buzon.esperas.splice(indice, 1)[0].resolve(mensaje);
        } else {
          buzon.mensajes.push(mensaje);
        }
      });

      return ws;
    });
}
```
Y agregar los tests de:
- `responde a ping con pong sin reenviarlo al rival`
- `emite tokenSesion al conectar y permite reconexión tras desconexión temporal`
- `rechaza reconexión con token inválido con cierre 4041`

- [ ] **Step 2: Ejecutar los tests de worker para verificar que fallan**

Run: `cd worker && npx vitest run test/room.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar la lógica en `worker/src/room.ts` y `worker/src/index.ts`**

En `worker/src/index.ts`:
Agregar manejo para la ruta `/reconectar`:
```ts
if (url.pathname === '/reconectar') {
  const codigo = url.searchParams.get('codigo');
  const asientoStr = url.searchParams.get('asiento');
  const token = url.searchParams.get('token');
  if (!codigo || !asientoStr || !token) {
    return new Response('Parámetros de reconexión incompletos', { status: 400 });
  }
  if (!esCodigoSalaValido(codigo)) {
    return new Response('Código de sala inválido', { status: 400 });
  }
  const rechazoOrigen = verificarOrigen(request, env);
  if (rechazoOrigen) return rechazoOrigen;
  return derivarASala(request, env, 'reconectar', codigo);
}
```

En `worker/src/room.ts`:
- Agregar `private tokens = new Map<Asiento, string>();`
- Agregar `private timersGracia = new Map<Asiento, ReturnType<typeof setTimeout>>();`
- Función auxiliar para generar token con `crypto.getRandomValues`.
- En `fetch`:
  - Si `rol === 'reconectar'`:
    - Validar asiento (1 o 2), token que coincida con `this.tokens.get(asiento)`, y que la sala exista.
    - Si inválido: `servidor.close(4041, 'token-invalido'); return new Response(null, { status: 101, webSocket: cliente });`
    - Cancelar temporizador de gracia si existía: `clearTimeout(this.timersGracia.get(asiento)); this.timersGracia.delete(asiento);`
    - Registrar nuevo socket: `this.registrarConexion(servidor, asiento, codigo, nombre);`
    - Enviar `{ tipo: 'conectado', asiento, codigo, tokenSesion: token }` al reconectado.
    - Enviar `{ tipo: 'rival-reconectado' }` al rival.
- En `registrarConexion`:
  - Manejo de `{ tipo: 'ping' }`: responder `servidor.send(JSON.stringify({ tipo: 'pong' }))` y no retransmitir.
  - En evento `close`:
    - En lugar de enviar `rival-desconectado` inmediato:
      - `this.sockets.delete(asiento);`
      - Enviar `{ tipo: 'rival-desconectado-temporal', tiempoLimiteMs: 15000 }` al otro asiento.
      - Iniciar `setTimeout` de 15000ms:
        - Si vence sin reconexión:
          - `this.tokens.delete(asiento);`
          - `this.nombres.delete(asiento);`
          - `this.enviarControl(otroAsiento, { tipo: 'rival-desconectado' });`

- [ ] **Step 4: Ejecutar todos los tests del Worker para verificar que pasan**

Run: `cd worker && npx vitest run`
Expected: PASS (todos los tests de `worker/test/` pasando).

- [ ] **Step 5: Commit**

```bash
git add worker/src/index.ts worker/src/room.ts worker/test/room.test.ts worker/test/index.test.ts
git commit -m "feat(worker): tokens de sesión, ping-pong y ventana de gracia de 15s para reconexión"
```

---

### Task 3: Heartbeat, Reconexión y Estado `reconectando` en `CanalWebRTC`

**Files:**
- Modify: `src/lib/remoto/types.ts`
- Modify: `src/lib/remoto/canalWebRTC.ts`
- Modify: `src/lib/remoto/canalWebRTC.test.ts`

**Interfaces:**
- Consumes:
  - `EstadoConexion` extendido: `'conectando' | 'conectado' | 'reconectando' | 'desconectado'`
- Produces:
  - `CanalWebRTC` gestionando `ping`/`pong` cada 15s.
  - Almacenamiento de `tokenSesion`.
  - Transición a `reconectando` ante `rival-desconectado-temporal` o desconexión local.
  - Bucle de reintento de reconexión hacia `/reconectar` cada 1.5s durante 15s.

- [ ] **Step 1: Escribir los tests fallidos en `src/lib/remoto/canalWebRTC.test.ts`**

Añadir tests en `src/lib/remoto/canalWebRTC.test.ts`:
1. `emite ping cada 15 segundos y no lo reenvía como mensaje de juego`.
2. `pasa a estado reconectando al recibir rival-desconectado-temporal y vuelve a conectado al recibir rival-reconectado`.
3. `reintenta reconectar automáticamente con /reconectar y token al cerrarse el WebSocket inesperadamente`.
4. `si no logra reconectar en 15s, pasa a desconectado definitivamente`.

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run src/lib/remoto/canalWebRTC.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modificar `src/lib/remoto/types.ts` y `src/lib/remoto/canalWebRTC.ts`**

En `src/lib/remoto/types.ts`:
```ts
export type EstadoConexion = 'conectando' | 'conectado' | 'reconectando' | 'desconectado';
```

En `src/lib/remoto/canalWebRTC.ts`:
- Guardar `tokenSesion: string`, `codigo: string`, `workerUrl: string`, `nombre: string`.
- Iniciar intervalo de ping (cada 15s):
  `this.intervaloPing = setInterval(() => { if (this.ws.readyState === WS_ABIERTO) this.ws.send(JSON.stringify({ tipo: 'ping' })); }, 15000);`
- Al recibir `{ tipo: 'pong' }`: ignorar (consumido internamente).
- Al recibir `{ tipo: 'rival-desconectado-temporal' }`: `this.cambiarEstado('reconectando')`.
- Al recibir `{ tipo: 'rival-reconectado' }`: `this.cambiarEstado('conectado')`.
- Al recibir evento `close` del WebSocket:
  - Si el estado era `'conectado'`:
    - Cambiar estado a `'reconectando'`.
    - Iniciar reintentos de reconexión con `intentarReconectar()`.
    - Reintentar abrir `new WebSocket(`${this.workerUrl}/reconectar?codigo=${this.codigo}&asiento=${this.asiento}&token=${this.tokenSesion}`)` cada 1.5s.
    - Si se conecta dentro de 15s: asignar nuevo `this.ws`, restablecer listeners, enviar mensajes pendientes si había y cambiar estado a `'conectado'`.
    - Si transcurren 15s sin éxito: cambiar estado a `'desconectado'`.
- En `cerrar()`: limpiar `intervaloPing` y timers de reintento.

- [ ] **Step 4: Ejecutar los tests de `canalWebRTC` para verificar que pasan**

Run: `npx vitest run src/lib/remoto/canalWebRTC.test.ts`
Expected: PASS (todos los tests de `canalWebRTC.test.ts` pasando).

- [ ] **Step 5: Commit**

```bash
git add src/lib/remoto/types.ts src/lib/remoto/canalWebRTC.ts src/lib/remoto/canalWebRTC.test.ts
git commit -m "feat(remoto): soporte de heartbeat y bucle de reconexión en CanalWebRTC"
```

---

### Task 4: Control de Turno, UI Informativa y Wake Lock en `GameSession` (`src/lib/gameSession.ts` e `indicadorTurno.ts`)

**Files:**
- Modify: `src/lib/turnIndicator.ts`
- Modify: `src/lib/gameSession.ts`
- Modify: `src/lib/gameSession.test.ts`
- Modify: `src/lib/turnIndicator.test.ts`

**Interfaces:**
- Consumes:
  - `CanalWebRTC` con estado `reconectando`
  - `solicitarWakeLock`, `liberarWakeLock`, `registrarReactivacionWakeLock` de `./wakeLock`
- Produces:
  - `esMiTurno(jugador)` devuelve `false` durante `reconectando`.
  - `indicadorTurno` muestra mensaje de reconexión temporal sin ocultar el tablero.
  - WakeLock activo durante la partida remota y liberado en `destruir()`.

- [ ] **Step 1: Escribir los tests fallidos en `src/lib/gameSession.test.ts` y `src/lib/turnIndicator.test.ts`**

En `src/lib/gameSession.test.ts`:
1. `durante el estado reconectando, esMiTurno devuelve false y se muestra el aviso de reconexión en el indicador`.
2. `al volver a conectado, esMiTurno vuelve a su comportamiento normal y se restaura el indicador de turno`.
3. `activa el wakeLock al conectar y lo libera en destruir()`.

- [ ] **Step 2: Ejecutar los tests para verificar que fallan**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar cambios en `src/lib/turnIndicator.ts` y `src/lib/gameSession.ts`**

En `src/lib/turnIndicator.ts`:
- Soporte para mostrar mensaje especial de reconexión (ej. `estadoReconexion?: 'propia' | 'rival'`).
- Si `estadoReconexion === 'propia'`: texto `"🔄 Reconectando con la partida..."`.
- Si `estadoReconexion === 'rival'`: texto `"⏳ Tu rival se desconectó temporalmente. Esperando..."`.

En `src/lib/gameSession.ts`:
- Importar `solicitarWakeLock`, `liberarWakeLock`, `registrarReactivacionWakeLock`.
- Guardar `let estadoConexion: EstadoConexion = 'conectado'`.
- En `esMiTurno(jugadorActual)`:
  ```ts
  if (estadoConexion === 'reconectando') return false;
  return miAsiento === null || miAsiento === jugadorActual;
  ```
- En `alCanalRemotoListo`:
  - `solicitarWakeLock();`
  - `const limpiarVisibilidad = registrarReactivacionWakeLock();`
  - En `canal.alCambiarEstado(estado => { ... })`:
    - `estadoConexion = estado;`
    - Si `estado === 'reconectando'`:
      - Actualizar `indicadorTurno` con aviso de reconexión.
    - Si `estado === 'conectado'`:
      - Re-renderizar indicador con `config.onRender()`.
    - Si `estado === 'desconectado'`:
      - `liberarWakeLock();`
      - Ocultar indicador y mostrar `showWinnerBanner`.
- En `destruir()`:
  - `liberarWakeLock();`
  - `limpiarVisibilidad?.();`

- [ ] **Step 4: Ejecutar los tests de `gameSession` e `indicadorTurno`**

Run: `npx vitest run src/lib/gameSession.test.ts src/lib/turnIndicator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/turnIndicator.ts src/lib/gameSession.ts src/lib/gameSession.test.ts src/lib/turnIndicator.test.ts
git commit -m "feat(gameSession): pausa de turnos en reconexión, UI de estado y wake lock"
```

---

### Task 5: Verificación Integral del Proyecto

**Files:**
- Todos los archivos del repositorio

- [ ] **Step 1: Ejecutar la suite completa de tests de la raíz**

Run: `npm test`
Expected: PASS (todos los tests de los 4 juegos y librerías pasando).

- [ ] **Step 2: Ejecutar la suite completa de tests del Worker**

Run: `cd worker && npm test`
Expected: PASS (todos los tests del Worker pasando).

- [ ] **Step 3: Ejecutar verificación de tipos y build de Astro**

Run: `npx astro check && npm run build`
Expected: 0 errors, build exitoso en `dist/`.

- [ ] **Step 4: Commit final si hay ajustes pendientes**

```bash
git status
```
