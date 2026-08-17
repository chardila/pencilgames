import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

interface Buzon {
  mensajes: any[];
  esperas: Array<{ tipo: string; resolver: (mensaje: any) => void }>;
}

const buzones = new WeakMap<WebSocket, Buzon>();

function conectar(path: string): Promise<WebSocket> {
  return SELF.fetch(`https://ejemplo.test${path}`, {
    headers: { Upgrade: 'websocket' },
  }).then(respuesta => {
    const ws = respuesta.webSocket!;
    ws.accept();
    adjuntarBuzon(ws);
    return ws;
  });
}

function adjuntarBuzon(ws: WebSocket): void {
  const buzon: Buzon = { mensajes: [], esperas: [] };
  buzones.set(ws, buzon);
  ws.addEventListener('message', evento => {
    const mensaje = JSON.parse(evento.data as string);
    const indice = buzon.esperas.findIndex(e => e.tipo === mensaje.tipo);
    if (indice >= 0) {
      const [espera] = buzon.esperas.splice(indice, 1);
      espera.resolver(mensaje);
    } else {
      buzon.mensajes.push(mensaje);
    }
  });
}

function esperarMensajeDeTipo(ws: WebSocket, tipo: string): Promise<any> {
  const buzon = buzones.get(ws)!;
  const indice = buzon.mensajes.findIndex(m => m.tipo === tipo);
  if (indice >= 0) {
    const [mensaje] = buzon.mensajes.splice(indice, 1);
    return Promise.resolve(mensaje);
  }
  return new Promise(resolve => {
    buzon.esperas.push({ tipo, resolver: resolve });
  });
}

describe('Worker — flujo completo crear/unirse', () => {
  it('responde 404 a una ruta desconocida', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/lo-que-sea');
    expect(respuesta.status).toBe(404);
  });

  it('responde 400 a /unirse sin código', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/unirse', {
      headers: { Upgrade: 'websocket' },
    });
    expect(respuesta.status).toBe(400);
  });

  it('/crear seguido de /unirse con ese código conecta a los dos jugadores', async () => {
    const ws1 = await conectar('/crear');
    const { codigo } = await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar(`/unirse?codigo=${codigo}`);
    const conectado2 = await esperarMensajeDeTipo(ws2, 'conectado');
    expect(conectado2.asiento).toBe(2);

    ws1.send(JSON.stringify({ tipo: 'movimiento', payload: 7 }));
    const recibido = await esperarMensajeDeTipo(ws2, 'movimiento');
    expect(recibido).toEqual({ tipo: 'movimiento', payload: 7 });
  });
});
