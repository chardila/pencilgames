import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanalWebRTC } from './canalWebRTC';

class WebSocketFalso {
  static instancias: WebSocketFalso[] = [];
  listeners: Record<string, Array<(e: any) => void>> = {};
  enviados: string[] = [];
  readyState = 1; // WebSocket.OPEN
  cerrado = false;
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
  close() {
    this.cerrado = true;
    this.readyState = 3; // WebSocket.CLOSED
  }
  emitirMensaje(datos: unknown) {
    for (const cb of this.listeners['message'] ?? []) cb({ data: JSON.stringify(datos) });
  }
  emitirCierre(code: number) {
    this.readyState = 3;
    for (const cb of this.listeners['close'] ?? []) cb({ code });
  }
}

class RTCDataChannelFalso {
  static instancias: RTCDataChannelFalso[] = [];
  readyState: 'connecting' | 'open' | 'closed' = 'connecting';
  listeners: Record<string, Array<(e: any) => void>> = {};
  enviados: string[] = [];
  constructor() {
    RTCDataChannelFalso.instancias.push(this);
  }
  addEventListener(tipo: string, cb: (e: any) => void) {
    (this.listeners[tipo] ??= []).push(cb);
  }
  send(datos: string) {
    this.enviados.push(datos);
  }
  emitirAbierto() {
    this.readyState = 'open';
    for (const cb of this.listeners['open'] ?? []) cb({});
  }
  emitirMensaje(datos: unknown) {
    for (const cb of this.listeners['message'] ?? []) cb({ data: JSON.stringify(datos) });
  }
  close() {
    this.readyState = 'closed';
  }
}

class RTCPeerConnectionFalso {
  static instancias: RTCPeerConnectionFalso[] = [];
  onicecandidate: ((e: any) => void) | null = null;
  ondatachannel: ((e: any) => void) | null = null;
  llamadas: {
    setRemoteDescription: any[];
    createAnswer: number;
    setLocalDescription: any[];
  } = { setRemoteDescription: [], createAnswer: 0, setLocalDescription: [] };
  constructor() {
    RTCPeerConnectionFalso.instancias.push(this);
  }
  createDataChannel(_nombre: string) {
    return new RTCDataChannelFalso();
  }
  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'oferta-falsa' });
  }
  createAnswer() {
    this.llamadas.createAnswer++;
    return Promise.resolve({ type: 'answer', sdp: 'respuesta-falsa' });
  }
  setLocalDescription(desc: any) {
    this.llamadas.setLocalDescription.push(desc);
    return Promise.resolve();
  }
  setRemoteDescription(desc: any) {
    this.llamadas.setRemoteDescription.push(desc);
    return Promise.resolve();
  }
  addIceCandidate(_c: any) {
    return Promise.resolve();
  }
  close() {}
}

beforeEach(() => {
  WebSocketFalso.instancias.length = 0;
  RTCDataChannelFalso.instancias.length = 0;
  RTCPeerConnectionFalso.instancias.length = 0;
  vi.stubGlobal('WebSocket', WebSocketFalso);
  vi.stubGlobal('RTCPeerConnection', RTCPeerConnectionFalso);
});

describe('CanalWebRTC.crear / unirse', () => {
  it('crear() resuelve con el asiento y código que envía el servidor', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    WebSocketFalso.instancias[0].emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel, codigo } = await promesa;
    expect(codigo).toBe('ABC123');
    expect(channel.asiento).toBe(1);
  });

  it('unirse() rechaza con ErrorSala("invalido") si el servidor cierra con 4040', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX', 'Ana');
    WebSocketFalso.instancias[0].emitirCierre(4040);
    await expect(promesa).rejects.toMatchObject({ codigo: 'invalido' });
  });

  it('unirse() rechaza con ErrorSala("llena") si el servidor cierra con 4090', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX', 'Ana');
    WebSocketFalso.instancias[0].emitirCierre(4090);
    await expect(promesa).rejects.toMatchObject({ codigo: 'llena' });
  });

  it('unirse() rechaza con ErrorSala("nombre-duplicado") si el servidor cierra con 4091', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX', 'Ana');
    WebSocketFalso.instancias[0].emitirCierre(4091);
    await expect(promesa).rejects.toMatchObject({ codigo: 'nombre-duplicado' });
  });

  it('crear() manda el nombre como query param en la URL del WebSocket', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana Pérez');
    WebSocketFalso.instancias[0].emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    await promesa;
    expect(WebSocketFalso.instancias[0].url).toBe('wss://ejemplo.test/crear?nombre=Ana%20P%C3%A9rez');
  });

  it('unirse() manda el código y el nombre como query params en la URL del WebSocket', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX', 'Ana Pérez');
    WebSocketFalso.instancias[0].emitirMensaje({ tipo: 'conectado', asiento: 2, codigo: 'XXXXXX' });
    await promesa;
    expect(WebSocketFalso.instancias[0].url).toBe(
      'wss://ejemplo.test/unirse?codigo=XXXXXX&nombre=Ana%20P%C3%A9rez'
    );
  });
});

