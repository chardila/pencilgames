# Pencilgames — Juego remoto (unirse a una partida por internet) — Diseño

**Fecha**: 2026-08-17
**Estado**: Aprobado, pendiente de plan de implementación

## 1. Propósito

Permitir que dos jugadores jueguen la misma partida desde dos computadoras distintas, cada quien en su propia red (por internet, no solo en el mismo wifi). Un jugador crea la partida y comparte un código corto con el otro, que se une a esa misma partida.

Esto rompe deliberadamente una decisión previa del proyecto original (`docs/superpowers/specs/2026-08-09-pencilgames-design.md`, sección 2): "sin red/multi-dispositivo". Todo lo demás de ese diseño se mantiene: sin cuentas, sin persistencia de partidas, sin backend propio más allá de lo estrictamente necesario para conectar a los dos jugadores, y **sin ningún costo**.

## 2. Alcance

**Incluido en esta iteración**: modo remoto para los 3 juegos existentes (Tres en raya, Puntos y cajas, Agujero Negro), disponible desde la página de cada juego.

**Explícitamente fuera de alcance**:
- Reconexión automática tras una desconexión a mitad de partida.
- Persistencia de la sala/partida (recargar la página en modo remoto equivale a desconectarse).
- Más de 2 jugadores, espectadores, revancha con distinto rival.
- Extracción del componente `<TableroJuego>` compartido (mejora anotada en el backlog del proyecto original, sección 12 de ese diseño) — se mantiene como trabajo futuro separado, para no mezclar ese refactor con esta capa de red en el mismo cambio.
- Nuevos juegos — este diseño solo cubre los 3 ya existentes.

## 3. Restricciones (por qué se decidió así)

- **Debe ser gratis**, sin excepción — no solo "previsiblemente gratis", verificado contra la documentación de precios de Cloudflare antes de comprometerse a esta arquitectura.
- **Fácil de usar para niños** — descartamos el intercambio manual de códigos largos (SDP) típico de WebRTC "sin servidor"; se usa un código corto de sala en su lugar.
- **Mismo proveedor que ya se usa** (Cloudflare) — evita cuentas/proveedores nuevos.

## 4. Arquitectura general

```
Jugador A (crea sala)                    Jugador B (se une)
        │                                        │
        │──── WebSocket ────┐    ┌──── WebSocket ────│
                             ▼    ▼
                    Worker de señalización
                    (Durable Object, código de sala)
                             │
                    genera credenciales TURN
                    (Cloudflare Realtime, secreto de cuenta)
                             │
        │◄─── intercambio SDP/ICE (breve) ──►│
        │                                        │
        └──────── WebRTC data channel ──────────┘
              (movimientos del juego, P2P)
```

- **Transporte del juego** (movimientos, nombres, reinicios): WebRTC data channel, peer-to-peer, una vez establecida la conexión.
- **Señalización** (solo al conectar): un Worker + Durable Object nuevo. Durable Objects con almacenamiento SQLite están disponibles en el plan Workers Free (verificado contra `developers.cloudflare.com/durable-objects/platform/pricing/`), con límite de 100.000 requests/día y 13.000 GB-s de cómputo/día — muy por encima de lo que exige uso familiar ocasional. Los mensajes de WebSocket entrantes cuentan con proporción 20:1 (100 mensajes = 5 requests) para efectos de ese límite.
- **Identificación de sala**: código corto (6 caracteres, alfanumérico en mayúsculas, excluyendo caracteres ambiguos como `0/O` y `1/I/L`), fácil de leer en voz alta o escribir por un niño.
- **STUN/TURN**: Cloudflare Realtime. STUN (`stun.cloudflare.com`) es gratis e ilimitado. TURN tiene una capa gratis de 1000 GB/mes (verificado contra `developers.cloudflare.com/realtime/turn/faq/`) — para mensajes de texto de una partida (no audio/video) esto es, en la práctica, inagotable. TURN requiere credenciales de corta duración (hasta 48h de validez) generadas del lado servidor con un secreto de cuenta — nunca vive en el JS del cliente.
- **Fallback si el P2P no se establece**: si el data channel WebRTC no abre en ~15 segundos tras el intercambio ICE, los movimientos se siguen enviando por el mismo WebSocket al Worker, que los reenvía al otro jugador (relay). Como es un juego por turnos, la latencia extra del relay no importa. Esto evita que la partida "simplemente no funcione" en redes muy restrictivas (ej. NAT simétrico), sin costo adicional relevante.
- **Deploy**: dos artefactos de despliegue independientes. Cloudflare Pages **no puede declarar su propia clase de Durable Object** (verificado contra `developers.cloudflare.com/pages/functions/bindings/`) — el Worker de señalización se despliega por separado (`worker/`, con su propio `wrangler.toml`), sin binding entre ambos: el navegador le habla directo por WebSocket a la URL del Worker.
- **Paso manual único**: habilitar "Cloudflare Realtime" (TURN) en el dashboard de la cuenta es, hasta donde se verificó, un paso de configuración único antes del primer deploy que use TURN — se documenta en el plan de implementación, no se automatiza.

