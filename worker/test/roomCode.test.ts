import { describe, expect, it } from 'vitest';
import { esCodigoSalaValido, generarCodigoSala } from '../src/roomCode';

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

  it('no colisiona en 500 llamadas (entropía suficiente con crypto)', () => {
    const codigos = new Set(Array.from({ length: 500 }, () => generarCodigoSala()));
    expect(codigos.size).toBe(500);
  });

  it('usa todo el alfabeto, no solo un prefijo (sin sesgo de módulo)', () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 400; i++) {
      for (const ch of generarCodigoSala()) vistos.add(ch);
    }
    expect(vistos.size).toBe(31);
  });

  it('todo código generado es aceptado por esCodigoSalaValido', () => {
    for (let i = 0; i < 50; i++) {
      expect(esCodigoSalaValido(generarCodigoSala())).toBe(true);
    }
  });
});

describe('esCodigoSalaValido', () => {
  it('acepta un código de 6 caracteres del alfabeto', () => {
    expect(esCodigoSalaValido('ABCDEF')).toBe(true);
  });

  it('rechaza letras ambiguas fuera del alfabeto (I, O, 0, 1)', () => {
    expect(esCodigoSalaValido('ABCIEF')).toBe(false);
    expect(esCodigoSalaValido('ABCOEF')).toBe(false);
    expect(esCodigoSalaValido('ABC0EF')).toBe(false);
    expect(esCodigoSalaValido('ABC1EF')).toBe(false);
  });

  it('rechaza longitudes distintas de 6', () => {
    expect(esCodigoSalaValido('ABCDE')).toBe(false);
    expect(esCodigoSalaValido('ABCDEFG')).toBe(false);
    expect(esCodigoSalaValido('')).toBe(false);
  });

  it('rechaza minúsculas', () => {
    expect(esCodigoSalaValido('abcdef')).toBe(false);
  });

  it('rechaza caracteres no alfanuméricos', () => {
    expect(esCodigoSalaValido('ABC-EF')).toBe(false);
  });
});
