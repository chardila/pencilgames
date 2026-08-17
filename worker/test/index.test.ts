import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

describe('worker por defecto', () => {
  it('responde 404 a una ruta desconocida', async () => {
    const respuesta = await SELF.fetch('https://ejemplo.test/lo-que-sea');
    expect(respuesta.status).toBe(404);
  });
});