## 5. El Worker de señalización

- **Nuevo directorio** `worker/` en el repo, con su propio `wrangler.toml` y su propio paso en `.github/workflows/deploy.yml` (`wrangler deploy`, además del `wrangler pages deploy` existente).
- **Un Durable Object por sala** (SQLite storage backend), nombrado por el código de sala, creado al pulsar "Crear sala".
- **Responsabilidades, y nada más**:
  1. Aceptar la conexión WebSocket de los dos jugadores (creador y quien se une con el código).
  2. Reenviar entre ambos los mensajes de señalización WebRTC (oferta/respuesta SDP, candidatos ICE).
  3. Mintear credenciales TURN de corta duración (usando un *Worker secret*) y entregárselas a ambos jugadores.
  4. Servir de relay de respaldo para los mensajes de juego si el data channel P2P no se establece (sección 4).
- **Ciclo de vida de la sala**: si nadie se une dentro de ~10 minutos de creada, la sala expira y deja de aceptar conexiones. Sin persistencia de partidas — coherente con la decisión original del proyecto.
- **Dominio/ruta**: subdominio propio (ej. `signal.games.cardila.com`) o `*.workers.dev` — a definir en el plan de implementación.

## 6. Protocolo de sala y mensajes

**Flujo de creación/unión**, desde la página de cada juego (no desde el índice general):

1. Botón nuevo **"Jugar por internet"** en la página de cada juego, con dos opciones: *Crear sala* / *Unirse con código*.
2. **Crear sala**: el cliente abre WebSocket al Worker, que crea el Durable Object y devuelve el código corto. Se muestra en pantalla junto a un botón para copiar un link (`.../juegos/tres-en-raya?sala=CODIGO`) para compartir por chat. El creador es siempre **Jugador 1** (quien arranca en cada motor: `X` en tres en raya, jugador `1` en los otros dos).
3. **Unirse**: el otro jugador escribe el código (o abre el link, que lo precarga) → el cliente abre WebSocket al Worker con ese código. Si la sala existe y tiene un solo jugador, se conecta como **Jugador 2**. Si no existe, ya expiró, o ya está llena, se muestra un mensaje de error específico para cada caso (sección 7).
4. Con los dos conectados al Worker, el intercambio SDP/ICE arranca automáticamente (invisible para el usuario) hasta abrir el data channel P2P, o caer al relay (sección 4).

**Mensajes sobre el canal de juego** (mismo formato viaje por P2P o por el relay del Worker — el protocolo no cambia, solo el transporte):

```
{ tipo: "nombre", nombre: string }
{ tipo: "movimiento", payload: <específico del juego> }
{ tipo: "reiniciar" }
```

- `payload` de `"movimiento"` es el mismo tipo que cada `engine.ts` ya recibe: `number` (índice de casilla) en tres en raya, `LineId` (`{type, row, col}`) en puntos y cajas, `number` (`positionId`) en agujero negro. El módulo de transporte no necesita entender el juego, solo reenviar el payload tal cual.
- Cada lado aplica el mensaje recibido con la función pura del motor correspondiente (`playMove` / `playLine` / `placeNumber`). Las tres funciones ya son puras, deterministas e **idempotentes ante movimientos ilegales o fuera de turno** (devuelven el mismo estado sin cambios: casilla ocupada, línea ya trazada, posición ocupada, o `status !== 'playing'`) — verificado leyendo los 3 `engine.ts`. Esto incluye el caso de puntos y cajas, donde completar una caja no cambia `currentPlayer` (turno extra): no hace falta ninguna lógica especial de sincronización para ese caso, el gating de turno del cliente (sección 8) ya lo cubre. No hace falta numerar mensajes ni reconciliar estado.
- `"nombre"` se manda apenas se conecta cada lado, y de nuevo si el jugador cambia su nombre desde el modal existente (`ModalJugadores`).
- `"reiniciar"` (botón "Jugar de nuevo" del `BannerGanador` existente): si la conexión sigue abierta, reinicia el estado en ambos lados sin crear sala nueva.