describe('CanalWebRTC — envío de mensajes', () => {
  it('usa el WebSocket para enviar mientras el data channel no está abierto', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    channel.enviar({ tipo: 'movimiento', payload: 4 });

    expect(ws.enviados.some(m => JSON.parse(m).tipo === 'movimiento')).toBe(true);
  });

  it('entrega al callback de alRecibir un mensaje de juego llegado por el WebSocket', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    const recibidos: unknown[] = [];
    channel.alRecibir(m => recibidos.push(m));
    ws.emitirMensaje({ tipo: 'movimiento', payload: 9 });

    expect(recibidos).toEqual([{ tipo: 'movimiento', payload: 9 }]);
  });

  it('no pierde un mensaje de juego llegado antes de registrar alRecibir: lo entrega en cuanto se registra', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    // El mensaje llega antes de que nadie haya llamado a alRecibir todavía
    // (p. ej. el 'nombre' del rival llegando antes de que Board.astro registre su callback).
    ws.emitirMensaje({ tipo: 'nombre', nombre: 'Rival' });

    const recibidos: unknown[] = [];
    channel.alRecibir(m => recibidos.push(m));

    expect(recibidos).toEqual([{ tipo: 'nombre', nombre: 'Rival' }]);

    // Un segundo mensaje, ya con el callback registrado, se entrega de inmediato sin pasar por el buffer.
    ws.emitirMensaje({ tipo: 'movimiento', payload: 1 });
    expect(recibidos).toEqual([{ tipo: 'nombre', nombre: 'Rival' }, { tipo: 'movimiento', payload: 1 }]);
  });

  it('el buffer solo se entrega una vez: un segundo alRecibir no vuelve a recibir mensajes ya entregados', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    ws.emitirMensaje({ tipo: 'nombre', nombre: 'Rival' });

    const primerCallback: unknown[] = [];
    channel.alRecibir(m => primerCallback.push(m));

    const segundoCallback: unknown[] = [];
    channel.alRecibir(m => segundoCallback.push(m));

    expect(primerCallback).toEqual([{ tipo: 'nombre', nombre: 'Rival' }]);
    expect(segundoCallback).toEqual([]);
  });
});

describe('CanalWebRTC — desconexión', () => {
  it('cambia a estado desconectado cuando llega rival-desconectado', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
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
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
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

describe('CanalWebRTC — timeout de conexión inicial', () => {
  it('crear() rechaza con ErrorSala("conexion") si "conectado" no llega en 10s, y cierra el WebSocket', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];

    const expectativa = expect(promesa).rejects.toMatchObject({ codigo: 'conexion' });
    await vi.advanceTimersByTimeAsync(10000);
    await expectativa;

    expect(ws.cerrado).toBe(true);
    vi.useRealTimers();
  });

  it('unirse() rechaza con ErrorSala("conexion") si "conectado" no llega en 10s', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'ABC123', 'Ana');

    const expectativa = expect(promesa).rejects.toMatchObject({ codigo: 'conexion' });
    await vi.advanceTimersByTimeAsync(10000);
    await expectativa;

    vi.useRealTimers();
  });

  it('si "conectado" llega antes del timeout, no rechaza (el timeout se limpia)', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });

    await vi.advanceTimersByTimeAsync(10000);
    const { codigo } = await promesa;

    expect(codigo).toBe('ABC123');
    vi.useRealTimers();
  });
});

describe('CanalWebRTC — enviar() no lanza si el WebSocket ya está cerrado', () => {
  it('enviar() no lanza cuando no hay data channel abierto y el WebSocket ya cerró', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    ws.close();

    expect(() => channel.enviar({ tipo: 'movimiento', payload: 1 })).not.toThrow();
    // No debería haberse intentado agregar nada nuevo a enviados una vez cerrado
    expect(ws.enviados.some(m => JSON.parse(m).tipo === 'movimiento')).toBe(false);
  });
});

