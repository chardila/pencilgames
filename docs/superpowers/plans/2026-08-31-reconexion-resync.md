# Resincronización de estado tras reconexión — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que dos clientes en modo remoto recuperen automáticamente los movimientos perdidos durante una desconexión, en vez de quedar con tableros divergentes y silenciosos.

**Architecture:** Todo el cambio vive en `src/lib/gameSession.ts` y `src/lib/remoto/types.ts`. `gameSession` lleva un registro ordenado de todos los movimientos (los que envía y los que recibe) más un contador de épocas que sube con cada `reiniciar`. Al volver a `'conectado'` desde un estado de reconexión, corre un handshake peer-to-peer (`sync-hola` / `sync-moves`) sobre el canal existente: el cliente adelantado le reenvía al atrasado la cola de movimientos que le falta, y el atrasado los aplica por el mismo camino `onMovimientoRemoto` que ya usa para cualquier movimiento remoto. Si los historiales se contradicen (no debería pasar en juegos por turnos), se muestra un aviso con botón de reinicio.

**Tech Stack:** TypeScript estricto, Vitest (entorno `node`), sin framework de UI. El canal remoto (`canalWebRTC.ts`), el Worker y los 11 juegos NO se tocan.

**Spec:** `docs/superpowers/specs/2026-08-31-reconexion-resync-design.md`

## Global Constraints

- **Sin cambios en `src/lib/remoto/canalWebRTC.ts`, `worker/**`, ni `src/games/**`.** Solo `src/lib/remoto/types.ts`, `src/lib/gameSession.ts` y `src/lib/gameSession.test.ts`.
- **TypeScript estricto.** `rtk tsc` (que corre `astro check`) debe quedar en cero errores tras cada tarea.
- **TDD.** Cada tarea: test que falla → implementación mínima → test que pasa → commit.
- **Todos los tests existentes deben seguir pasando** tras cada tarea: `rtk vitest` desde la raíz (no toca `worker/`).
- **Idioma:** identificadores y comentarios en español, igual que el resto de `src/lib/`.
- El comando de test del proyecto es `rtk vitest` (falla-solo). Para ver un test puntual: `npx vitest run src/lib/gameSession.test.ts -t "<nombre>"`.

---

## File Structure

| Archivo | Responsabilidad tras el cambio |
|---|---|
| `src/lib/remoto/types.ts` | Define `MensajeJuego`; se le agregan las variantes `sync-hola` y `sync-moves`. |
| `src/lib/gameSession.ts` | Además de lo actual: mantiene `registro` + `epoca`, extrae los callbacks inline del canal a funciones nombradas (`manejarMensaje`, `manejarCambioEstado`), y agrega el handshake de sync (`iniciarSync`, `manejarSyncHola`, `manejarSyncMoves`, `aplicarLote`, `mostrarDesync`, `alExpirarSync`, `cancelarSync`). |
| `src/lib/gameSession.test.ts` | Casos unitarios del registro, la época y el handshake; más una prueba de integración de dos sesiones a través de un relay con pérdida. |

Ninguna otra unidad cambia. `canalWebRTC.alMensajeWs` ya reenvía como mensaje de juego todo `tipo` que no esté en `TIPOS_CONTROL`; `sync-hola` y `sync-moves` no colisionan con ningún tipo de control, así que llegan solos a `manejarMensaje`.

---

## Task 1: Registro de movimientos y contador de épocas

**Files:**
- Modify: `src/lib/gameSession.ts`
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces (variables de módulo dentro de `iniciarSesionJuego`, visibles para las tareas siguientes):
  - `let epoca = 0`
  - `let registro: TMovimiento[] = []`
  - Invariante: se hace `registro.push` en `enviarMovimiento` (justo antes de `canal?.enviar`) y en el brazo `movimiento` de `manejarMensaje` (justo antes de `config.onMovimientoRemoto`). `reiniciar` (local y el brazo `reiniciar` de `manejarMensaje`) hacen `epoca++; registro = []` antes de `config.onAplicarReinicio()`.

- [ ] **Step 1: Escribir el test que falla**

Agregar al final del `describe('gameSession', ...)` en `src/lib/gameSession.test.ts`:

```ts
  it('registra los movimientos enviados y recibidos, y limpia el registro al reiniciar', () => {
    let receptorMensajes: ((msg: MensajeJuego) => void) | null = null;
    const mockEnviar = vi.fn();
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: mockEnviar,
      alRecibir: vi.fn(cb => {
        receptorMensajes = cb;
      }),
      alCambiarEstado: vi.fn(),
      cerrar: vi.fn(),
    };
    const onMovimientoRemoto = vi.fn();
    const onAplicarReinicio = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto,
      onAplicarReinicio,
      onRender: vi.fn(),
    });
    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Yo' },
      })
    );

    // Movimiento local + movimiento remoto: ambos deben quedar registrados.
    sesion.enviarMovimiento(3);
    receptorMensajes!({ tipo: 'movimiento', payload: 7 });
    // El registro no es observable directamente; se verifica a través del
    // handshake en la Tarea 2. Acá solo se comprueba que reiniciar remoto
    // dispara onAplicarReinicio (comportamiento que ya existía) y que un
    // payload inválido no llega a onMovimientoRemoto (ya existía) — este
    // test ancla que la refactorización a manejarMensaje no rompió nada.
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'movimiento', payload: 3 });
    expect(onMovimientoRemoto).toHaveBeenCalledWith(7);

    receptorMensajes!({ tipo: 'movimiento', payload: 'no-numero' as unknown as number });
    expect(onMovimientoRemoto).toHaveBeenCalledTimes(1);

    receptorMensajes!({ tipo: 'reiniciar' });
    expect(onAplicarReinicio).toHaveBeenCalledTimes(1);

    sesion.destruir();
  });
```

