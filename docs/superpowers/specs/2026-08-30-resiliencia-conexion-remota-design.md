# Pencilgames — Resiliencia de Conexión y Anti-Desconexión en Modo Remoto — Diseño

**Fecha**: 2026-08-30  
**Estado**: Aprobado por el usuario, pendiente de plan de implementación

---

## 1. Propósito y Contexto

Al jugar en modo remoto entre dos tabletas (iPadOS o Android) en red local o por internet, las partidas se desconectaban prematuramente debido a:
1. **Bloqueo/suspensión de pantalla**: El sistema operativo de la tableta apaga la pantalla tras 1–2 minutos de inactividad, suspendiendo JavaScript y cerrando los WebSockets inmediatamente para ahorrar batería.
2. **Cierre por inactividad de red**: Inactividad prolongada (pensar un turno) sin intercambio de datos provoca que Cloudflare o routers cierren conexiones TCP/WebSocket inactivas.
3. **Tolerancia cero a microcortes**: El diseño previo trataba cualquier cierre del WebSocket como desconexión definitiva inmediata sin posibilidad de reconexión.

Este diseño define una estrategia de resiliencia en tres niveles:
1. **Prevención de suspensión**: Screen Wake Lock API para mantener la pantalla encendida durante la partida y reactivarla si el usuario vuelve a la pestaña.
2. **Prevención de inactividad de red**: Heartbeat (ping-pong) periódico por WebSocket cada 15 segundos.
3. **Recuperación reactiva**: Ventana de gracia de 15 segundos con token de sesión en el Worker y reconexión automática transparente en el cliente, pausando la interacción del tablero sin perder la partida.

---

## 2. Alcance

**Incluido**:
- Screen Wake Lock API encapsulada con manejo seguro de ciclo de vida (`visibilitychange`) y fallback elegante en navegadores no soportados.
- Mecanismo de Ping/Pong en `CanalWebRTC` y Worker para evitar desconexiones por inactividad.
- Generación de `tokenSesion` criptográfico por asiento en el Worker (`Room`).
- Endpoint/parámetro de reconexión en el Worker (`/reconectar`) con validación de token y ventana de gracia de 15 segundos (`TIMEOUT_GRACIA_MS = 15000`).
- Nuevo estado de conexión `'reconectando'` en el cliente.
- Pausa temporal del tablero e indicador no invasivo tipo pastilla/banner de estado durante la reconexión.
- Pruebas unitarias completas (TDD) en frontend y Worker.

**Explícitamente fuera de alcance**:
- Persistencia de salas en base de datos externa (sigue manteniéndose en memoria del Durable Object).
- Soporte para recarga manual intencional de la página (F5 o pull-to-refresh sigue cerrando la sesión del cliente actual).
- Sincronización de jugadas complejas en tiempo real mientras la conexión está caída (las jugadas se pausan estrictamente mientras dura el estado `reconectando`).

---

## 3. Arquitectura y Componentes

### 3.1 Screen Wake Lock (`src/lib/wakeLock.ts`)
- Módulo cliente con:
  - `solicitarWakeLock()`: Solicita `navigator.wakeLock.request('screen')` de forma asíncrona. Maneja excepciones si no está soportado o si el usuario no tiene permisos.
  - `liberarWakeLock()`: Libera el centinela activo (`wakeLockSentinel.release()`).
  - `escucharVisibilidad(onVisible)`: Registra un listener de `visibilitychange` para re-solicitar el bloqueo cuando la pestaña vuelva a primer plano (`document.visibilityState === 'visible'`).
- Se activa al iniciar sesión de juego remoto y se destruye al salir de la partida.

### 3.2 Heartbeat WebSocket
- `CanalWebRTC` envía cada 15 segundos:
  ```json
  { "tipo": "ping" }
  ```
- El Worker responde de inmediato:
  ```json
  { "tipo": "pong" }
  ```
  Este mensaje es de control interno y **no** se retransmite al rival.

### 3.3 Protocolo de Reconexión en el Worker (`worker/src/room.ts`)

#### A. Asignación de Tokens
Al conectarse en `/crear` o `/unirse`:
1. El Worker genera un `tokenSesion` aleatorio seguro (`crypto.getRandomValues`) de 16 bytes (hexadecimal) para cada asiento (`1` y `2`).
2. Lo almacena en memoria: `private tokens = new Map<Asiento, string>()`.
3. Notifica al cliente:
   ```json
   { "tipo": "conectado", "asiento": 1, "codigo": "ABCDEF", "tokenSesion": "a1b2c3d4..." }
   ```

