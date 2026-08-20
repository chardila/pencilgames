import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { verificarOrigen } from '../src/index';
import type { Env } from '../src/index';

// verificarOrigen() se prueba directamente como función pura (sin pasar por
// SELF.fetch/el pool de Workers) porque el entorno de test fija
// ALLOWED_ORIGIN globalmente vía miniflare.bindings (ver vitest.config.ts):
// eso deja bien cubierto el camino "Origin no coincide" a través de
// SELF.fetch más abajo, pero no hay forma de simular ahí el camino "sin
// ALLOWED_ORIGIN configurada" — que es justamente el que usa `wrangler dev`
// y el que corre en producción hasta el paso operativo de configurarla.
describe('verificarOrigen', () => {
  it('sin ALLOWED_ORIGIN configurada, deja pasar la petición sin importar el Origin', () => {
    const env = {} as Env;
    const conOrigin = new Request('https://ejemplo.test/crear', { headers: { Origin: 'https://cualquiera.test' } });
    const sinOrigin = new Request('https://ejemplo.test/crear');
    expect(verificarOrigen(conOrigin, env)).toBeNull();
    expect(verificarOrigen(sinOrigin, env)).toBeNull();
  });

  it('con ALLOWED_ORIGIN configurada y Origin coincidente, deja pasar la petición', () => {
    const env = { ALLOWED_ORIGIN: 'https://games.cardila.com' } as Env;
    const request = new Request('https://ejemplo.test/crear', {
      headers: { Origin: 'https://games.cardila.com' },
    });
    expect(verificarOrigen(request, env)).toBeNull();
  });

  it('con ALLOWED_ORIGIN configurada y Origin ausente o distinto, rechaza con 403', () => {
    const env = { ALLOWED_ORIGIN: 'https://games.cardila.com' } as Env;
    const distinto = new Request('https://ejemplo.test/crear', { headers: { Origin: 'https://sitio-ajeno.test' } });
    const ausente = new Request('https://ejemplo.test/crear');
    expect(verificarOrigen(distinto, env)?.status).toBe(403);
    expect(verificarOrigen(ausente, env)?.status).toBe(403);
  });
});

// Debe coincidir con ALLOWED_ORIGIN definida en vitest.config.ts
// (poolOptions.workers.miniflare.bindings) — configurada solo para el
// entorno de test, no en wrangler.toml (que la deja sin configurar hasta
// que se fije el var/secret real en producción).
const ORIGEN_PERMITIDO = 'https://ejemplo.test';

interface Buzon {
  mensajes: any[];
  esperas: Array<{ tipo: string; resolver: (mensaje: any) => void }>;
}

const buzones = new WeakMap<WebSocket, Buzon>();

function conectar(path: string): Promise<WebSocket> {
  return SELF.fetch(`https://ejemplo.test${path}`, {
    headers: { Upgrade: 'websocket', Origin: ORIGEN_PERMITIDO },
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
      headers: { Upgrade: 'websocket', Origin: ORIGEN_PERMITIDO },
    });
    expect(respuesta.status).toBe(400);
  });

  it('responde 400 a /unirse con un código de formato inválido, sin llegar al Durable Object', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/unirse?codigo=demasiado-largo-y-minusculas', {
      headers: { Upgrade: 'websocket', Origin: ORIGEN_PERMITIDO },
    });
    expect(respuesta.status).toBe(400);
    // Si hubiera llegado al Durable Object, sería un upgrade (101 + webSocket)
    // o un 426 por falta de header Upgrade — nunca un 400 con webSocket null.
    expect(respuesta.webSocket).toBeNull();
  });

  it('responde 400 a /unirse con un código de longitud correcta pero alfabeto inválido (letras ambiguas I/O/0/1)', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/unirse?codigo=ABCIO1', {
      headers: { Upgrade: 'websocket', Origin: ORIGEN_PERMITIDO },
    });
    expect(respuesta.status).toBe(400);
    expect(respuesta.webSocket).toBeNull();
  });

  it('el chequeo de formato de código corre antes que el de Origin: un código inválido da 400 aunque el Origin tampoco coincida', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/unirse?codigo=demasiado-largo-y-minusculas', {
      headers: { Upgrade: 'websocket', Origin: 'https://sitio-ajeno.test' },
    });
    expect(respuesta.status).toBe(400);
    expect(respuesta.webSocket).toBeNull();
  });

  it('rechaza /crear con 403 cuando el Origin no coincide con ALLOWED_ORIGIN', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/crear', {
      headers: { Upgrade: 'websocket', Origin: 'https://sitio-ajeno.test' },
    });

    expect(respuesta.status).toBe(403);
    expect(respuesta.webSocket).toBeNull();
  });

  it('rechaza /unirse con 403 cuando el Origin no coincide con ALLOWED_ORIGIN, incluso con código de formato válido', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/unirse?codigo=ABCDEF', {
      headers: { Upgrade: 'websocket', Origin: 'https://sitio-ajeno.test' },
    });

    expect(respuesta.status).toBe(403);
    expect(respuesta.webSocket).toBeNull();
  });

  it('permite /crear cuando el Origin coincide con ALLOWED_ORIGIN', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/crear', {
      headers: { Upgrade: 'websocket', Origin: ORIGEN_PERMITIDO },
    });

    expect(respuesta.status).toBe(101);
    expect(respuesta.webSocket).not.toBeNull();
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