- [ ] **Step 2: Correr el test y verificar que pasa (ancla de refactor) o falla**

Run: `npx vitest run src/lib/gameSession.test.ts -t "registra los movimientos enviados y recibidos"`
Expected: PASS (este test describe comportamiento que ya existe; sirve de red de seguridad para el refactor de los pasos siguientes).

- [ ] **Step 3: Extraer los callbacks inline del canal a funciones nombradas**

En `src/lib/gameSession.ts`, dentro de `iniciarSesionJuego`, reemplazar el bloque `canal.alRecibir((mensaje: MensajeJuego) => { ... });` (líneas ~87-112) por:

```ts
    canal.alRecibir(manejarMensaje);
```

y el bloque `canal.alCambiarEstado(estado => { ... });` (líneas ~114-157) por:

```ts
    canal.alCambiarEstado(manejarCambioEstado);
```

Definir las dos funciones nombradas **dentro de `iniciarSesionJuego`**, después de `alCanalRemotoListo` y antes de `document.addEventListener('nombres-jugadores-actualizados', ...)`. `manejarMensaje` es el mismo cuerpo que tenía el arrow, con dos cambios (marcados con `// NUEVO`):

```ts
  function manejarMensaje(mensaje: MensajeJuego): void {
    if (mensaje.tipo === 'movimiento') {
      if (config.validarMovimiento(mensaje.payload)) {
        registro.push(mensaje.payload); // NUEVO
        config.onMovimientoRemoto(mensaje.payload);
      } else {
        console.warn(
          'Mensaje de movimiento ignorado por payload inválido:',
          mensaje.payload
        );
      }
    } else if (mensaje.tipo === 'nombre') {
      const nombreRemoto =
        typeof mensaje.nombre === 'string'
          ? mensaje.nombre.trim().slice(0, 40)
          : '';
      if (nombreRemoto) {
        nombres[miAsiento === 1 ? 2 : 1] = nombreRemoto;
        config.onRender();
      }
    } else if (mensaje.tipo === 'reiniciar') {
      epoca++; // NUEVO
      registro = []; // NUEVO
      config.onAplicarReinicio();
    }
  }
```

`manejarCambioEstado` es el mismo cuerpo que tenía el arrow (sin cambios de comportamiento todavía; el disparo del sync se agrega en la Tarea 2):

```ts
  function manejarCambioEstado(estado: EstadoConexion): void {
    estadoConexion = estado;
    if (estado === 'reconectando' || estado === 'reconectando-rival') {
      config.onRender();

      const modoReconexion = estado === 'reconectando' ? 'propia' : 'rival';
      if (ultimoTurnoOpciones) {
        mostrarTurno(ultimoTurnoOpciones);
      } else {
        const ind = getIndicadorTurno();
        if (ind) {
          const fichas: Record<Player, FichaJugador> = {
            1: { nombre: nombres[1] },
            2: { nombre: nombres[2] },
          };
          renderTurnIndicator(ind, {
            jugador: (miAsiento ?? 1) as Player,
            fichas,
            miAsiento,
            estadoReconexion: modoReconexion,
          });
        }
      }
    } else if (estado === 'conectado') {
      config.onRender();
    } else if (estado === 'desconectado') {
      liberarWakeLock();
      const ind = getIndicadorTurno();
      const ban = getBannerGanador();
      if (ind) ocultarTurnIndicator(ind);
      if (ban) {
        showWinnerBanner(ban, {
          titulo: '📡 Tu rival se desconectó',
          onReiniciar: () => location.reload(),
        });
      }
      config.onDesconectar?.();
    }
  }
```

- [ ] **Step 4: Agregar las variables de estado y el registro en `enviarMovimiento` / `reiniciar`**

Junto a las otras variables de módulo (después de `let ultimoTurnoOpciones: MostrarTurnoOptions | null = null;`, línea ~64) agregar:

```ts
  let epoca = 0;
  let registro: TMovimiento[] = [];
```

Cambiar `enviarMovimiento` (línea ~173):

```ts
  function enviarMovimiento(movimiento: TMovimiento): void {
    registro.push(movimiento);
    canal?.enviar({ tipo: 'movimiento', payload: movimiento });
  }
```

Cambiar `reiniciar` (línea ~177):

```ts
  function reiniciar(): void {
    epoca++;
    registro = [];
    config.onAplicarReinicio();
    canal?.enviar({ tipo: 'reiniciar' });
  }
```

- [ ] **Step 5: Correr toda la suite y el typecheck**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS (todos, incluido el test nuevo del Step 1).

