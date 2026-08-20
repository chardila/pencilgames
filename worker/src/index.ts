export { Room } from './room';
import { esCodigoSalaValido, generarCodigoSala } from './roomCode';

export interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  // Origen exacto del sitio estático (p. ej. "https://games.cardila.com").
  // Debe configurarse en producción (wrangler.toml [vars] o como secreto) —
  // eso es un paso operativo fuera de esta rama. Si no está configurada
  // (típicamente en `wrangler dev` local, donde el sitio corre en
  // http://localhost:4321 o similar y no hay un único origen fijo que
  // hardcodear), se omite la verificación de Origin — ver comentario en
  // verificarOrigen().
  ALLOWED_ORIGIN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/crear') {
      const rechazoOrigen = verificarOrigen(request, env);
      if (rechazoOrigen) return rechazoOrigen;
      return derivarASala(request, env, 'crear', generarCodigoSala());
    }

    if (url.pathname === '/unirse') {
      const codigo = url.searchParams.get('codigo');
      if (!codigo) {
        return new Response('Falta el código de sala', { status: 400 });
      }
      // Se valida el formato del código ANTES de cualquier otra cosa —
      // incluida la verificación de Origin — para que un código con formato
      // inválido nunca llegue a tocar el Durable Object, sin importar cómo
      // esté configurado ALLOWED_ORIGIN. Esta es la mitigación central del
      // hallazgo de seguridad: sin ella, cualquiera que abra dos WebSockets
      // a una sala mintea credenciales TURN reales (facturables) vía
      // Room.completarSala().
      if (!esCodigoSalaValido(codigo)) {
        return new Response('Código de sala inválido', { status: 400 });
      }
      const rechazoOrigen = verificarOrigen(request, env);
      if (rechazoOrigen) return rechazoOrigen;
      return derivarASala(request, env, 'unirse', codigo);
    }

    return new Response('No encontrado', { status: 404 });
  },
};

// Devuelve una Response de rechazo si el Origin no coincide con
// ALLOWED_ORIGIN, o null si la petición puede continuar. Exportada para
// poder probar directamente el camino "sin ALLOWED_ORIGIN configurada"
// (el que usa `wrangler dev` y el que corre en producción hasta que se
// configure el var/secret) sin depender de cómo esté fijado el binding en
// el entorno de test — ver worker/test/index.test.ts.
export function verificarOrigen(request: Request, env: Env): Response | null {
  if (!env.ALLOWED_ORIGIN) {
    // Sin ALLOWED_ORIGIN configurada (dev local con `wrangler dev`, o antes
    // de configurar el secreto/var en producción) no hay un origen único
    // contra el cual comparar, así que se omite la verificación. La
    // validación de formato de código de sala arriba se aplica siempre y no
    // depende de esto.
    return null;
  }
  const origen = request.headers.get('Origin');
  if (origen !== env.ALLOWED_ORIGIN) {
    return new Response('Origen no permitido', { status: 403 });
  }
  return null;
}

function derivarASala(request: Request, env: Env, rol: 'crear' | 'unirse', codigo: string): Promise<Response> {
  const id = env.ROOMS.idFromName(codigo);
  const stub = env.ROOMS.get(id);
  const url = new URL(request.url);
  url.pathname = '/conectar';
  url.searchParams.set('rol', rol);
  url.searchParams.set('codigo', codigo);
  return stub.fetch(new Request(url, request));
}
