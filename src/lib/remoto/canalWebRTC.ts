import type { EstadoConexion, MensajeJuego, MoveChannel } from './types';
import { ErrorSala } from './types';

const ICE_SERVERS_INICIALES: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const TIMEOUT_DATACHANNEL_MS = 15000;
const TIMEOUT_CONEXION_MS = 10000;
const INTERVALO_PING_MS = 15000;
const INTERVALO_RECONEXION_MS = 1500;
const TIMEOUT_RECONEXION_MS = 15000;
// Constante propia en vez de `WebSocket.OPEN`: el global `WebSocket` puede
// venir stubeado (tests) sin esa propiedad estática. El valor 1 es el mismo
// en el estándar WebSocket (readyState OPEN) que usan tanto el navegador
// como cualquier doble de test que quiera simularlo.
const WS_ABIERTO = 1;

type MensajeControl =
  | { tipo: 'conectado'; asiento: 1 | 2; codigo: string; tokenSesion?: string }
  | { tipo: 'rival-conectado' }
  | { tipo: 'rival-desconectado' }
  | { tipo: 'rival-desconectado-temporal'; tiempoLimiteMs?: number }
  | { tipo: 'rival-reconectado' }
  | { tipo: 'pong' }
  | { tipo: 'ice-servers'; iceServers: RTCIceServer[] }
  | { tipo: 'oferta'; sdp: string }
  | { tipo: 'respuesta'; sdp: string }
  | { tipo: 'ice'; candidate: RTCIceCandidateInit };

const TIPOS_CONTROL = new Set([
  'conectado',
  'rival-conectado',
  'rival-desconectado',
  'rival-desconectado-temporal',
  'rival-reconectado',
  'pong',
  'ping',
  'ice-servers',
  'oferta',
  'respuesta',
  'ice',
]);