Run: `rtk tsc`
Expected: `TypeScript: No errors found`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "refactor(gameSession): registro de movimientos y época, callbacks nombrados"
```

---

## Task 2: Tipos de mensaje y emisión de `sync-hola` al reconectar

**Files:**
- Modify: `src/lib/remoto/types.ts`
- Modify: `src/lib/gameSession.ts`
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes de la Tarea 1: `epoca`, `registro`, `manejarCambioEstado`.
- Produces:
  - `MensajeJuego` gana `{ tipo: 'sync-hola'; epoca: number; seq: number }` y `{ tipo: 'sync-moves'; epoca: number; desde: number; movimientos: unknown[] }`.
  - `function iniciarSync(): void` — envía `sync-hola` con `{ epoca, seq: registro.length }` y arma `timeoutSync` a 3000 ms.
  - `function alExpirarSync(): void` — reintenta `iniciarSync` una sola vez, luego se rinde.
  - `function cancelarSync(): void` — limpia `timeoutSync`.
  - `let timeoutSync: ReturnType<typeof setTimeout> | null = null`, `let reintentoSyncHecho = false`, `let estadoPrevio: EstadoConexion = 'conectado'`.
  - En `manejarCambioEstado`, al pasar a `'conectado'` viniendo de un estado de reconexión: `setTimeout(iniciarSync, 0)`.

- [ ] **Step 1: Escribir los tests que fallan**

En `src/lib/gameSession.test.ts`, agregar un `describe` anidado dentro de `describe('gameSession', ...)`, al final:

```ts
  describe('resincronización tras reconexión', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function montarSesionConectada(asiento: 1 | 2 = 1) {
      let receptorMensajes: ((msg: MensajeJuego) => void) | null = null;
      let receptorEstado: ((estado: string) => void) | null = null;
      const mockEnviar = vi.fn();
      const mockCanal: MoveChannel = {
        asiento,
        estado: 'conectado',
        enviar: mockEnviar,
        alRecibir: vi.fn(cb => {
          receptorMensajes = cb;
        }),
        alCambiarEstado: vi.fn(cb => {
          receptorEstado = cb;
        }),
        cerrar: vi.fn(),
      };
      const onMovimientoRemoto = vi.fn();
      const onAplicarReinicio = vi.fn();
      const sesion = iniciarSesionJuego<number>({
        validarMovimiento: (p: unknown): p is number => typeof p === 'number',
        onMovimientoRemoto,
        onAplicarReinicio,
        onRender: vi.fn(),
      });
      document.dispatchEvent(
        new CustomEvent('canal-remoto-listo', {
          detail: { channel: mockCanal, miNombre: 'Yo' },
        })
      );
      return {
        sesion,
        mockEnviar,
        onMovimientoRemoto,
        onAplicarReinicio,
        enviarRemoto: (msg: MensajeJuego) => receptorMensajes!(msg),
        cambiarEstado: (e: string) => receptorEstado!(e),
      };
    }

    it('no emite sync-hola en la primera conexión', () => {
      const h = montarSesionConectada();
      vi.advanceTimersByTime(1);
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-hola' })
      );
      h.sesion.destruir();
    });

    it('emite sync-hola con {epoca, seq} al volver a conectado tras una reconexión', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 });
      h.mockEnviar.mockClear();

      h.cambiarEstado('reconectando');
      h.cambiarEstado('conectado');
      vi.advanceTimersByTime(1);

      expect(h.mockEnviar).toHaveBeenCalledWith({
        tipo: 'sync-hola',
        epoca: 0,
        seq: 2,
      });
      h.sesion.destruir();
    });

    it('reintenta sync-hola una sola vez si no hay respuesta, y después se rinde', () => {
      const h = montarSesionConectada();
      h.cambiarEstado('reconectando-rival');
      h.cambiarEstado('conectado');
      vi.advanceTimersByTime(1); // primer sync-hola
      expect(
        h.mockEnviar.mock.calls.filter(c => c[0].tipo === 'sync-hola')
      ).toHaveLength(1);

      vi.advanceTimersByTime(3000); // expira -> reintento
      expect(
        h.mockEnviar.mock.calls.filter(c => c[0].tipo === 'sync-hola')
      ).toHaveLength(2);

      vi.advanceTimersByTime(3000); // expira de nuevo -> se rinde
      expect(
        h.mockEnviar.mock.calls.filter(c => c[0].tipo === 'sync-hola')
      ).toHaveLength(2);
      h.sesion.destruir();
    });
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/lib/gameSession.test.ts -t "resincronización tras reconexión"`
Expected: FAIL — "emite sync-hola…" y "reintenta sync-hola…" fallan porque no se emite nada; "no emite sync-hola en la primera conexión" pasa por accidente (nada se emite todavía).

- [ ] **Step 3: Agregar las variantes de mensaje**

En `src/lib/remoto/types.ts`, reemplazar la definición de `MensajeJuego`:

```ts
export type MensajeJuego =
  | { tipo: 'nombre'; nombre: string }
  | { tipo: 'movimiento'; payload: unknown }
  | { tipo: 'reiniciar' }
  | { tipo: 'sync-hola'; epoca: number; seq: number }
  | { tipo: 'sync-moves'; epoca: number; desde: number; movimientos: unknown[] };
