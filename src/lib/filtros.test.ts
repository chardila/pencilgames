import { describe, expect, it } from 'vitest';
import type { Duracion, Tipo } from './catalogo';
import { alternar, coincide, type Filtros, type JuegoFiltrable } from './filtros';

const hex: JuegoFiltrable = {
  nombre: 'Hex',
  descripcion: 'Conecta tus dos lados opuestos del tablero.',
  duracion: 'medio',
  tipo: 'conectar',
};
const nim: JuegoFiltrable = {
  nombre: 'Nim',
  descripcion: 'Retira estrellas por turnos.',
  duracion: 'rapido',
  tipo: 'bloquear',
};

function filtros(parcial: {
  duraciones?: Duracion[];
  tipos?: Tipo[];
  consulta?: string;
}): Filtros {
  return {
    duraciones: new Set(parcial.duraciones ?? []),
    tipos: new Set(parcial.tipos ?? []),
    consulta: parcial.consulta ?? '',
  };
}

describe('coincide', () => {
  it('sin filtros deja pasar todo', () => {
    expect(coincide(hex, filtros({}))).toBe(true);
    expect(coincide(nim, filtros({}))).toBe(true);
  });

  it('filtrar por rápido deja solo los rápidos', () => {
    const f = filtros({ duraciones: ['rapido'] });
    expect(coincide(nim, f)).toBe(true);
    expect(coincide(hex, f)).toBe(false);
  });

  it('dentro de una dimensión es OR', () => {
    const f = filtros({ duraciones: ['rapido', 'medio'] });
    expect(coincide(nim, f)).toBe(true);
    expect(coincide(hex, f)).toBe(true);
  });

  it('entre duración y tipo es AND', () => {
    expect(coincide(nim, filtros({ duraciones: ['rapido'], tipos: ['bloquear'] }))).toBe(true);
    expect(coincide(nim, filtros({ duraciones: ['rapido'], tipos: ['conectar'] }))).toBe(false);
  });

  it('la consulta busca en nombre y descripción, sin distinguir mayúsculas', () => {
    expect(coincide(hex, filtros({ consulta: 'HEX' }))).toBe(true);
    expect(coincide(hex, filtros({ consulta: 'opuestos' }))).toBe(true);
    expect(coincide(hex, filtros({ consulta: 'estrellas' }))).toBe(false);
  });

  it('una consulta de solo espacios equivale a no tener consulta', () => {
    expect(coincide(hex, filtros({ consulta: '   ' }))).toBe(true);
  });

  it('la consulta se combina con los filtros (AND)', () => {
    expect(coincide(nim, filtros({ consulta: 'nim', duraciones: ['medio'] }))).toBe(false);
    expect(coincide(nim, filtros({ consulta: 'nim', duraciones: ['rapido'] }))).toBe(true);
  });
});

describe('alternar', () => {
  it('añade un valor ausente', () => {
    expect([...alternar(new Set<string>(), 'a')]).toEqual(['a']);
  });

  it('quita un valor presente', () => {
    expect([...alternar(new Set(['a', 'b']), 'a')]).toEqual(['b']);
  });

  it('no muta el conjunto original', () => {
    const original = new Set(['a']);
    alternar(original, 'b');
    expect([...original]).toEqual(['a']);
  });
});
