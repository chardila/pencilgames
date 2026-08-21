import type { EstadoConexion, MensajeJuego, MoveChannel } from './types';
import { ErrorSala } from './types';

const ICE_SERVERS_INICIALES: RTCIceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const TIMEOUT_DATACHANNEL_MS = 15000;
const TIMEOUT_CONEXION_MS = 10000;
// Constante propia en vez de `WebSocket.OPEN`: el global `WebSocket` puede
// venir stubeado (tests) sin esa propiedad estática. El valor 1 es el mismo
// en el estándar WebSocket (readyState OPEN) que usan tanto el navegador
// como cualquier doble de test que quiera simularlo.
const WS_ABIERTO = 1;

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
      clearTimeout(timeout);
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
  private cerrado = false;

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
    }
  }

  cerrar(): void {
    this.cerrado = true;
    if (this.timeoutFallback) clearTimeout(this.timeoutFallback);
    this.dataChannel?.close();
    this.pc?.close();
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
    if (this.callbacksMensaje.length === 0) {
      this.mensajesEnBuffer.push(mensaje);
      return;
    }
    for (const callback of this.callbacksMensaje) callback(mensaje);
  }
}