```

- [ ] **Step 4: Implementar `iniciarSync`, `alExpirarSync`, `cancelarSync` y el disparo**

En `src/lib/gameSession.ts`, junto a las variables de módulo (después de `let registro: TMovimiento[] = [];` de la Tarea 1) agregar:

```ts
  let estadoPrevio: EstadoConexion = 'conectado';
  let timeoutSync: ReturnType<typeof setTimeout> | null = null;
  let reintentoSyncHecho = false;
```

Agregar estas tres funciones dentro de `iniciarSesionJuego` (por ejemplo justo antes de `manejarMensaje`):

```ts
  function cancelarSync(): void {
    if (timeoutSync !== null) {
      clearTimeout(timeoutSync);
      timeoutSync = null;
    }
  }

  function iniciarSync(): void {
    if (!canal) return;
    canal.enviar({ tipo: 'sync-hola', epoca, seq: registro.length });
    cancelarSync();
    timeoutSync = setTimeout(alExpirarSync, 3000);
  }

  function alExpirarSync(): void {
    timeoutSync = null;
    if (!reintentoSyncHecho) {
      reintentoSyncHecho = true;
      iniciarSync();
    }
  }
```

En `manejarCambioEstado`, cambiar el arranque para capturar `estadoPrevio` y disparar el sync. Reemplazar la primera línea (`estadoConexion = estado;`) y el brazo `else if (estado === 'conectado')`:

```ts
  function manejarCambioEstado(estado: EstadoConexion): void {
    const veniaDeReconexion =
      estadoPrevio === 'reconectando' || estadoPrevio === 'reconectando-rival';
    estadoConexion = estado;
    estadoPrevio = estado;

    if (estado === 'reconectando' || estado === 'reconectando-rival') {
      // ... (cuerpo sin cambios)
    } else if (estado === 'conectado') {
      config.onRender();
      if (veniaDeReconexion) {
        // canalWebRTC hace flush de mensajesPendientesEnvio justo después de
        // disparar este callback; enviar sync-hola en el próximo tick deja
        // que cualquier flush síncrono gane la carrera por el cable.
        reintentoSyncHecho = false;
        setTimeout(iniciarSync, 0);
      }
    } else if (estado === 'desconectado') {
      // ... (cuerpo sin cambios)
    }
  }
```

En `destruir()`, agregar `cancelarSync();` como primera línea del cuerpo.

- [ ] **Step 5: Correr los tests y el typecheck**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS (todos).

Run: `rtk tsc`
Expected: `TypeScript: No errors found`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/remoto/types.ts src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(gameSession): emite sync-hola al reconectar (handshake de resync)"
```

---

## Task 3: Responder `sync-hola` con `sync-moves`

**Files:**
- Modify: `src/lib/gameSession.ts`
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes de las Tareas 1-2: `epoca`, `registro`, `cancelarSync`, `alExpirarSync`, `timeoutSync`, `manejarMensaje`.
- Produces:
  - `function manejarSyncHola(msg: { epoca: number; seq: number }): void` — si misma época y `msg.seq < registro.length`, envía `{ tipo: 'sync-moves', epoca, desde: msg.seq, movimientos: registro.slice(msg.seq) }`; si `msg.seq > registro.length` o `msg.epoca > epoca`, re-arma `timeoutSync`; si `msg.epoca < epoca`, envía `sync-moves` completo (`desde: 0`).
  - `manejarMensaje` enruta `sync-hola` → `manejarSyncHola`.

- [ ] **Step 1: Escribir los tests que fallan**

Dentro del `describe('resincronización tras reconexión', ...)` de la Tarea 2, agregar:

```ts
    it('cuando el peer está atrás en la misma época, le reenvía la cola de movimientos', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(10);
      h.enviarRemoto({ tipo: 'movimiento', payload: 20 });
      h.sesion.enviarMovimiento(30);
      h.mockEnviar.mockClear();

      // El peer dice que solo tiene 1 movimiento; yo tengo 3.
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 1 });

      expect(h.mockEnviar).toHaveBeenCalledWith({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 1,
        movimientos: [20, 30],
      });
      h.sesion.destruir();
    });

    it('cuando el peer está al día, no reenvía nada', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(10);
      h.mockEnviar.mockClear();

      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 1 });

      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      h.sesion.destruir();
    });

    it('cuando el peer está adelante, espera su sync-moves (re-arma el timeout)', () => {
      const h = montarSesionConectada();
      h.cambiarEstado('reconectando');
      h.cambiarEstado('conectado');
      vi.advanceTimersByTime(1); // primer sync-hola
      h.mockEnviar.mockClear();

      // El peer tiene más movimientos que yo.
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 5 });
      // No responde con sync-moves...
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      // ...pero el timeout re-armado dispara un reintento de sync-hola.
      vi.advanceTimersByTime(3000);
      expect(h.mockEnviar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-hola' })
      );
      h.sesion.destruir();
    });

    it('cuando el peer está atrás en época, le manda el registro completo de la época actual', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'reiniciar' }); // epoca -> 1, registro -> []
      h.sesion.enviarMovimiento(2);
      h.mockEnviar.mockClear();

      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 1 });

      expect(h.mockEnviar).toHaveBeenCalledWith({
        tipo: 'sync-moves',
        epoca: 1,
        desde: 0,
        movimientos: [2],
      });
      h.sesion.destruir();
    });
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/lib/gameSession.test.ts -t "resincronización tras reconexión"`
Expected: FAIL en los 4 casos nuevos (no hay handler de `sync-hola`).

