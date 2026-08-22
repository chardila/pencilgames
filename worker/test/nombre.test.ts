import { describe, expect, it } from 'vitest';
import { normalizarNombre } from '../src/nombre';

describe('normalizarNombre', () => {
  it('recorta espacios al borde', () => {
    expect(normalizarNombre('  Ana  ')).toBe('ana');
  });

  it('no distingue mayúsculas', () => {
    expect(normalizarNombre('ANA')).toBe('ana');
  });

  it('deja un string vacío como vacío', () => {
    expect(normalizarNombre('   ')).toBe('');
  });

  it('acota nombres muy largos a 40 caracteres', () => {
    const largo = 'a'.repeat(100);
    expect(normalizarNombre(largo)).toBe('a'.repeat(40));
  });
});
