import { env, runInDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

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

function conectar(
  rol: 'crear' | 'unirse' | 'reconectar',
  codigo: string,
  nombre?: string,
  asiento?: 1 | 2,
  token?: string,
  timeoutGraciaMs?: number
): Promise<WebSocket> {
  const id = env.ROOMS.idFromName(codigo);
  const stub = env.ROOMS.get(id);
  const nombreQuery = nombre ? `&nombre=${encodeURIComponent(nombre)}` : '';
  const asientoQuery = asiento ? `&asiento=${asiento}` : '';
  const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
  const timeoutQuery = timeoutGraciaMs ? `&timeoutGraciaMs=${timeoutGraciaMs}` : '';
  return stub
    .fetch(
      `https://ejemplo.test/conectar?rol=${rol}&codigo=${codigo}${nombreQuery}${asientoQuery}${tokenQuery}${timeoutQuery}`,
      {
        headers: { Upgrade: 'websocket' },
      }
    )
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
  it('crea una sala y confirma el asiento 1 con token de sesión', async () => {
    const ws = await conectar('crear', 'CODIGO01');
    const mensaje = await esperarMensajeDeTipo(ws, 'conectado');
    expect(mensaje).toEqual({
      tipo: 'conectado',
      asiento: 1,
      codigo: 'CODIGO01',
      tokenSesion: expect.any(String),
    });
    expect(mensaje.tokenSesion.length).toBeGreaterThan(0);
  });

  it('permite unirse con un código válido y avisa a ambos que el rival se conectó', async () => {
    const ws1 = await conectar('crear', 'CODIGO02');
    await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar('unirse', 'CODIGO02');
    const conectado2 = await esperarMensajeDeTipo(ws2, 'conectado');
    expect(conectado2).toEqual({
      tipo: 'conectado',
      asiento: 2,
      codigo: 'CODIGO02',
      tokenSesion: expect.any(String),
    });
    expect(conectado2.tokenSesion.length).toBeGreaterThan(0);

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

  it('rechaza unirse con el mismo nombre que el creador (sin distinguir mayúsculas ni espacios) con cierre 4091', async () => {
    const ws1 = await conectar('crear', 'CODIGO06', 'Ana');
    await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar('unirse', 'CODIGO06', ' ana ');
    const codigoCierre = await esperarCierre(ws2);
    expect(codigoCierre).toBe(4091);
  });

  it('tras un rechazo por nombre duplicado, el asiento 2 sigue libre para un nombre distinto', async () => {
    const ws1 = await conectar('crear', 'CODIGO07', 'Ana');
    await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar('unirse', 'CODIGO07', 'Ana');
    await esperarCierre(ws2);

    const ws3 = await conectar('unirse', 'CODIGO07', 'Beto');
    const conectado3 = await esperarMensajeDeTipo(ws3, 'conectado');
    expect(conectado3).toEqual({
      tipo: 'conectado',
      asiento: 2,
      codigo: 'CODIGO07',
      tokenSesion: expect.any(String),
    });
  });

  it('permite unirse sin nombre aunque el creador tampoco haya mandado uno', async () => {
    const ws1 = await conectar('crear', 'CODIGO08');
    await esperarMensajeDeTipo(ws1, 'conectado');

    const ws2 = await conectar('unirse', 'CODIGO08');
    const conectado2 = await esperarMensajeDeTipo(ws2, 'conectado');
    expect(conectado2).toEqual({
      tipo: 'conectado',
      asiento: 2,
      codigo: 'CODIGO08',
      tokenSesion: expect.any(String),
    });
  });

  it('avisa al rival con rival-desconectado-temporal cuando un jugador se desconecta', async () => {
    const ws1 = await conectar('crear', 'CODIGO05');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'CODIGO05');
    await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws2.close();
    const aviso = await esperarMensajeDeTipo(ws1, 'rival-desconectado-temporal');
    expect(aviso).toEqual({ tipo: 'rival-desconectado-temporal', tiempoLimiteMs: 15000 });
  });

  it('responde a ping con pong sin reenviarlo al rival', async () => {
    const ws1 = await conectar('crear', 'PING01');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'PING01');
    await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws1.send(JSON.stringify({ tipo: 'ping' }));
    const pong = await esperarMensajeDeTipo(ws1, 'pong');
    expect(pong).toEqual({ tipo: 'pong' });

    // Enviar un mensaje normal después para verificar que el pong no fue enviado al rival
    ws1.send(JSON.stringify({ tipo: 'mensaje-normal', payload: 'ok' }));
    const normal = await esperarMensajeDeTipo(ws2, 'mensaje-normal');
    expect(normal).toEqual({ tipo: 'mensaje-normal', payload: 'ok' });

    const buzon2 = buzones.get(ws2)!;
    expect(buzon2.mensajes.some(m => m.tipo === 'ping' || m.tipo === 'pong')).toBe(false);
  });

  it('emite tokenSesion al conectar y permite reconexión tras desconexión temporal', async () => {
    const ws1 = await conectar('crear', 'RECON01');
    const con1 = await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'RECON01');
    const con2 = await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws2.close();
    const temp = await esperarMensajeDeTipo(ws1, 'rival-desconectado-temporal');
    expect(temp).toEqual({ tipo: 'rival-desconectado-temporal', tiempoLimiteMs: 15000 });

    const ws2Recon = await conectar('reconectar', 'RECON01', undefined, 2, con2.tokenSesion);
    const conRecon = await esperarMensajeDeTipo(ws2Recon, 'conectado');
    expect(conRecon).toEqual({
      tipo: 'conectado',
      asiento: 2,
      codigo: 'RECON01',
      tokenSesion: con2.tokenSesion,
    });

    const rivalRecon = await esperarMensajeDeTipo(ws1, 'rival-reconectado');
    expect(rivalRecon).toEqual({ tipo: 'rival-reconectado' });

    // Verificar que el canal sigue funcionando
    ws2Recon.send(JSON.stringify({ tipo: 'movimiento', payload: 42 }));
    const mov = await esperarMensajeDeTipo(ws1, 'movimiento');
    expect(mov).toEqual({ tipo: 'movimiento', payload: 42 });
  });

  it('rechaza reconexión con token inválido con cierre 4041', async () => {
    const ws1 = await conectar('crear', 'RECON02');
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'RECON02');
    await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws2.close();
    await esperarMensajeDeTipo(ws1, 'rival-desconectado-temporal');

    const wsInvalido = await conectar('reconectar', 'RECON02', undefined, 2, 'token-falso');
    const codigoCierre = await esperarCierre(wsInvalido);
    expect(codigoCierre).toBe(4041);
  });

  it('rechaza reconexión a sala no existente con cierre 4041', async () => {
    const wsInvalido = await conectar('reconectar', 'NOEXISTE', undefined, 1, 'token-random');
    const codigoCierre = await esperarCierre(wsInvalido);
    expect(codigoCierre).toBe(4041);
  });

  it('al vencer el temporizador sin reconexión, emite rival-desconectado definitivo y elimina el token', async () => {
    const ws1 = await conectar('crear', 'EXPIRA01', undefined, undefined, undefined, 50);
    await esperarMensajeDeTipo(ws1, 'conectado');
    const ws2 = await conectar('unirse', 'EXPIRA01', undefined, undefined, undefined, 50);
    const con2 = await esperarMensajeDeTipo(ws2, 'conectado');
    await esperarMensajeDeTipo(ws1, 'rival-conectado');

    ws2.close();
    const temp = await esperarMensajeDeTipo(ws1, 'rival-desconectado-temporal');
    expect(temp.tiempoLimiteMs).toBe(50);

    const def = await esperarMensajeDeTipo(ws1, 'rival-desconectado');
    expect(def).toEqual({ tipo: 'rival-desconectado' });

    // Intentar reconectar después de que expiró la gracia debe fallar con 4041
    const wsReconExpirado = await conectar('reconectar', 'EXPIRA01', undefined, 2, con2.tokenSesion);
    const codigoCierre = await esperarCierre(wsReconExpirado);
    expect(codigoCierre).toBe(4041);
  });

  it('crear programa una alarma de limpieza y al dispararse borra el storage de la sala', async () => {
    const ws1 = await conectar('crear', 'LIMPIA01');
    await esperarMensajeDeTipo(ws1, 'conectado');

    const stub = env.ROOMS.get(env.ROOMS.idFromName('LIMPIA01'));

    const antes = await runInDurableObject(stub, (_instance, state) =>
      Promise.all([state.storage.get('creadaEn'), state.storage.getAlarm()])
    );
    expect(typeof antes[0]).toBe('number');
    expect(antes[1]).not.toBeNull();

    const corrio = await runDurableObjectAlarm(stub);
    expect(corrio).toBe(true);

    const despues = await runInDurableObject(stub, (_instance, state) =>
      Promise.all([state.storage.get('creadaEn'), state.storage.getAlarm()])
    );
    expect(despues[0]).toBeUndefined();
    expect(despues[1]).toBeNull();

    ws1.close();
  });
});