- [ ] **Step 3: Implementar `manejarSyncHola` y su ruteo**

En `src/lib/gameSession.ts`, agregar la función (junto a `iniciarSync`):

```ts
  function manejarSyncHola(msg: { epoca: number; seq: number }): void {
    cancelarSync();
    if (!canal) return;

    if (msg.epoca === epoca) {
      if (msg.seq < registro.length) {
        canal.enviar({
          tipo: 'sync-moves',
          epoca,
          desde: msg.seq,
          movimientos: registro.slice(msg.seq),
        });
      } else if (msg.seq > registro.length) {
        // Estoy atrás: espero su sync-moves. Re-armo el timeout para que
        // un sync-moves perdido dispare igual el reintento/silencio.
        timeoutSync = setTimeout(alExpirarSync, 3000);
      }
      // msg.seq === registro.length: en sync, nada que hacer.
    } else if (msg.epoca > epoca) {
      // Me perdí uno o más reinicios; el peer me manda un sync-moves
      // completo. Re-armo el timeout por si se pierde.
      timeoutSync = setTimeout(alExpirarSync, 3000);
    } else {
      // msg.epoca < epoca: el peer está atrás en reinicios.
      canal.enviar({
        tipo: 'sync-moves',
        epoca,
        desde: 0,
        movimientos: [...registro],
      });
    }
  }
```

En `manejarMensaje`, agregar el brazo (después de `else if (mensaje.tipo === 'reiniciar') { ... }`):

```ts
    } else if (mensaje.tipo === 'sync-hola') {
      manejarSyncHola(mensaje);
    }
```

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS (todos).

Run: `rtk tsc`
Expected: `TypeScript: No errors found`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(gameSession): responde sync-hola con la cola de movimientos"
```

---

## Task 4: Aplicar `sync-moves` (replay) y aviso de desincronización

**Files:**
- Modify: `src/lib/gameSession.ts`
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes de las Tareas 1-3: `epoca`, `registro`, `cancelarSync`, `config.validarMovimiento`, `config.onMovimientoRemoto`, `config.onAplicarReinicio`, `getBannerGanador`, `showWinnerBanner`, `reiniciar`.
- Produces:
  - `function manejarSyncMoves(msg: { epoca: number; desde: number; movimientos: unknown[] }): void`.
  - `function aplicarLote(movimientos: unknown[]): void` — por cada payload: si `validarMovimiento` falla → `mostrarDesync()` y corta; si no → `registro.push` + `config.onMovimientoRemoto`.
  - `function mostrarDesync(): void` — `showWinnerBanner` con título "⚠️ La partida se desincronizó" y `onReiniciar: reiniciar`.
  - `function jsonIgual(a: unknown, b: unknown): boolean` — `JSON.stringify(a) === JSON.stringify(b)`.
  - `manejarMensaje` enruta `sync-moves` → `manejarSyncMoves`.

- [ ] **Step 1: Escribir los tests que fallan**

Dentro del `describe('resincronización tras reconexión', ...)`:

```ts
    it('aplica los movimientos de un sync-moves que continúa exactamente donde voy', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 }); // registro: [1, 2]
      h.onMovimientoRemoto.mockClear();

      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 2,
        movimientos: [3, 4],
      });

      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(1, 3);
      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(2, 4);

      // Y ahora un sync-hola del peer confirma que quedé en seq 4.
      h.mockEnviar.mockClear();
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 4 });
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      h.sesion.destruir();
    });

    it('ante un sync-moves de época mayor, reinicia una vez y aplica esa época', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.sesion.enviarMovimiento(2); // epoca 0, registro [1, 2]
      h.onAplicarReinicio.mockClear();
      h.onMovimientoRemoto.mockClear();

      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 2,
        desde: 0,
        movimientos: [9],
      });

      expect(h.onAplicarReinicio).toHaveBeenCalledTimes(1);
      expect(h.onMovimientoRemoto).toHaveBeenCalledWith(9);

      // Quedé en epoca 2, seq 1: un sync-hola del peer con esos valores no
      // provoca reenvío.
      h.mockEnviar.mockClear();
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 2, seq: 1 });
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      h.sesion.destruir();
    });

    it('aplica solo la cola no solapada cuando el solapamiento coincide', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 }); // registro [1, 2]
      h.onMovimientoRemoto.mockClear();

      // El peer manda desde 1: [2, 3, 4]. El "2" coincide con lo que tengo.
      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 1,
        movimientos: [2, 3, 4],
      });

      expect(h.onMovimientoRemoto).toHaveBeenCalledTimes(2);
      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(1, 3);
      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(2, 4);
      h.sesion.destruir();
    });

    it('muestra el aviso de desincronización si el solapamiento se contradice', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 }); // registro [1, 2]

      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 1,
        movimientos: [99, 3], // el "99" contradice mi "2"
      });

      const banner = document.getElementById('banner-ganador')!;
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('La partida se desincronizó');
      h.sesion.destruir();
    });

    it('muestra el aviso si un lote trae un payload inválido', () => {
      const h = montarSesionConectada();
      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 0,
        movimientos: ['no-numero'],
      });
      const banner = document.getElementById('banner-ganador')!;
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('La partida se desincronizó');
      h.sesion.destruir();
    });
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run src/lib/gameSession.test.ts -t "resincronización tras reconexión"`
Expected: FAIL en los 5 casos nuevos (no hay handler de `sync-moves`).

- [ ] **Step 3: Implementar `manejarSyncMoves`, `aplicarLote`, `mostrarDesync`, `jsonIgual` y el ruteo**

En `src/lib/gameSession.ts`, agregar (junto a `manejarSyncHola`):

```ts
  function jsonIgual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function mostrarDesync(): void {
    const ban = getBannerGanador();
    if (!ban) return;
    showWinnerBanner(ban, {
      titulo: '⚠️ La partida se desincronizó',
      detalle: 'Reinicien para volver a empezar con el mismo rival.',
      onReiniciar: reiniciar,
    });
  }

  function aplicarLote(movimientos: unknown[]): void {
    for (const payload of movimientos) {
      if (!config.validarMovimiento(payload)) {
        mostrarDesync();
        return;
      }
      registro.push(payload);
      config.onMovimientoRemoto(payload);
    }
  }

  function manejarSyncMoves(msg: {
    epoca: number;
    desde: number;
    movimientos: unknown[];
  }): void {
    cancelarSync();

    if (msg.epoca > epoca) {
      epoca = msg.epoca;
      registro = [];
      config.onAplicarReinicio();
      aplicarLote(msg.movimientos);
      return;
    }
    if (msg.epoca < epoca) return; // stale

    // msg.epoca === epoca
    if (msg.desde === registro.length) {
      aplicarLote(msg.movimientos);
      return;
    }
    if (msg.desde < registro.length) {
      const yaCompartidos = registro.length - msg.desde;
      const solapanEntrantes = msg.movimientos.slice(0, yaCompartidos);
      const solapanMios = registro.slice(msg.desde);
      if (jsonIgual(solapanEntrantes, solapanMios)) {
        aplicarLote(msg.movimientos.slice(yaCompartidos));
      } else {
        mostrarDesync();
      }
    }
    // msg.desde > registro.length: hueco imposible en turn-based; se ignora
    // (el otro lado del handshake lo cubre).
  }
