import { describe, expect, it } from 'vitest';
import {
  DIFICULTADES,
  DIFICULTAD_INFO,
  NOMBRE_BOT,
  elegirAlAzar,
  esDificultad,
} from './tipos';

describe('bot/tipos', () => {
  it('define las 3 dificultades con icono, texto y descripción', () => {
    expect(DIFICULTADES).toEqual(['facil', 'medio', 'dificil']);
    expect(NOMBRE_BOT).toBe('Robot');
    for (const d of DIFICULTADES) {
      expect(DIFICULTAD_INFO[d].icono).not.toBe('');
      expect(DIFICULTAD_INFO[d].texto).not.toBe('');
      expect(DIFICULTAD_INFO[d].descripcion).not.toBe('');
    }
  });

  it('esDificultad valida solo los 3 niveles permitidos', () => {
    expect(esDificultad('facil')).toBe(true);
    expect(esDificultad('medio')).toBe(true);
    expect(esDificultad('dificil')).toBe(true);
    expect(esDificultad('imposible')).toBe(false);
    expect(esDificultad(null)).toBe(false);
    expect(esDificultad(1)).toBe(false);
  });

  it('elegirAlAzar usa el rng inyectado de forma determinista y acotada', () => {
    const opciones = ['a', 'b', 'c'] as const;
    expect(elegirAlAzar(opciones, () => 0)).toBe('a');
    expect(elegirAlAzar(opciones, () => 0.5)).toBe('b');
    expect(elegirAlAzar(opciones, () => 0.9999)).toBe('c');
    expect(elegirAlAzar(opciones, () => 1)).toBe('c');
  });

  it('elegirAlAzar lanza si recibe una lista vacía', () => {
    expect(() => elegirAlAzar([])).toThrow();
  });
});