describe('CanalWebRTC — cerrar()', () => {
  it('cierra el WebSocket subyacente', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    channel.cerrar();

    expect(ws.cerrado).toBe(true);
  });

  it('cierra también el data channel y la conexión RTCPeerConnection si ya existen', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    ws.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    ws.emitirMensaje({ tipo: 'rival-conectado' });
    const canal = RTCDataChannelFalso.instancias[0];
    canal.emitirAbierto();

    expect(() => channel.cerrar()).not.toThrow();
    expect(canal.readyState).toBe('closed');
  });

  it('cerrar() detiene el timer de fallback: no resucita el canal a "conectado" cuando el timeout de 15s dispara después', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));

    // Arma el timer de fallback (asiento 1 negociando, data channel aún no abre).
    ws.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    ws.emitirMensaje({ tipo: 'rival-conectado' });

    // El usuario cancela mientras la negociación P2P sigue en curso.
    channel.cerrar();

    // El timer de fallback de 15s, ya armado antes de cerrar(), no debe
    // resucitar el canal a 'conectado' una vez cerrado.
    vi.advanceTimersByTime(15000);

    expect(estados).not.toContain('conectado');
    expect(channel.estado).not.toBe('conectado');
    vi.useRealTimers();
  });
});

describe('CanalWebRTC — camino feliz P2P (asiento 1)', () => {
  it('pasa a conectado por P2P cuando el data channel emite open, y enviar() usa el data channel', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));

    ws.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    ws.emitirMensaje({ tipo: 'rival-conectado' });

    // createDataChannel() se llama de forma síncrona dentro de intentarIniciarNegociacion(),
    // antes de que la negociación (createOffer/setLocalDescription) se resuelva.
    const canal = RTCDataChannelFalso.instancias[0];
    expect(canal).toBeDefined();
    canal.emitirAbierto();

    expect(estados).toEqual(['conectado']);

    channel.enviar({ tipo: 'movimiento', payload: 4 });

    expect(canal.enviados.some(m => JSON.parse(m).tipo === 'movimiento')).toBe(true);
    expect(ws.enviados.some(m => JSON.parse(m).tipo === 'movimiento')).toBe(false);
  });

  it('entrega al callback de alRecibir un mensaje de juego llegado por el data channel', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    ws.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    ws.emitirMensaje({ tipo: 'rival-conectado' });

    const canal = RTCDataChannelFalso.instancias[0];
    canal.emitirAbierto();

    const recibidos: unknown[] = [];
    channel.alRecibir(m => recibidos.push(m));
    canal.emitirMensaje({ tipo: 'movimiento', payload: 7 });

    expect(recibidos).toEqual([{ tipo: 'movimiento', payload: 7 }]);
  });
});

describe('CanalWebRTC — responde a una oferta (asiento 2)', () => {
  it('unirse(): negocia setRemoteDescription/createAnswer/setLocalDescription, responde por WebSocket, y usa el canal recibido por ondatachannel para enviar', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'ABC123', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 2, codigo: 'ABC123' });
    const channel = await promesa;

    ws.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    ws.emitirMensaje({ tipo: 'oferta', sdp: 'oferta-remota' });

    // crearConexion() y la asignación de ondatachannel ocurren de forma síncrona
    // dentro de responderOferta(), antes de que la cadena de negociación se resuelva.
    const pc = RTCPeerConnectionFalso.instancias[0];
    expect(pc).toBeDefined();

    const canalRecibido = new RTCDataChannelFalso();
    pc.ondatachannel!({ channel: canalRecibido });
    canalRecibido.emitirAbierto();

    channel.enviar({ tipo: 'movimiento', payload: 2 });
    expect(canalRecibido.enviados.some(m => JSON.parse(m).tipo === 'movimiento')).toBe(true);

    // deja que la cadena setRemoteDescription -> createAnswer -> setLocalDescription -> ws.send se resuelva
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pc.llamadas.setRemoteDescription).toEqual([{ type: 'offer', sdp: 'oferta-remota' }]);
    expect(pc.llamadas.createAnswer).toBe(1);
    expect(pc.llamadas.setLocalDescription).toEqual([{ type: 'answer', sdp: 'respuesta-falsa' }]);

    const respuestaEnviada = ws.enviados.map(m => JSON.parse(m)).find(m => m.tipo === 'respuesta');
    expect(respuestaEnviada).toEqual({ tipo: 'respuesta', sdp: 'respuesta-falsa' });
  });
});

