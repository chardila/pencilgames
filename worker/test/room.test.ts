import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

// Buzón por socket: agrega un único listener persistente en cuanto se acepta
// la conexión (dentro de `conectar`, antes de devolver el WebSocket). Esto
// evita perder mensajes: `esperarMensajeDeTipo` original añadía y quitaba un
// listener por cada espera, y en la ventana sin listener entre una espera y
// la siguiente, los mensajes que llegaban (p. ej. `ice-servers` seguido de
// `rival-conectado`, ambos enviados por `Room` antes de que se resuelva el
// `fetch` del segundo jugador) se despachaban a cero listeners y se perdían
// para siempre — dejando la siguiente espera colgada indefinidamente.
interface Buzon {
  mensajes: any[];
  esperas: Array<{ tipo: string; resolve: (mensaje: any) => void }>;
}

const buzones = new WeakMap<WebSocket, Buzon>();

function conectar(rol: 'crear' | 'unirse', codigo: string): Promise<WebSocket> {
  const id = env.ROOMS.idFromName(codigo);
  const stub = env.ROOMS.get(id);
  return stub
    .fetch(`https://ejemplo.test/conectar?rol=${rol}&codigo=${codigo}`, {
      headers: { Upgrade: 'websocket' },
    })
    .then(respuesta => {
      const ws = respuesta.webSocket!;
      ws.accept();

      const buzon: Buzon = { mensajes: [], esperas: [] };
      buzones.set(ws, buzon);
      ws.addEventListener('message', evento => {
        const mensaje = JSON.parse(evento.data as string);
        const indice = buzon.esperas.findIndex(espera => espera.tipo === mensaje.tipo);
        if (indice >= 0) {
          buzon.esperas.splice(indice, 1)[0].resolve(mensaje);
        } else {
          buzon.mensajes.push(mensaje);
        }
      });

      return ws;
    });
}

function esperarMensajeDeTipo(ws: WebSocket, tipo: string): Promise<any> {
  const buzon = buzones.get(ws)!;
  const indice = buzon.mensajes.findIndex(mensaje => mensaje.tipo === tipo);
  if (indice >= 0) {
    return Promise.resolve(buzon.mensajes.splice(indice, 1)[0]);
  }
  return new Promise(resolve => buzon.esperas.push({ tipo, resolve }));
}

function esperarCierre(ws: WebSocket): Promise<number> {
  return new Promise(resolve => {
    ws.addEventListener('close', evento => resolve(evento.code), { once: true });
  });
}

describe('Room', () => {
  it('crea una sala y confirma el asiento 1', async () => {
    const ws = await conectar('crear', 'CODIGO01');
    const mensaje = await esperarMensajeDeTipo(ws, 'conectado');
    expect(mensaje).toEqual({ tipo: 'conectado', asiento: 1, codigo: 'CODIGO01' });
  });

  it('permite unirse con un código válido y avisa a ambos que el rival se conectó', async () => {
    const ws1 = await conectar('crear', 'CODIGO02');
    await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar('unirse', 'CODIGO02');
    const conectado2 = await esperarMensajeDeTipo(ws2, 'conectado');
    expect(conectado2).toEqual({ tipo: 'conectado', asiento: 2, codigo: 'CODIGO02' });

    const rival1 = await esperarMensajeDeTipo(ws1, 'rival-conectado');
    expect(rival1.tipo).toBe('rival-conectado');
  });

  it('rechaza un código inexistente con cierre 4040', async () => {
    const ws = await conectar('unirse', 'NOEXISTE');
    const codigoCierre = await esperarCierre(ws);
    expect(codigoCierre).toBe(4040);
  });

  it('rechaza unirse a una sala ya llena con cierre 4090', async () => {
    const ws1 = await conectar('crear', 'CODIGO03');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'CODIGO03');
    await esperarMensajeDeTipo(ws2, 'conectado');

    const ws3 = await conectar('unirse', 'CODIGO03');
    const codigoCierre = await esperarCierre(ws3);
    expect(codigoCierre).toBe(4090);
  });

  it('retransmite un mensaje de un jugador al otro', async () => {
    const ws1 = await conectar('crear', 'CODIGO04');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'CODIGO04');
    await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws1.send(JSON.stringify({ tipo: 'movimiento', payload: 4 }));
    const recibido = await esperarMensajeDeTipo(ws2, 'movimiento');
    expect(recibido).toEqual({ tipo: 'movimiento', payload: 4 });
  });

  it('avisa al rival cuando un jugador se desconecta', async () => {
    const ws1 = await conectar('crear', 'CODIGO05');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'CODIGO05');
    await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws2.close();
    const aviso = await esperarMensajeDeTipo(ws1, 'rival-desconectado');
    expect(aviso).toEqual({ tipo: 'rival-desconectado' });
  });
});