```

En `manejarMensaje`, agregar el brazo (después de `sync-hola`):

```ts
    } else if (mensaje.tipo === 'sync-moves') {
      manejarSyncMoves(mensaje);
    }
```

Nota de orden de declaración: `mostrarDesync` referencia `reiniciar`, que está declarada más abajo con `function` (hoisted), así que no hay problema de orden. `aplicarLote` referencia `mostrarDesync`; ambas son declaraciones hoisted dentro del mismo scope.

- [ ] **Step 4: Correr los tests y el typecheck**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS (todos).

Run: `rtk tsc`
Expected: `TypeScript: No errors found`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(gameSession): aplica sync-moves con replay y aviso de desync"
```

---

## Task 5: Prueba de integración de dos sesiones con relay con pérdida

**Files:**
- Test: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes: la API pública de `iniciarSesionJuego` y todo el handshake de las Tareas 1-4. No agrega código de producción.

**Contexto de test-infra:** `iniciarSesionJuego` lee `document` global (para `document.addEventListener('canal-remoto-listo', ...)` en construcción) y `document.getElementById` de forma perezosa dentro de `getIndicadorTurno`/`getBannerGanador`. Para correr dos sesiones aisladas en el mismo test:
1. Se les pasa `indicadorTurnoEl` y `bannerGanadorEl` explícitos en la config, así ninguna llama a `document.getElementById` después de construirse.
2. Se cambia el stub global de `document` entre una construcción y la otra, de modo que cada sesión registre su listener de `canal-remoto-listo` en un `MockDocument` distinto.

- [ ] **Step 1: Escribir el test que falla**

Agregar dentro del `describe('resincronización tras reconexión', ...)` (usa los mismos fake timers del `beforeEach`):