describe('CanalWebRTC — heartbeat (ping / pong)', () => {
  it('emite ping cada 15 segundos y no lo reenvía como mensaje de juego', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    const recibidos: unknown[] = [];
    channel.alRecibir(m => recibidos.push(m));

    // A los 15s debe enviar un ping
    vi.advanceTimersByTime(15000);

    const pings = ws.enviados.filter(m => JSON.parse(m).tipo === 'ping');
    expect(pings.length).toBe(1);

    // A los 30s debe haber enviado un segundo ping
    vi.advanceTimersByTime(15000);
    const pings2 = ws.enviados.filter(m => JSON.parse(m).tipo === 'ping');
    expect(pings2.length).toBe(2);

    expect(recibidos.length).toBe(0);
    vi.useRealTimers();
  });

  it('al recibir pong lo consume internamente y no lo entrega al callback de alRecibir', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    const recibidos: unknown[] = [];
    channel.alRecibir(m => recibidos.push(m));

    ws.emitirMensaje({ tipo: 'pong' });

    expect(recibidos.length).toBe(0);
  });
});

describe('CanalWebRTC — estados de desconexión y reconexión del rival', () => {
  it('pasa a estado reconectando-rival al recibir rival-desconectado-temporal y vuelve a conectado al recibir rival-reconectado', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));

    // El rival se desconecta temporalmente
    ws.emitirMensaje({ tipo: 'rival-desconectado-temporal', tiempoLimiteMs: 15000 });
    expect(channel.estado).toBe('reconectando-rival');
    expect(estados).toEqual(['reconectando-rival']);

    // El rival se reconecta dentro de la ventana
    ws.emitirMensaje({ tipo: 'rival-reconectado' });
    expect(channel.estado).toBe('conectado');
    expect(estados).toEqual(['reconectando-rival', 'conectado']);
  });
});