#### B. Detección de Desconexión y Ventana de Gracia
Cuando se dispara `servidor.addEventListener('close', ...)` para un asiento:
1. El Worker **no elimina** el asiento de inmediato.
2. Inicia un temporizador de 15 segundos (`TIMEOUT_GRACIA_MS = 15000`).
3. Envía al otro asiento:
   ```json
   { "tipo": "rival-desconectado-temporal", "tiempoLimiteMs": 15000 }
   ```

#### C. Solicitud de Reconexión
El cliente desconectado abre WebSocket a:
`wss://<worker>/reconectar?codigo=ABCDEF&asiento=1&token=a1b2c3d4...`
El Worker valida:
1. Si el código de sala existe y el asiento tiene una desconexión temporal activa.
2. Si el `token` coincide con `this.tokens.get(asiento)`.
3. Si el temporizador no ha expirado.

Si es válido:
- Cancela el temporizador de gracia de ese asiento.
- Asigna el nuevo WebSocket a `this.sockets.set(asiento, nuevoSocket)`.
- Envía al jugador reconectado:
  ```json
  { "tipo": "conectado", "asiento": 1, "codigo": "ABCDEF", "tokenSesion": "a1b2c3d4..." }
  ```
- Envía al rival:
  ```json
  { "tipo": "rival-reconectado" }
  ```

Si expiran los 15s sin reconexión:
- El temporizador ejecuta la limpieza definitiva y envía al rival:
  ```json
  { "tipo": "rival-desconectado" }
  ```

---

## 4. Máquina de Estados del Cliente y UI

### 4.1 Tipos de Conexión (`src/lib/remoto/types.ts`)
```ts
export type EstadoConexion = 'conectando' | 'conectado' | 'reconectando' | 'desconectado';
```

### 4.2 Lógica en `CanalWebRTC` (`src/lib/remoto/canalWebRTC.ts`)
- Guarda `codigo`, `asiento`, `tokenSesion`, y `workerUrl`.
- Si el WebSocket se cierra estando previamente `conectado`:
  - Cambia su estado a `'reconectando'`.
  - Intenta reabrir la conexión hacia `/reconectar` con un intervalo de reintento de 1.5s hasta un límite total de 15s.
- Si recibe `{ tipo: 'rival-desconectado-temporal' }`:
  - Cambia su estado a `'reconectando'`.
- Si recibe `{ tipo: 'rival-reconectado' }`:
  - Cambia su estado a `'conectado'`.

### 4.3 Control de Turno y Visualización (`src/lib/gameSession.ts`)
1. **Gating de turno**: Durante el estado `'reconectando'`, `esMiTurno(jugador)` devuelve `false`. Ningún jugador puede colocar fichas mientras dure la reconexión.
2. **Aviso visual no invasivo**:
   - Se muestra un banner/badge superior sobre el indicador de turno:
     - Para el cliente reconectando: `🔄 Reconectando con la sala...`
     - Para el cliente esperando al rival: `⏳ Tu rival se desconectó temporalmente. Esperando reconexión...`
   - El tablero permanece visible con todas las fichas/líneas existentes.
3. **Fin por tiempo agotado**: Si pasa a `'desconectado'`, se oculta el aviso temporal y se muestra el `showWinnerBanner` habitual: `"📡 Tu rival se desconectó"`.

---

## 5. Estrategia de Pruebas

1. **`src/lib/wakeLock.test.ts`**:
   - Solicitud de wake lock exitosa.
   - Manejo seguro ante navegadores sin soporte de `navigator.wakeLock`.
   - Re-solicitud ante evento `visibilitychange` cuando la pestaña vuelve a ser visible.
   - Liberación al destruir la sesión.
2. **`worker/src/room.test.ts`**:
   - Emisión de `tokenSesion` en mensaje inicial `conectado`.
   - Cierre de socket dispara `rival-desconectado-temporal` y mantiene el asiento 15s.
   - Reconexión válida con token reactiva la sala y emite `rival-reconectado`.
   - Intento de reconexión con token inválido es rechazado (código 4041 / error).
   - Expiración del temporizador de 15s emite `rival-desconectado` definitivo.
3. **`src/lib/remoto/canalWebRTC.test.ts`**:
   - Envío de `{ tipo: 'ping' }` periódico y recepción de `{ tipo: 'pong' }`.
   - Transición a `'reconectando'` ante desconexión temporal.
   - Reconexión exitosa y retorno a `'conectado'`.
   - Caída a `'desconectado'` tras agotar los intentos/tiempo.
4. **`src/lib/gameSession.test.ts`**:
   - `esMiTurno` devuelve `false` durante el estado `'reconectando'`.
   - Restauración del turno una vez reconectado.