```ts
    it('integración: dos sesiones recuperan un movimiento perdido durante la reconexión', () => {
      const docA = new MockDocument();
      const docB = new MockDocument();
      const indA = new MockElement();
      const banA = new MockElement();
      banA.hidden = true;
      const indB = new MockElement();
      const banB = new MockElement();
      banB.hidden = true;

      let recA: ((m: MensajeJuego) => void) | null = null;
      let recB: ((m: MensajeJuego) => void) | null = null;
      let estA: ((e: string) => void) | null = null;
      let estB: ((e: string) => void) | null = null;

      // Relay con interruptor de pérdida: cuando `perdiendo` es true, los
      // mensajes de A hacia B se descartan.
      let perdiendo = false;
      const canalA: MoveChannel = {
        asiento: 1,
        estado: 'conectado',
        enviar: (m: MensajeJuego) => {
          if (perdiendo) return;
          recB?.(m);
        },
        alRecibir: (cb: (m: MensajeJuego) => void) => {
          recA = cb;
        },
        alCambiarEstado: (cb: (e: string) => void) => {
          estA = cb;
        },
        cerrar: vi.fn(),
      };
      const canalB: MoveChannel = {
        asiento: 2,
        estado: 'conectado',
        enviar: (m: MensajeJuego) => {
          recA?.(m);
        },
        alRecibir: (cb: (m: MensajeJuego) => void) => {
          recB = cb;
        },
        alCambiarEstado: (cb: (e: string) => void) => {
          estB = cb;
        },
        cerrar: vi.fn(),
      };

      const onRemotoA = vi.fn();
      const onRemotoB = vi.fn();

      vi.stubGlobal('document', docA as unknown as Document);
      const sesionA = iniciarSesionJuego<number>({
        indicadorTurnoEl: indA as unknown as HTMLElement,
        bannerGanadorEl: banA as unknown as HTMLElement,
        validarMovimiento: (p: unknown): p is number => typeof p === 'number',
        onMovimientoRemoto: onRemotoA,
        onAplicarReinicio: vi.fn(),
        onRender: vi.fn(),
      });
      docA.dispatchEvent(
        new CustomEvent('canal-remoto-listo', {
          detail: { channel: canalA, miNombre: 'A' },
        })
      );

      vi.stubGlobal('document', docB as unknown as Document);
      const sesionB = iniciarSesionJuego<number>({
        indicadorTurnoEl: indB as unknown as HTMLElement,
        bannerGanadorEl: banB as unknown as HTMLElement,
        validarMovimiento: (p: unknown): p is number => typeof p === 'number',
        onMovimientoRemoto: onRemotoB,
        onAplicarReinicio: vi.fn(),
        onRender: vi.fn(),
      });
      docB.dispatchEvent(
        new CustomEvent('canal-remoto-listo', {
          detail: { channel: canalB, miNombre: 'B' },
        })
      );

      // Partida normal: A juega 1, B lo recibe.
      sesionA.enviarMovimiento(1);
      expect(onRemotoB).toHaveBeenCalledWith(1);

      // Se corta: A juega 2, se pierde en el cable.
      perdiendo = true;
      sesionA.enviarMovimiento(2);
      expect(onRemotoB).toHaveBeenCalledTimes(1); // B no recibió el "2"

      // Reconexión: ambos pasan por <reconexión> -> conectado. Relay vuelve.
      estA!('reconectando');
      estB!('reconectando-rival');
      perdiendo = false;
      estA!('conectado');
      estB!('conectado');
      vi.advanceTimersByTime(1); // flush de los setTimeout(iniciarSync, 0)

      // B recuperó el movimiento perdido.
      expect(onRemotoB).toHaveBeenCalledWith(2);
      // Nadie mostró el aviso de desincronización.
      expect(banA.hidden).toBe(true);
      expect(banB.hidden).toBe(true);

      sesionA.destruir();
      sesionB.destruir();
      vi.stubGlobal('document', new MockDocument() as unknown as Document);
    });
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/gameSession.test.ts -t "integración: dos sesiones"`
Expected: FAIL en `expect(onRemotoB).toHaveBeenCalledWith(2)` (antes del handshake, B nunca recibe el movimiento perdido).

Si en cambio falla antes por un problema de `document`/`MockElement`, revisar que `MockElement` esté exportado o accesible en el scope del test (está definido a nivel de archivo en `gameSession.test.ts`, así que debería estarlo).

- [ ] **Step 3: Implementación**

Ninguna. El test debe pasar con el código de las Tareas 1-4. Si no pasa, el fallo apunta a un bug real en el handshake — corregirlo en `gameSession.ts` y anotar qué caso del spec no estaba cubierto.

- [ ] **Step 4: Correr toda la suite del repo y el typecheck**

Run: `rtk vitest`
Expected: PASS — todos los archivos de test de la raíz (no corre `worker/`).

Run: `rtk tsc`
Expected: `TypeScript: No errors found`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.test.ts
git commit -m "test(gameSession): integración de resync entre dos sesiones"
```

---

## Task 6: Nota de dependencia frágil y verificación final

**Files:**
- Modify: `src/lib/gameSession.ts` (solo un comentario)
- Modify: `docs/superpowers/specs/2026-08-31-reconexion-resync-design.md` (marcar estado)

**Interfaces:** ninguna.

- [ ] **Step 1: Comentario de dependencia frágil**

En `src/lib/gameSession.ts`, sobre la línea `registro.push(mensaje.payload); // NUEVO` del brazo `movimiento` de `manejarMensaje`, dejar el comentario (y quitar el `// NUEVO`):

```ts
        // El registro asume que onMovimientoRemoto SIEMPRE aplica el
        // movimiento (playMove puro, sin descarte silencioso). La PR #23
        // arregló los dos juegos (sim, hex) donde el guard de turno dentro
        // de jugar() descartaba movimientos remotos. Si un juego futuro
        // reintroduce ese patrón, el replay de reconexión se rompe.
        registro.push(mensaje.payload);
```

