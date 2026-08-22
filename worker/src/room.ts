import type { Env } from './index';
import { normalizarNombre } from './nombre';
import { ICE_SERVERS_STUN_FALLBACK, obtenerCredencialesTurn } from './turn';

const EXPIRACION_MS = 10 * 60 * 1000;

type Asiento = 1 | 2;

export class Room {
  private sockets = new Map<Asiento, WebSocket>();
  // Nombre normalizado por asiento, solo para comparar en el `unirse` — el
  // servidor nunca reenvía este valor a ningún cliente. El nombre "de
  // verdad" que se muestra en el marcador sigue viajando por el mensaje
  // {tipo:'nombre'} sobre el canal de juego, fuera del alcance de Room.
  private nombres = new Map<Asiento, string>();

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
      // Solo se rechaza cuando ambos nombres son no vacíos e iguales: un
      // cliente que no mande `nombre` (versión vieja, o el creador nunca
      // registró uno) puede unirse sin fricción.
      if (nombre && this.nombres.get(1) === nombre) {
        servidor.close(4091, 'nombre-duplicado');
        return new Response(null, { status: 101, webSocket: cliente });
      }

      this.registrarConexion(servidor, 2, codigo, nombre);
      await this.completarSala();
      return new Response(null, { status: 101, webSocket: cliente });
    }

    // rol === 'crear'
    await this.state.storage.put('creadaEn', Date.now());
    this.sockets.clear();
    this.nombres.clear();
    this.registrarConexion(servidor, 1, codigo, nombre);
    return new Response(null, { status: 101, webSocket: cliente });
  }

  private registrarConexion(servidor: WebSocket, asiento: Asiento, codigo: string, nombre: string): void {
    this.sockets.set(asiento, servidor);
    this.nombres.set(asiento, nombre);

    servidor.addEventListener('message', evento => {
      this.retransmitir(asiento, evento.data as string);
    });

    servidor.addEventListener('close', () => {
      this.sockets.delete(asiento);
      this.nombres.delete(asiento);
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
