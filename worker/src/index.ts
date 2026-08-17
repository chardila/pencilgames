export { Room } from './room';

export interface Env {
  ROOMS: DurableObjectNamespace;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export default {
  async fetch(_request: Request, _env: Env): Promise<Response> {
    return new Response('No encontrado', { status: 404 });
  },
};
