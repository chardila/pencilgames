import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICE_SERVERS_STUN_FALLBACK, obtenerCredencialesTurn } from '../src/turn';
import type { Env } from '../src/index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('obtenerCredencialesTurn', () => {
  it('llama al endpoint de Cloudflare Realtime con el TTL correcto y devuelve iceServers', async () => {
    const respuestaFalsa = {
      iceServers: [{ urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' }],
    };
    const fetchFalso = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(respuestaFalsa),
    });
    vi.stubGlobal('fetch', fetchFalso);

    const env = { TURN_KEY_ID: 'clave-123', TURN_KEY_API_TOKEN: 'token-abc' } as Env;
    const resultado = await obtenerCredencialesTurn(env);

    expect(fetchFalso).toHaveBeenCalledWith(
      'https://rtc.live.cloudflare.com/v1/turn/keys/clave-123/credentials/generate-ice-servers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-abc' }),
        body: JSON.stringify({ ttl: 3600 }),
      })
    );
    expect(resultado).toEqual(respuestaFalsa.iceServers);
  });

  it('lanza un error si faltan las credenciales de cuenta', async () => {
    await expect(obtenerCredencialesTurn({} as Env)).rejects.toThrow();
  });

  it('lanza un error si la API responde con un status de error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const env = { TURN_KEY_ID: 'x', TURN_KEY_API_TOKEN: 'y' } as Env;
    await expect(obtenerCredencialesTurn(env)).rejects.toThrow();
  });
});

describe('ICE_SERVERS_STUN_FALLBACK', () => {
  it('incluye el STUN gratuito de Cloudflare', () => {
    expect(ICE_SERVERS_STUN_FALLBACK[0].urls).toContain('stun:stun.cloudflare.com:3478');
  });
});
