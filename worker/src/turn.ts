import type { Env } from './index';

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export const ICE_SERVERS_STUN_FALLBACK: IceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
];

const TTL_SEGUNDOS = 3600;

export async function obtenerCredencialesTurn(env: Env): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
    throw new Error('Credenciales TURN no configuradas (TURN_KEY_ID / TURN_KEY_API_TOKEN)');
  }

  const respuesta = await fetch(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TTL_SEGUNDOS }),
    }
  );

  if (!respuesta.ok) {
    throw new Error(`La API de Cloudflare Realtime respondió ${respuesta.status}`);
  }

  const datos = (await respuesta.json()) as { iceServers: IceServer[] };
  return datos.iceServers;
}