function esperarConectado(ws: WebSocket): Promise<{ asiento: 1 | 2; codigo: string; tokenSesion: string }> {
  return new Promise((resolve, reject) => {
    const limpiar = () => {
      ws.removeEventListener('message', alMensaje);
      ws.removeEventListener('close', alCerrar);
      ws.removeEventListener('error', alError);
      clearTimeout(timeout);
    };
    const alMensaje = (evento: MessageEvent) => {
      const mensaje = JSON.parse(evento.data as string) as MensajeControl;
      if (mensaje.tipo === 'conectado') {
        limpiar();
        resolve({
          asiento: mensaje.asiento,
          codigo: mensaje.codigo,
          tokenSesion: mensaje.tokenSesion ?? '',
        });
      }
    };
    const alCerrar = (evento: CloseEvent) => {
      limpiar();
      if (evento.code === 4040) reject(new ErrorSala('invalido', 'Ese código no es válido'));
      else if (evento.code === 4041) reject(new ErrorSala('invalido', 'Sesión expirada o inválida'));
      else if (evento.code === 4090) reject(new ErrorSala('llena', 'Esa sala ya está llena'));
      else if (evento.code === 4091)
        reject(new ErrorSala('nombre-duplicado', 'Ese nombre ya lo tiene el otro jugador'));
      else reject(new ErrorSala('conexion', 'No pudimos conectar'));
    };
    const alError = () => {
      limpiar();
      reject(new ErrorSala('conexion', 'No pudimos conectar'));
    };
    // Si el mensaje 'conectado' nunca llega (Worker colgado, respuesta
    // lenta, red caída sin que WebSocket dispare close/error) esta promesa
    // quedaría pendiente para siempre y la UI se congelaría sin mostrar
    // error. Se cierra el socket y se rechaza tras un tiempo de espera.
    const timeout = setTimeout(() => {
      limpiar();
      ws.close();
      reject(new ErrorSala('conexion', 'No pudimos conectar'));
    }, TIMEOUT_CONEXION_MS);
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
  private mensajesEnBuffer: MensajeJuego[] = [];
  private mensajesPendientesEnvio: MensajeJuego[] = [];
  private intervaloPing: ReturnType<typeof setInterval> | null = null;
  private timerReconexion: ReturnType<typeof setTimeout> | null = null;
  private intervaloReintento: ReturnType<typeof setInterval> | null = null;
  private socketReconexion: WebSocket | null = null;
  private cerrado = false;

  private alMensajeWsHandler = (evento: MessageEvent) => this.alMensajeWs(evento);
  private alCerrarWsHandler = (evento: CloseEvent) => this.alCerrarWs(evento);

  private constructor(
    public readonly asiento: 1 | 2,
    private ws: WebSocket,
    private readonly workerUrl: string,
    public readonly codigo: string,
    private tokenSesion: string
  ) {
    this.adjuntarListenersWs(this.ws);
    this.iniciarPing();
  }

  static async crear(workerUrl: string, nombre: string): Promise<{ channel: CanalWebRTC; codigo: string }> {
    const ws = new WebSocket(`${workerUrl}/crear?nombre=${encodeURIComponent(nombre)}`);
    const { asiento, codigo, tokenSesion } = await esperarConectado(ws);
    return { channel: new CanalWebRTC(asiento, ws, workerUrl, codigo, tokenSesion), codigo };
  }

  static async unirse(workerUrl: string, codigo: string, nombre: string): Promise<CanalWebRTC> {
    const ws = new WebSocket(
      `${workerUrl}/unirse?codigo=${encodeURIComponent(codigo)}&nombre=${encodeURIComponent(nombre)}`
    );
    const { asiento, tokenSesion } = await esperarConectado(ws);
    return new CanalWebRTC(asiento, ws, workerUrl, codigo, tokenSesion);
  }

  enviar(mensaje: MensajeJuego): void {
    const datos = JSON.stringify(mensaje);
    if (!this.usaRelay && this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(datos);
      return;
    }
    // El WebSocket puede haberse cerrado ya (p. ej. tras una desconexión) —
    // llamar a send() sobre un WebSocket cerrado lanza InvalidStateError de
    // forma síncrona, lo que aquí terminaría propagándose dentro de un
    // manejador de click en Board.astro. El propio manejo de desconexión
    // (evento 'close' -> estado 'desconectado') ya se encarga de avisarle
    // al usuario, así que acá basta con no enviar y no lanzar.
    if (this.ws.readyState === WS_ABIERTO) {
      this.ws.send(datos);
    } else if (this.estado === 'reconectando') {
      this.mensajesPendientesEnvio.push(mensaje);
    }
  }

  cerrar(): void {
    this.cerrado = true;
    this.limpiarPing();
    this.limpiarTimersReconexion();
    if (this.timeoutFallback) clearTimeout(this.timeoutFallback);
    this.dataChannel?.close();
    this.pc?.close();
    this.desadjuntarListenersWs(this.ws);
    this.ws.close();
  }

  alRecibir(callback: (mensaje: MensajeJuego) => void): void {
    this.callbacksMensaje.push(callback);
    if (this.mensajesEnBuffer.length > 0) {
      const pendientes = this.mensajesEnBuffer;
      this.mensajesEnBuffer = [];
      for (const mensaje of pendientes) callback(mensaje);
    }
  }

  alCambiarEstado(callback: (estado: EstadoConexion) => void): void {
    this.callbacksEstado.push(callback);
  }

  private cambiarEstado(estado: EstadoConexion): void {
    // Una vez cerrado el canal (cerrar()), ninguna transición de estado
    // posterior es válida: sin este guard, un timer de fallback ya armado
    // (o uno nuevo, si intentarIniciarNegociacion() se reinvoca tras un
    // cerrar() que no anuló this.pc) podría "resucitar" el canal a
    // 'conectado' después de que el usuario ya lo canceló.
    if (this.cerrado) return;
    if (this.estado === estado) return;
    this.estado = estado;
    for (const callback of this.callbacksEstado) callback(estado);
  }

  private adjuntarListenersWs(ws: WebSocket): void {
    ws.addEventListener('message', this.alMensajeWsHandler);
    ws.addEventListener('close', this.alCerrarWsHandler);
  }

  private desadjuntarListenersWs(ws: WebSocket): void {
    ws.removeEventListener('message', this.alMensajeWsHandler);
    ws.removeEventListener('close', this.alCerrarWsHandler);
  }

  private iniciarPing(): void {
    this.limpiarPing();
    this.intervaloPing = setInterval(() => {
      if (this.ws.readyState === WS_ABIERTO) {
        try {
          this.ws.send(JSON.stringify({ tipo: 'ping' }));
        } catch {
          // Ignorar error de envío en socket
        }
      }
    }, INTERVALO_PING_MS);
  }

  private limpiarPing(): void {
    if (this.intervaloPing) {
      clearInterval(this.intervaloPing);
      this.intervaloPing = null;
    }
  }

  private alCerrarWs(_evento?: CloseEvent): void {
    if (this.cerrado) return;
    if (this.estado === 'conectado') {
      this.cambiarEstado('reconectando');
      this.iniciarReconexion();
    } else if (this.estado !== 'reconectando') {
      this.cambiarEstado('desconectado');
    }
  }

  private iniciarReconexion(): void {
    if (this.cerrado) return;
    this.limpiarTimersReconexion();

    this.timerReconexion = setTimeout(() => {
      this.limpiarTimersReconexion();
      this.cambiarEstado('desconectado');
    }, TIMEOUT_RECONEXION_MS);

    this.ejecutarIntentoReconexion();

    this.intervaloReintento = setInterval(() => {
      this.ejecutarIntentoReconexion();
    }, INTERVALO_RECONEXION_MS);
  }

  private ejecutarIntentoReconexion(): void {
    if (this.cerrado || this.estado === 'desconectado') return;
    if (this.socketReconexion) {
      try {
        this.socketReconexion.close();
      } catch {
        // Ignorar error al cerrar socket previo de reconexión
      }
      this.socketReconexion = null;
    }

    const url = `${this.workerUrl}/reconectar?codigo=${encodeURIComponent(this.codigo)}&asiento=${this.asiento}&token=${encodeURIComponent(this.tokenSesion)}`;
    const ws = new WebSocket(url);
    this.socketReconexion = ws;

    const alMensaje = (evento: MessageEvent) => {
      try {
        const mensaje = JSON.parse(evento.data as string) as MensajeControl;
        if (mensaje.tipo === 'conectado') {
          ws.removeEventListener('message', alMensaje);
          ws.removeEventListener('close', alCerrar);
          ws.removeEventListener('error', alError);
          this.alReconectarExitoso(ws, mensaje.tokenSesion);
        }
      } catch {
        // Ignorar error de parsing
      }
    };

    const alCerrar = (evento: CloseEvent) => {
      ws.removeEventListener('message', alMensaje);
      ws.removeEventListener('close', alCerrar);
      ws.removeEventListener('error', alError);
      if (evento.code === 4041) {
        this.limpiarTimersReconexion();
        this.cambiarEstado('desconectado');
      }
    };

    const alError = () => {
      ws.removeEventListener('message', alMensaje);
      ws.removeEventListener('close', alCerrar);
      ws.removeEventListener('error', alError);
    };

    ws.addEventListener('message', alMensaje);
    ws.addEventListener('close', alCerrar);
    ws.addEventListener('error', alError);
  }

  private alReconectarExitoso(nuevoWs: WebSocket, nuevoToken?: string): void {
    if (this.cerrado) {
      nuevoWs.close();
      return;
    }
    this.socketReconexion = null;
    this.limpiarTimersReconexion();
    if (nuevoToken) {
      this.tokenSesion = nuevoToken;
    }

    this.desadjuntarListenersWs(this.ws);
    try {
      this.ws.close();
    } catch {
      // Ignorar error de cierre
    }

    this.ws = nuevoWs;
    this.adjuntarListenersWs(this.ws);

    this.cambiarEstado('conectado');

    const pendientes = this.mensajesPendientesEnvio;
    this.mensajesPendientesEnvio = [];
    for (const mensaje of pendientes) {
      this.enviar(mensaje);
    }
  }

  private limpiarTimersReconexion(): void {
    if (this.timerReconexion) {
      clearTimeout(this.timerReconexion);
      this.timerReconexion = null;
    }
    if (this.intervaloReintento) {
      clearInterval(this.intervaloReintento);
      this.intervaloReintento = null;
    }
    if (this.socketReconexion) {
      try {
        this.socketReconexion.close();
      } catch {
        // Ignorar error al cerrar socket de intento
      }
      this.socketReconexion = null;
    }
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
      case 'pong':
        break;
      case 'rival-desconectado-temporal':
        this.cambiarEstado('reconectando');
        break;
      case 'rival-reconectado':
        this.cambiarEstado('conectado');
        break;
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
    if (this.callbacksMensaje.length === 0) {
      this.mensajesEnBuffer.push(mensaje);
      return;
    }
    for (const callback of this.callbacksMensaje) callback(mensaje);
  }
}
