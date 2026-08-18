import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanalWebRTC } from './canalWebRTC';

class WebSocketFalso {
  static instancias: WebSocketFalso[] = [];
  listeners: Record<string, Array<(e: any) => void>> = {};
  enviados: string[] = [];
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
  emitirMensaje(datos: unknown) {
    for (const cb of this.listeners['message'] ?? []) cb({ data: JSON.stringify(datos) });
  }
  emitirCierre(code: number) {
    for (const cb of this.listeners['close'] ?? []) cb({ code });
  }
}

class RTCDataChannelFalso {
  readyState: 'connecting' | 'open' | 'closed' = 'connecting';
  listeners: Record<string, Array<(e: any) => void>> = {};
  addEventListener(tipo: string, cb: (e: any) => void) {
    (this.listeners[tipo] ??= []).push(cb);
  }
  send(_datos: string) {}
}

class RTCPeerConnectionFalso {
  onicecandidate: ((e: any) => void) | null = null;
  ondatachannel: ((e: any) => void) | null = null;
  createDataChannel(_nombre: string) {
    return new RTCDataChannelFalso();
  }
  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'oferta-falsa' });
  }
  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'respuesta-falsa' });
  }
  setLocalDescription(_desc: any) {
    return Promise.resolve();
  }
  setRemoteDescription(_desc: any) {
    return Promise.resolve();
  }
  addIceCandidate(_c: any) {
    return Promise.resolve();
  }
}

beforeEach(() => {
  WebSocketFalso.instancias.length = 0;
  vi.stubGlobal('WebSocket', WebSocketFalso);
  vi.stubGlobal('RTCPeerConnection', RTCPeerConnectionFalso);
});

describe('CanalWebRTC.crear / unirse', () => {
  it('crear() resuelve con el asiento y código que envía el servidor', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    WebSocketFalso.instancias[0].emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel, codigo } = await promesa;
    expect(codigo).toBe('ABC123');
    expect(channel.asiento).toBe(1);
  });

  it('unirse() rechaza con ErrorSala("invalido") si el servidor cierra con 4040', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX');
    WebSocketFalso.instancias[0].emitirCierre(4040);
    await expect(promesa).rejects.toMatchObject({ codigo: 'invalido' });
  });

  it('unirse() rechaza con ErrorSala("llena") si el servidor cierra con 4090', async () => {
    const promesa = CanalWebRTC.unirse('wss://ejemplo.test', 'XXXXXX');
    WebSocketFalso.instancias[0].emitirCierre(4090);
    await expect(promesa).rejects.toMatchObject({ codigo: 'llena' });
  });
});

describe('CanalWebRTC — envío de mensajes', () => {
  it('usa el WebSocket para enviar mientras el data channel no está abierto', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    channel.enviar({ tipo: 'movimiento', payload: 4 });

    expect(ws.enviados.some(m => JSON.parse(m).tipo === 'movimiento')).toBe(true);
  });

  it('entrega al callback de alRecibir un mensaje de juego llegado por el WebSocket', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
    const ws = WebSocketFalso.instancias[0];
    ws.emitirMensaje({ tipo: 'conectado', asiento: 1, codigo: 'ABC123' });
    const { channel } = await promesa;

    const recibidos: unknown[] = [];
    channel.alRecibir(m => recibidos.push(m));
    ws.emitirMensaje({ tipo: 'movimiento', payload: 9 });

    expect(recibidos).toEqual([{ tipo: 'movimiento', payload: 9 }]);
  });
});

describe('CanalWebRTC — desconexión', () => {
  it('cambia a estado desconectado cuando llega rival-desconectado', async () => {
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
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
    const promesa = CanalWebRTC.crear('wss://ejemplo.test');
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
