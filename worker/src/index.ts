export { Room } from './room';
import { generarCodigoSala } from './roomCode';

export interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/crear') {
      return derivarASala(request, env, 'crear', generarCodigoSala());
    }

    if (url.pathname === '/unirse') {
      const codigo = url.searchParams.get('codigo');
      if (!codigo) {
        return new Response('Falta el código de sala', { status: 400 });
      }
      return derivarASala(request, env, 'unirse', codigo);
    }

    return new Response('No encontrado', { status: 404 });
  },
};

function derivarASala(request: Request, env: Env, rol: 'crear' | 'unirse', codigo: string): Promise<Response> {
  const id = env.ROOMS.idFromName(codigo);
  const stub = env.ROOMS.get(id);
  const url = new URL(request.url);
  url.pathname = '/conectar';
  url.searchParams.set('rol', rol);
  url.searchParams.set('codigo', codigo);
  return stub.fetch(new Request(url, request));
}
