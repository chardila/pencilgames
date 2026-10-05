import { describe, expect, it } from 'vitest';
import { contraste, luminancia } from './contraste';

describe('contraste', () => {
  it('negro sobre blanco es 21:1', () => {
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('es simétrico', () => {
    expect(contraste('#e0532c', '#fdf6ec')).toBeCloseTo(contraste('#fdf6ec', '#e0532c'), 5);
  });
  it('mismo color es 1:1', () => {
    expect(contraste('#2b2b2b', '#2b2b2b')).toBeCloseTo(1, 5);
  });
  it('luminancia de blanco es 1 y de negro es 0', () => {
    expect(luminancia('#ffffff')).toBeCloseTo(1, 5);
    expect(luminancia('#000000')).toBeCloseTo(0, 5);
  });
});
