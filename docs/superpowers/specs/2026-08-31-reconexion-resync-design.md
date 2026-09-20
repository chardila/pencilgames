# Pencilgames — Resincronización de estado tras reconexión en modo remoto — Diseño

**Fecha**: 2026-08-31
**Estado**: Implementado
**Issue**: [#27](https://github.com/chardila/pencilgames/issues/27)

---

## 1. Propósito y contexto

El modo remoto tiene reconexión con ventana de gracia desde la PR #12
(ver `2026-08-30-resiliencia-conexion-remota-design.md`). Esa iteración
restaura la **conexión** pero no la **consistencia**: si se pierde un
mensaje de juego durante la ventana de desconexión, los dos tableros
divergen de forma permanente y silenciosa, sin ninguna recuperación.

La PR #24 (`gameSession` re-renderiza al entrar en reconexión) cerró el
disparador más común —el tablero dejaba de estar clickeable— pero quedan
tres formas de perder un mensaje:

- **Carrera de RTT**: entre que el socket del rival cae y el cliente
  conectado recibe `rival-desconectado-temporal` y re-renderiza (lo que
  deshabilita su tablero), ese cliente puede alcanzar a hacer un clic. El
  movimiento se aplica local vía `playMove` y se transmite a un Worker que
  lo descarta (el socket del destinatario ya fue borrado del mapa).
- **Movimiento en vuelo**: un movimiento legítimo que ya salió hacia el
  Worker cuando el rival cae, y el Worker no lo puede retransmitir.
- **`reiniciar` cruzado**: "jugar de nuevo" enviado mientras el rival está
  caído. Un lado reinicia, el otro no.

En todos los casos: divergencia permanente, ningún juego la detecta.

Este diseño agrega **resincronización peer-to-peer al reconectar**: el
cliente que quedó atrás recupera los movimientos que le faltan desde el
peer que sí los tiene, y si los historiales resultan genuinamente
irreconciliables se muestra un aviso claro con botón de reinicio.

---

## 2. Alcance

**Incluido**:

- Registro ordenado de movimientos (`registro`) y contador de épocas
  (`epoca`) dentro de `src/lib/gameSession.ts`.
- Dos nuevos tipos de mensaje en `src/lib/remoto/types.ts`: `sync-hola` y
  `sync-moves`.
- Handshake de resincronización que corre al volver a `'conectado'` desde
  un estado de reconexión.
- Replay transparente de los movimientos faltantes (camino feliz).
- Aviso "La partida se desincronizó" con botón de reinicio como *fallback*
  ante contradicción detectada positivamente.
- Pruebas unitarias en `gameSession.test.ts`, una prueba de integración de
  dos instancias, y playtest manual en navegador.

**Explícitamente fuera de alcance**:

- Cualquier cambio en `canalWebRTC.ts`, el Worker o el Durable Object. El
  Worker sigue siendo un relay puro; no guarda mensajes de juego.
- Cualquier cambio en los 11 juegos (`Board.astro`) o sus motores
  (`engine.ts`). El replay usa el camino `onMovimientoRemoto` que cada
  juego ya implementa.
- Serialización de estado por juego (se usa replay de movimientos, no
  snapshots).
- Persistencia de la partida en recarga manual de página (sigue siendo
  equivalente a desconexión definitiva).
- Recuperación cuando **ambos** peers pierden la conexión a la vez y el
  Worker recicla la sala (fuera de la ventana de gracia ya existente).

---

## 3. Restricciones y decisiones

- **Sin tocar el Worker ni `canalWebRTC`.** Los movimientos perdidos se
  recuperan del peer, no del servidor. Esto mantiene el Worker gratis y
  sin estado de juego, y evita re-verificar toda esa capa.
- **Sin código por juego.** `gameSession` ya ve todos los movimientos
  (salientes por `enviarMovimiento`, entrantes por `onMovimientoRemoto`).
  El registro y el handshake viven ahí y nada más.
- **Turn-based ⇒ sin resolución de conflictos.** Los juegos son por
  turnos, un movimiento a la vez, y solo juega quien tiene el turno. Los
  dos clientes construyen el **mismo registro ordenado**; el cliente
  atrasado siempre tiene un **prefijo estricto** del adelantado (casi
  siempre por exactamente 1 movimiento). El handshake solo necesita
  "mándame los movimientos desde el índice N".
- **Mejor esfuerzo ante silencio, ruidoso ante contradicción.** Si el
  handshake no recibe respuesta (p. ej. un cliente con una versión vieja
  sin soporte de sync durante un despliegue), se reintenta una vez y luego
  se asume que está en sync. El aviso ruidoso solo se dispara cuando se
  detecta *positivamente* que dos movimientos ya compartidos no coinciden.

---

## 4. Arquitectura

Todo el cambio vive en `src/lib/gameSession.ts` y
`src/lib/remoto/types.ts`.

```
                     ┌─────────────────────────────────────────┐
                     │ gameSession (por cliente)                │
  enviarMovimiento ──┤  • push a registro                      │
                     │  • canal.enviar({tipo:'movimiento'})    │
                     │                                         │
  {tipo:'movimiento'}┤  • validarMovimiento                    │
   (entrante)        │  • push a registro                      │
                     │  • onMovimientoRemoto(payload)          │
                     │                                         │
  reiniciar (local   ┤  • epoca++, registro = []               │
   o entrante)       │  • onAplicarReinicio()                  │
                     │                                         │
  alCambiarEstado ───┤  reconexión → 'conectado':              │
                     │    setTimeout(0): enviar sync-hola      │
                     │    {tipo:'sync-hola'|'sync-moves'}      │
                     │      → resolver diferencias             │
                     └─────────────────────────────────────────┘
```

### 4.1 Estado interno nuevo

```ts
let epoca = 0;
let registro: unknown[] = [];        // payloads de movimiento, en orden de aplicación
let estadoPrevio: EstadoConexion = 'conectado';
let timeoutSync: ReturnType<typeof setTimeout> | null = null;
let reintentoSyncHecho = false;
```

### 4.2 Tipos de mensaje (`src/lib/remoto/types.ts`)

```ts
export type MensajeJuego =
  | { tipo: 'nombre'; nombre: string }
  | { tipo: 'movimiento'; payload: unknown }
  | { tipo: 'reiniciar' }
  | { tipo: 'sync-hola'; epoca: number; seq: number }
  | { tipo: 'sync-moves'; epoca: number; desde: number; movimientos: unknown[] };
```

`canalWebRTC.alMensajeWs` reenvía como mensaje de juego todo lo que no
está en `TIPOS_CONTROL`, así que estos dos tipos llegan a
`gameSession` sin tocar `canalWebRTC`.

---

## 5. Comportamiento detallado

### 5.1 Mantenimiento del registro

**Invariante:** se hace `push` a `registro` en exactamente el punto en que
un movimiento se envía, y en exactamente el punto en que uno se recibe y
se reenvía a `onMovimientoRemoto` — **sin** condicionarlo a si `playMove`
cambió el estado. Así los dos clientes construyen registros idénticos
mensaje a mensaje y el atrasado es siempre un prefijo limpio.

- `enviarMovimiento(mov)`: `registro.push(mov)` → `canal.enviar({tipo:'movimiento', payload: mov})`.
- Entrante `{tipo:'movimiento'}` que pasa `validarMovimiento`:
  `registro.push(payload)` → `onMovimientoRemoto(payload)`.
- `reiniciar()` local: `epoca++`, `registro = []`, `onAplicarReinicio()`,
  `canal.enviar({tipo:'reiniciar'})` (orden actual, con el reset de estado
  antes del envío).
- Entrante `{tipo:'reiniciar'}`: `epoca++`, `registro = []`,
  `onAplicarReinicio()`.

En modo local (`miAsiento === null`, sin canal) el registro se acumula
igual; es inofensivo y evita una rama extra. `alCambiarEstado` nunca corre
sin canal, así que el handshake tampoco.

### 5.2 Disparo del handshake

En `alCambiarEstado(estado)`, además de lo actual:

```ts
const veniaDeReconexion =
  estadoPrevio === 'reconectando' || estadoPrevio === 'reconectando-rival';
estadoPrevio = estado;

if (estado === 'conectado' && veniaDeReconexion) {
  reintentoSyncHecho = false;
  // setTimeout(0): canalWebRTC hace flush de mensajesPendientesEnvio
  // justo después de disparar este callback; enviar sync-hola en el
  // próximo tick asegura que cualquier flush síncrono gane la carrera
  // por el cable.
  setTimeout(iniciarSync, 0);
}
```

`iniciarSync()`:

```ts
canal.enviar({ tipo: 'sync-hola', epoca, seq: registro.length });
timeoutSync = setTimeout(alExpirarSync, 3000);
```

Los dos peers pasan por `<reconexión> → 'conectado'` (el que se cayó y el
que estuvo en `reconectando-rival`), así que ambos envían `sync-hola`. El
handshake es simétrico.

### 5.3 Recepción de `sync-hola`

```ts
clearTimeout(timeoutSync); timeoutSync = null;

if (msg.epoca === epoca) {
  if (msg.seq < registro.length) {
    // Estoy adelante: mando la cola que le falta.
    canal.enviar({
      tipo: 'sync-moves', epoca,
      desde: msg.seq,
      movimientos: registro.slice(msg.seq),
    });
  } else if (msg.seq > registro.length) {
    // Estoy atrás: espero su sync-moves. Re-armo el timeout para que un
    // sync-moves perdido dispare igual el reintento/silencio.
    timeoutSync = setTimeout(alExpirarSync, 3000);
  }
  // msg.seq === registro.length: mismo largo. El issue #28 añadió un
  // checksum FNV-1a del registro a `sync-hola`; si el hash difiere aquí
  // (mismo epoca/seq, contenido distinto) → mostrarDesync().
} else if (msg.epoca > epoca) {
  // Me perdí uno o más reinicios. No mando nada; el peer me manda un
  // sync-moves completo para su época. Re-armo el timeout por si se pierde.
  timeoutSync = setTimeout(alExpirarSync, 3000);
} else {
  // msg.epoca < epoca: el peer está atrás en reinicios.
  canal.enviar({
    tipo: 'sync-moves', epoca,
    desde: 0,
    movimientos: [...registro],
  });
}
```

### 5.4 Recepción de `sync-moves`

```ts
if (msg.epoca > epoca) {
  // Adoptar la época del peer: tablero fresco + sus movimientos.
  epoca = msg.epoca;
  registro = [];
  onAplicarReinicio();                 // una sola vez basta: fresco es fresco
  aplicarLote(msg.movimientos, 0);
} else if (msg.epoca === epoca) {
  if (msg.desde === registro.length) {
    aplicarLote(msg.movimientos, msg.desde);
  } else if (msg.desde < registro.length) {
    // Solapamiento: comparar lo que ya tenemos contra lo que mandan.
    const solapan = msg.movimientos.slice(0, registro.length - msg.desde);
    const mios = registro.slice(msg.desde);
    if (jsonIgual(solapan, mios)) {
      aplicarLote(msg.movimientos.slice(mios.length), registro.length);
    } else {
      mostrarDesync();               // contradicción real → aviso ruidoso
    }
  }
  // msg.desde > registro.length: hueco imposible en turn-based; ignorar
  // (el otro sync-hola/sync-moves lo cubrirá) — defensivo, no ruidoso.
}
// msg.epoca < epoca: stale, ignorar.
```

`aplicarLote(movimientos, desdeIndice)`:

```ts
for (const payload of movimientos) {
  if (!validarMovimiento(payload)) { mostrarDesync(); return; }
  registro.push(payload);
  onMovimientoRemoto(payload);         // mismo camino que un movimiento remoto normal
}
```

`onMovimientoRemoto` termina en `jugar(payload, false)` en cada juego, así
que **no** se re-difunde y `playMove` (puro) reconstruye el estado exacto.
Cada movimiento del lote dispara un `render()`; para el caso común
(±1 movimiento) es intrascendente y no se optimiza.

### 5.5 Expiración del handshake

`alExpirarSync()`:

```ts
if (!reintentoSyncHecho) {
  reintentoSyncHecho = true;
  iniciarSync();                       // reintento único
} else {
  timeoutSync = null;                  // mejor esfuerzo: se asume en sync
}
```

Un cliente con versión vieja sin soporte de `sync-hola` nunca responde;
ese caso termina aquí en silencio, sin aviso. No quedamos peor que hoy.

### 5.6 Aviso de desincronización (`mostrarDesync`)

Reusa `showWinnerBanner` igual que `mostrarFinDeJuego`:

```ts
mostrarDesync() {
  const ban = getBannerGanador();
  if (!ban) return;
  showWinnerBanner(ban, {
    titulo: '⚠️ La partida se desincronizó',
    detalle: 'Reinicien para volver a empezar con el mismo rival.',
    onReiniciar: reiniciar,   // reinicia ambos vía {tipo:'reiniciar'} + epoca++
  });
}
```

Solo se llama ante contradicción detectada positivamente (solapamiento que
no coincide, o payload inválido en un lote). Nunca ante silencio del
handshake.

---

## 6. Casos borde

| Caso | Resolución |
|---|---|
| Mismatch típico (±1 por carrera de RTT o movimiento en vuelo) | El adelantado manda 1 `sync-moves`; el atrasado lo aplica. Transparente. |
| `reiniciar` perdido en la ventana | El atrasado en `epoca` recibe `sync-moves` con época mayor → `onAplicarReinicio()` una vez + aplica esa época (normalmente 0 movimientos). |
| Varios `reiniciar` perdidos | Igual: un tablero fresco es un tablero fresco, no importa cuántas épocas se saltaron. |
| Re-desconexión después de sincronizar | El handshake vuelve a correr desde el `{epoca, seq}` actual. Idempotente. |
| Move bufferizado en `mensajesPendientesEnvio` que se hace flush al reconectar | PR #24 impide generarlo (tablero deshabilitado). Si igual ocurriera, el `setTimeout(0)` de `sync-hola` deja que el flush síncrono gane el cable, y el peer lo cuenta una sola vez porque ya está en el `registro` del emisor. |
| Modo local (pasar y jugar) | Sin canal, `alCambiarEstado` no corre, handshake nunca. Registro se acumula sin efecto. |
| Cliente viejo sin soporte de sync | Handshake expira en silencio tras un reintento. Sin aviso. |
| Contradicción real (solapamiento no coincide) | Aviso ruidoso con botón de reinicio. No debería pasar en turn-based. |

---

## 7. Dependencia frágil a documentar

El registro asume que `onMovimientoRemoto` / `jugar(m, false)` **siempre**
aplica el movimiento (sin descarte silencioso). La PR #23 arregló los dos
juegos (sim, hex) donde el guard de turno dentro de `jugar()` descartaba
movimientos remotos. Si un juego futuro reintroduce ese patrón, el replay
se rompe. El plan de implementación debe dejar una nota o un test
transversal que lo verifique.

---

## 8. Plan de pruebas

### 8.1 Unitarias (`src/lib/gameSession.test.ts`)

- El registro acumula en ambos sentidos (envío y recepción).
- `epoca` sube y `registro` se limpia con `reiniciar` local y remoto.
- `sync-hola` se emite **solo** tras un estado de reconexión (no en la
  primera conexión) con `{epoca, seq}` correctos.
- Recibir `sync-hola` con `seq` menor → emite `sync-moves` con el slice
  correcto.
- Recibir `sync-moves` con `desde === seq` → aplica vía
  `onMovimientoRemoto` y agrega al registro.
- Recibir `sync-moves` con época mayor → `onAplicarReinicio` una vez +
  aplica todo.
- Solapamiento que contradice → `showWinnerBanner` con título de desync.
- Expiración sin respuesta → reintento único, luego silencio (sin banner).

### 8.2 Integración de dos instancias

Dos `iniciarSesionJuego` cableados por un relay bidireccional falso.
Simular:
1. Partida normal de N movimientos → registros iguales.
2. "Perder" el mensaje M mientras un lado está en `reconectando`.
3. Disparar la vuelta a `'conectado'` en ambos.
4. Aseverar que los dos registros convergen y que `onMovimientoRemoto`
   del lado atrasado recibió exactamente el movimiento faltante.

### 8.3 Playtest manual en navegador

Mismo método que la verificación de la PR #24: dos pestañas, obstrucción,
forzar `ws.close()` a mitad de un movimiento, confirmar que el movimiento
que se coló se sincroniza y los dos tableros quedan idénticos. Repetir el
caso de `reiniciar` cruzado.

---

## 9. Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/lib/remoto/types.ts` | +2 variantes en `MensajeJuego` |
| `src/lib/gameSession.ts` | registro, época, handshake, `mostrarDesync`; `enviarMovimiento` y el handler de `alRecibir` hacen `push`; `alCambiarEstado` dispara el sync |
| `src/lib/gameSession.test.ts` | casos de 8.1 y 8.2 |

Sin cambios en `canalWebRTC.ts`, `worker/`, ni ningún `src/games/**`.