## 7. Manejo de errores y desconexión

| Caso | Comportamiento |
|---|---|
| Código de sala no existe / ya expiró | "Ese código no es válido, revísalo o pidan uno nuevo." |
| Sala ya tiene 2 jugadores | "Esa sala ya está llena." |
| Ninguna conexión posible (ni P2P ni relay) — muy raro, solo si el propio Worker no responde | "No pudimos conectar, intenten de nuevo." Sin reintentos automáticos infinitos. |
| Un jugador se desconecta a mitad de partida (cierra pestaña, pierde internet) | El otro ve un aviso fijo "Tu rival se desconectó" y el tablero queda inhabilitado. **Sin reconexión automática.** Si quieren seguir, crean una sala nueva. |
| "Jugar de nuevo" con la conexión aún abierta | Reinicia el estado en ambos lados por el mismo canal, sin nueva sala. |
| Alguien recarga la página a mitad de partida | Se trata igual que una desconexión — no hay persistencia de sala ni de estado de juego. |

Ningún caso queda en un estado ambiguo ("¿sigue conectado o no?") — cualquier corte de conexión se refleja de inmediato en la UI.

## 8. Cambios en el cliente

**Nuevo módulo `src/lib/remoto/`** (los `engine.ts` no cambian — no saben nada de red):

- `MoveChannel`: interfaz mínima común — `enviar(mensaje)`, `alRecibir(callback)`, `estado` (`conectando` / `conectado` / `desconectado`). Una implementación (`CanalWebRTC`) que internamente maneja el data channel P2P y el fallback a relay (sección 4) de forma transparente para quien la usa.
- `crearSala()` / `unirseASala(codigo)`: devuelven un `MoveChannel` ya conectado, o lanzan el error correspondiente (sección 7).

**Cambios en cada `Board.astro`** (tres en raya, puntos y cajas, agujero negro — mismo patrón en los 3):

1. **Gating de turno por asiento propio.** Condición actual de deshabilitado (ej. en tres en raya: `casilla.disabled = valor !== null || state.status !== 'playing'`) se extiende con `|| (miAsiento !== null && state.currentPlayer !== miAsiento)`. En modo local `miAsiento` es `null` y el comportamiento no cambia.
2. **Un solo camino para aplicar movimientos.** Un click local llama a la función del motor y además `channel.enviar({tipo: "movimiento", payload})`. Un mensaje remoto entrante llama a la misma función del motor con el `payload` recibido y re-renderiza. Una sola fuente de verdad del estado en cada cliente.
3. **Nombres tardíos.** Hoy `const nombres = getPlayerNames()` se lee una sola vez al iniciar el script. En modo remoto, `nombres` pasa a ser mutable: se inicializa solo con el nombre propio, y al llegar el mensaje `"nombre"` del rival se actualiza y se vuelve a llamar `render()`.
4. **Nuevo control de entrada** junto al título de cada página de juego: botón "Jugar por internet" → modal *Crear sala* / *Unirse con código*, reutilizando el patrón visual de `ModalJugadores`/`ModalInstrucciones`.
5. **Estados de conexión visibles**: indicador simple mientras `channel.estado === 'conectando'` (mostrando el código de espera si se creó sala); aviso fijo "Tu rival se desconectó" si `channel.estado === 'desconectado'` después de haber estado conectado (tablero inhabilitado en ese momento).

## 9. Testing

- **`engine.ts` de los 3 juegos**: sin cambios, siguen cubiertos como hoy.
- **`src/lib/remoto/`**: tests unitarios con Vitest, mockeando `WebSocket`/`RTCPeerConnection` (sin necesidad de un Worker real corriendo):
  - `MoveChannel` entrega mensajes en orden, expone el estado de conexión correctamente, y cae al relay cuando el data channel no abre a tiempo.
  - Generación/parseo de los mensajes (`nombre` / `movimiento` / `reiniciar`).
- **Gating de turno en los 3 `Board.astro`**: verificar que con `miAsiento` fijado, un click en el turno del rival no dispara la función del motor.
- **Worker de señalización**: tests con `@cloudflare/vitest-pool-workers` (runner oficial para testear Workers/Durable Objects sin desplegar), cubriendo: crear sala, unirse con código válido/inválido/lleno, expiración, minteo de credenciales TURN (mockeando la llamada a la API de Realtime).

## 10. No-objetivos

Ver sección 2. Reiterado aquí por claridad: sin reconexión automática, sin persistencia de sala/partida, sin espectadores/revancha con otro rival, sin extracción de `<TableroJuego>` en este cambio, sin juegos nuevos.
