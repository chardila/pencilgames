import { describe, expect, it } from 'vitest';
import { generarCodigoSala } from '../src/roomCode';

describe('generarCodigoSala', () => {
  it('genera un código de 6 caracteres', () => {
    expect(generarCodigoSala()).toHaveLength(6);
  });

  it('solo usa caracteres del alfabeto sin ambigüedades', () => {
    const codigo = generarCodigoSala();
    expect(codigo).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('genera códigos distintos en llamadas sucesivas (no determinista)', () => {
    const codigos = new Set(Array.from({ length: 20 }, () => generarCodigoSala()));
    expect(codigos.size).toBeGreaterThan(1);
  });
});
