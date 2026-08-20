import { describe, expect, it, vi } from 'vitest';
import * as canalWebRTC from './canalWebRTC';
import { crearSala, unirseASala } from './sala';

describe('crearSala', () => {
  it('delega en CanalWebRTC.crear con la URL dada', async () => {
    const resultadoFalso = { channel: {} as any, codigo: 'ABC123' };
    const espia = vi.spyOn(canalWebRTC.CanalWebRTC, 'crear').mockResolvedValue(resultadoFalso);

    const resultado = await crearSala('wss://ejemplo.test');

    expect(espia).toHaveBeenCalledWith('wss://ejemplo.test');
    expect(resultado).toBe(resultadoFalso);
    espia.mockRestore();
  });
});

describe('unirseASala', () => {
  it('delega en CanalWebRTC.unirse con la URL y el código dados', async () => {
    const canalFalso = {} as any;
    const espia = vi.spyOn(canalWebRTC.CanalWebRTC, 'unirse').mockResolvedValue(canalFalso);

    const resultado = await unirseASala('ABC123', 'wss://ejemplo.test');

    expect(espia).toHaveBeenCalledWith('wss://ejemplo.test', 'ABC123');
    expect(resultado).toBe(canalFalso);
    espia.mockRestore();
  });
});