- [ ] **Step 2: Playtest manual en navegador**

Levantar como en la verificación de la PR #24:

```bash
cd worker && npm run dev   # anota el puerto (p. ej. 8788)
```
```bash
PUBLIC_SIGNAL_WORKER_URL=http://localhost:<puerto> npx astro dev --port 4321
```

Con `chrome-devtools` MCP, dos pestañas en `/juegos/obstruccion/` (una en contexto aislado):
1. Crear sala en A, unirse desde B, esperar a que la conexión quede lista (`#indicador-turno` con `data-mi-asiento`).
2. Capturar el WebSocket de juego de cada pestaña (`ws://.../crear` y `ws://.../unirse`) vía un `initScript` que envuelva `addEventListener`.
3. Con A en su turno: en la pestaña B, forzar `ws.close()` del socket de juego **e inmediatamente** hacer clic en una casilla de A antes de que el tablero se deshabilite (o simular el movimiento en vuelo cerrando el socket justo después de `enviarMovimiento`).
4. Esperar a que B reconecte (`/reconectar`) y ambos vuelvan a `conectado`.
5. Verificar: el movimiento que se coló aparece en **ambos** tableros, los turnos quedan consistentes, y **no** aparece el banner "La partida se desincronizó".
6. Repetir forzando un `reiniciar` cruzado: A termina la partida, B pulsa "jugar de nuevo" mientras el socket de A está cerrado; al reconectar, ambos deben quedar en tablero nuevo.

Registrar el resultado (antes/después) en el cuerpo del PR.

- [ ] **Step 3: Verificación final**

Run: `rtk vitest`
Expected: PASS.

Run: `rtk tsc`
Expected: `TypeScript: No errors found`.

Run: `npm test --prefix worker` (sanity de que no se tocó nada del worker)
Expected: PASS.

- [ ] **Step 4: Marcar el spec como implementado**

En `docs/superpowers/specs/2026-08-31-reconexion-resync-design.md`, cambiar la línea `**Estado**: Pendiente de revisión del usuario` por `**Estado**: Implementado`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.ts docs/superpowers/specs/2026-08-31-reconexion-resync-design.md
git commit -m "docs: nota de dependencia frágil del replay; spec implementado"
```

---

## Self-review

**Spec coverage:**

| Sección del spec | Tarea que la implementa |
|---|---|
| 4.1 Estado interno (`epoca`, `registro`, `estadoPrevio`, `timeoutSync`, `reintentoSyncHecho`) | Tareas 1 y 2 |
| 4.2 Tipos de mensaje | Tarea 2, Step 3 |
| 5.1 Mantenimiento del registro (push en envío/recepción, época en reiniciar) | Tarea 1 |
| 5.2 Disparo del handshake (`estadoPrevio`, `setTimeout(0)`, solo tras reconexión) | Tarea 2 |
| 5.3 Recepción de `sync-hola` (todos los brazos) | Tarea 3 |
| 5.4 Recepción de `sync-moves` (época mayor, `desde === seq`, solapamiento coincide / contradice, stale) | Tarea 4 |
| 5.5 Expiración (`alExpirarSync`, reintento único) | Tarea 2 |
| 5.6 `mostrarDesync` (reusa `showWinnerBanner`) | Tarea 4 |
| 6 Casos borde (época perdida, re-desconexión, buffer flush, modo local, cliente viejo, contradicción) | Cubiertos por Tareas 2-4; el de modo local no necesita código (el registro acumula sin efecto y `manejarCambioEstado` nunca corre sin canal) |
| 7 Dependencia frágil documentada | Tarea 6, Step 1 |
| 8.1 Pruebas unitarias | Tareas 1-4 |
| 8.2 Integración de dos instancias | Tarea 5 |
| 8.3 Playtest manual | Tarea 6, Step 2 |
| 9 Archivos afectados (solo types.ts, gameSession.ts, gameSession.test.ts) | Respetado; Tarea 6 también toca el .md del spec |

**Placeholder scan:** sin "TBD"/"add error handling"/"similar to Task N". Todo el código está escrito.

**Type consistency:**
- `manejarSyncHola(msg: { epoca: number; seq: number })` — coincide con la variante `sync-hola`.
- `manejarSyncMoves(msg: { epoca: number; desde: number; movimientos: unknown[] })` — coincide con la variante `sync-moves`.
- `aplicarLote(movimientos: unknown[])` — usado en Tarea 4 en ambos brazos con ese tipo.
- `registro: TMovimiento[]`; `registro.slice(...)` produce `TMovimiento[]`, asignable a `movimientos: unknown[]` de la variante `sync-moves`. `[...registro]` idem.
- `cancelarSync` / `iniciarSync` / `alExpirarSync` — mismos nombres en Tareas 2, 3 y 4.
- `estadoPrevio: EstadoConexion` — mismo tipo que `estadoConexion`, ya importado en el archivo.
- `manejarMensaje` / `manejarCambioEstado` — introducidos en Tarea 1, extendidos en Tareas 2-4 con nombres consistentes.