describe('CanalWebRTC — bucle de reconexión local', () => {
  it('reintenta reconectar automáticamente con /reconectar y token al cerrarse el WebSocket inesperadamente', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const wsInicial = WebSocketFalso.instancias[0];
    wsInicial.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    wsInicial.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    wsInicial.emitirMensaje({ tipo: 'rival-conectado' });
    const dataChannel = RTCDataChannelFalso.instancias[0];
    dataChannel.emitirAbierto();
    expect(channel.estado).toBe('conectado');

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));

    // Se cae el WebSocket
    wsInicial.emitirCierre(1006);

    // Debe haber pasado a estado reconectando
    expect(channel.estado).toBe('reconectando');
    expect(estados).toContain('reconectando');

    // Debe haber creado un nuevo WebSocket hacia /reconectar de inmediato
    expect(WebSocketFalso.instancias.length).toBe(2);
    const wsRecon = WebSocketFalso.instancias[1];
    expect(wsRecon.url).toBe(
      'wss://ejemplo.test/reconectar?codigo=ABC123&asiento=1&token=tok-123'
    );

    // El nuevo WebSocket recibe 'conectado'
    wsRecon.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });

    // Debe volver a estado conectado
    expect(channel.estado).toBe('conectado');
    expect(estados).toEqual(['reconectando', 'conectado']);

    vi.useRealTimers();
  });

  it('reintenta periódicamente cada 1.5s si el intento de reconexión falla', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const wsInicial = WebSocketFalso.instancias[0];
    wsInicial.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    wsInicial.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    wsInicial.emitirMensaje({ tipo: 'rival-conectado' });
    RTCDataChannelFalso.instancias[0]?.emitirAbierto();

    // Se cae el WebSocket
    wsInicial.emitirCierre(1006);
    expect(WebSocketFalso.instancias.length).toBe(2);

    // El primer intento de reconexión falla con error de red
    const wsIntento1 = WebSocketFalso.instancias[1];
    wsIntento1.emitirCierre(1006);

    // Avanzamos 1.5s
    vi.advanceTimersByTime(1500);

    // Se debe haber abierto un segundo intento de reconexión
    expect(WebSocketFalso.instancias.length).toBe(3);
    const wsIntento2 = WebSocketFalso.instancias[2];
    expect(wsIntento2.url).toBe(
      'wss://ejemplo.test/reconectar?codigo=ABC123&asiento=1&token=tok-123'
    );

    // El segundo intento responde exitosamente
    wsIntento2.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    expect(channel.estado).toBe('conectado');

    vi.useRealTimers();
  });

  it('si no logra reconectar en 15s, pasa a desconectado definitivamente', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const wsInicial = WebSocketFalso.instancias[0];
    wsInicial.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    wsInicial.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    wsInicial.emitirMensaje({ tipo: 'rival-conectado' });
    RTCDataChannelFalso.instancias[0]?.emitirAbierto();

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));

    // Se cae el WebSocket
    wsInicial.emitirCierre(1006);
    expect(channel.estado).toBe('reconectando');

    // Avanzamos 15s sin que ningún intento responda con 'conectado'
    vi.advanceTimersByTime(15000);

    expect(channel.estado).toBe('desconectado');
    expect(estados).toEqual(['reconectando', 'desconectado']);

    vi.useRealTimers();
  });

  it('si el servidor rechaza la reconexión con 4041, aborta reintentos y pasa a desconectado inmediatamente', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const wsInicial = WebSocketFalso.instancias[0];
    wsInicial.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    wsInicial.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    wsInicial.emitirMensaje({ tipo: 'rival-conectado' });
    RTCDataChannelFalso.instancias[0]?.emitirAbierto();

    const estados: string[] = [];
    channel.alCambiarEstado(e => estados.push(e));

    // Se cae el WebSocket
    wsInicial.emitirCierre(1006);
    expect(channel.estado).toBe('reconectando');

    // El socket de reconexión recibe 4041 (sala expirada o token inválido)
    const wsRecon = WebSocketFalso.instancias[1];
    wsRecon.emitirCierre(4041);

    expect(channel.estado).toBe('desconectado');
    expect(estados).toEqual(['reconectando', 'desconectado']);

    // No debe haber más intentos de reconexión tras avanzar el tiempo
    const numInstancias = WebSocketFalso.instancias.length;
    vi.advanceTimersByTime(3000);
    expect(WebSocketFalso.instancias.length).toBe(numInstancias);

    vi.useRealTimers();
  });

  it('los mensajes enviados durante la reconexión se encolan y se envían al restablecer la conexión', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const wsInicial = WebSocketFalso.instancias[0];
    wsInicial.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    // Ponemos en conectado vía relay
    wsInicial.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    wsInicial.emitirMensaje({ tipo: 'rival-conectado' });
    vi.advanceTimersByTime(15000);
    expect(channel.estado).toBe('conectado');

    // Se cae el WebSocket
    wsInicial.emitirCierre(1006);
    expect(channel.estado).toBe('reconectando');

    // Durante reconectando el usuario realiza un movimiento
    channel.enviar({ tipo: 'movimiento', payload: 99 });

    // Reconecta exitosamente
    const wsRecon = WebSocketFalso.instancias[1];
    wsRecon.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });

    expect(channel.estado).toBe('conectado');
    const enviadosRecon = wsRecon.enviados.map(m => JSON.parse(m));
    expect(enviadosRecon).toContainEqual({ tipo: 'movimiento', payload: 99 });

    vi.useRealTimers();
  });

  it('cerrar() detiene el intervalo de ping y los temporizadores de reconexión', async () => {
    vi.useFakeTimers();
    const promesa = CanalWebRTC.crear('wss://ejemplo.test', 'Ana');
    const wsInicial = WebSocketFalso.instancias[0];
    wsInicial.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123', tokenSesion: 'tok-123' });
    const { channel } = await promesa;

    wsInicial.emitirMensaje({ tipo: 'ice-servers', iceServers: [] });
    wsInicial.emitirMensaje({ tipo: 'rival-conectado' });
    RTCDataChannelFalso.instancias[0]?.emitirAbierto();

    // Se cae el WebSocket y entra a reconexión
    wsInicial.emitirCierre(1006);
    expect(channel.estado).toBe('reconectando');

    // El usuario cierra deliberadamente
    channel.cerrar();

    // Avanzamos el tiempo: no debe emitir pings ni generar nuevos WebSockets
    const totalInstancias = WebSocketFalso.instancias.length;
    const enviadosAntes = wsInicial.enviados.length;
    vi.advanceTimersByTime(30000);

    expect(WebSocketFalso.instancias.length).toBe(totalInstancias);
    expect(wsInicial.enviados.length).toBe(enviadosAntes);

    vi.useRealTimers();
  });
});
