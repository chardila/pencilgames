import type { Env } from './index';
import { normalizarNombre } from './nombre';
import { ICE_SERVERS_STUN_FALLBACK, obtenerCredencialesTurn } from './turn';

const EXPIRACION_MS = 10 * 60 * 1000;
export const TIMEOUT_GRACIA_MS = 15000;

type Asiento = 1 | 2;

function generarTokenSesion(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export class Room {
  private sockets = new Map<Asiento, WebSocket>();
  // Nombre normalizado por asiento, solo para comparar en el `unirse` — el
  // servidor nunca reenvía este valor a ningún cliente. El nombre "de
  // verdad" que se muestra en el marcador sigue viajando por el mensaje
  // {tipo:'nombre'} sobre el canal de juego, fuera del alcance de Room.
  private nombres = new Map<Asiento, string>();
  private tokens = new Map<Asiento, string>();
  private timersGracia = new Map<Asiento, ReturnType<typeof setTimeout>>();

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
    const nombre = normalizarNombre(url.searchParams.get('nombre') ?? '');
    const timeoutGraciaMs = Number(url.searchParams.get('timeoutGraciaMs')) || TIMEOUT_GRACIA_MS;

    const par = new WebSocketPair();
    const cliente = par[0];
    const servidor = par[1];
    servidor.accept();

    if (rol === 'reconectar') {
      const asientoParam = Number(url.searchParams.get('asiento'));
      const tokenParam = url.searchParams.get('token');
      const asiento = (asientoParam === 1 || asientoParam === 2) ? (asientoParam as Asiento) : null;
      const tokenGuardado = asiento ? this.tokens.get(asiento) : null;
      const tokenValido = Boolean(asiento && tokenGuardado && tokenParam && tokenGuardado === tokenParam);

      const creadaEn = await this.state.storage.get<number>('creadaEn');
      const ahora = Date.now();
      const salaValida = Boolean(creadaEn && (ahora - creadaEn < EXPIRACION_MS));

      if (!asiento || !tokenValido || !salaValida) {
        servidor.close(4041, 'token-invalido');
        return new Response(null, { status: 101, webSocket: cliente });
      }

      // Cancelar temporizador de gracia si existía
      const timer = this.timersGracia.get(asiento);
      if (timer) {
        clearTimeout(timer);
        this.timersGracia.delete(asiento);
      }

      const socketViejo = this.sockets.get(asiento);
      if (socketViejo && socketViejo !== servidor) {
        try {
          socketViejo.close();
        } catch {
          // Ignorar error al cerrar socket anterior
        }
      }

      const nombreGuardado = this.nombres.get(asiento) ?? '';
      this.registrarConexion(servidor, asiento, codigo, nombreGuardado, timeoutGraciaMs);

      const rival = asiento === 1 ? 2 : 1;
      this.enviarControl(rival, { tipo: 'rival-reconectado' });

      return new Response(null, { status: 101, webSocket: cliente });
    }

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
      if (this.sockets.has(2) || this.tokens.has(2)) {
        servidor.close(4090, 'sala-llena');
        return new Response(null, { status: 101, webSocket: cliente });
      }
      // Solo se rechaza cuando ambos nombres son no vacíos e iguales: un
      // cliente que no mande `nombre` (versión vieja, o el creador nunca
      // registró uno) puede unirse sin fricción.
      if (nombre && this.nombres.get(1) === nombre) {
        servidor.close(4091, 'nombre-duplicado');
        return new Response(null, { status: 101, webSocket: cliente });
      }

      const token = generarTokenSesion();
      this.tokens.set(2, token);
      this.registrarConexion(servidor, 2, codigo, nombre, timeoutGraciaMs);
      await this.completarSala();
      return new Response(null, { status: 101, webSocket: cliente });
    }

    // rol === 'crear'
    await this.state.storage.put('creadaEn', Date.now());
    this.sockets.clear();
    this.nombres.clear();
    this.tokens.clear();
    for (const timer of this.timersGracia.values()) {
      clearTimeout(timer);
    }
    this.timersGracia.clear();

    const token = generarTokenSesion();
    this.tokens.set(1, token);
    this.registrarConexion(servidor, 1, codigo, nombre, timeoutGraciaMs);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  private registrarConexion(
    servidor: WebSocket,
    asiento: Asiento,
    codigo: string,
    nombre: string,
    timeoutGraciaMs: number = TIMEOUT_GRACIA_MS
  ): void {
    this.sockets.set(asiento, servidor);
    this.nombres.set(asiento, nombre);

    servidor.addEventListener('message', evento => {
      try {
        const mensaje = typeof evento.data === 'string' ? JSON.parse(evento.data) : null;
        if (mensaje && mensaje.tipo === 'ping') {
          servidor.send(JSON.stringify({ tipo: 'pong' }));
          return;
        }
      } catch {
        // En caso de que no sea JSON parseable, retransmitir tal cual
      }
      this.retransmitir(asiento, evento.data as string);
    });

    servidor.addEventListener('close', () => {
      // Si este socket ya fue reemplazado por otro más nuevo, ignorar este evento
      if (this.sockets.get(asiento) !== servidor) {
        return;
      }
      this.sockets.delete(asiento);
      const rival = asiento === 1 ? 2 : 1;
      this.enviarControl(rival, {
        tipo: 'rival-desconectado-temporal',
        tiempoLimiteMs: timeoutGraciaMs,
      });

      const timerExistente = this.timersGracia.get(asiento);
      if (timerExistente) {
        clearTimeout(timerExistente);
      }

      const timer = setTimeout(() => {
        this.timersGracia.delete(asiento);
        this.tokens.delete(asiento);
        this.nombres.delete(asiento);
        this.enviarControl(rival, { tipo: 'rival-desconectado' });
      }, timeoutGraciaMs);

      this.timersGracia.set(asiento, timer);
    });

    const tokenSesion = this.tokens.get(asiento) ?? '';
    servidor.send(JSON.stringify({ tipo: 'conectado', asiento, codigo, tokenSesion }));
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
