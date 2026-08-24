import { describe, it, expect, beforeEach } from 'vitest';
import { renderTurnIndicator, ocultarTurnIndicator } from './turnIndicator';

class MockElement {
  hidden = true;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  private _innerHTML = '';
  private subElements = new Map<string, MockElement>();

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(val: string) {
    this._innerHTML = val;
    this.subElements.clear();
  }

  get textContent(): string {
    const childTexts = Array.from(this.subElements.values())
      .map(el => el.textContent)
      .filter(Boolean);
    if (childTexts.length > 0) {
      return (this._textContent ? this._textContent + ' ' : '') + childTexts.join(' ');
    }
    return this._textContent;
  }

  private _textContent = '';
  set textContent(val: string) {
    this._textContent = val;
  }

  querySelector<T = MockElement>(selector: string): T | null {
    if (!this.subElements.has(selector)) {
      const el = new MockElement();
      this.subElements.set(selector, el);
    }
    return this.subElements.get(selector) as unknown as T;
  }
}

describe('turnIndicator', () => {
  let container: MockElement;

  beforeEach(() => {
    container = new MockElement();
  });

  it('renderiza indicador básico de turno', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      etiqueta: 'Carlos',
    });

    expect(container.hidden).toBe(false);
    expect(container.dataset.jugador).toBe('1');
    expect(container.textContent).toContain('Turno de Carlos');
    expect(container.dataset.repite).toBeUndefined();
  });

  it('renderiza marcador con jugador activo resaltado', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 2,
      etiqueta: 'Ana',
      marcador: {
        1: { nombre: 'Carlos', puntaje: 5 },
        2: { nombre: 'Ana', puntaje: 8 },
      },
    });

    expect(container.dataset.jugador).toBe('2');
    const j1 = container.querySelector<MockElement>('.indicador-turno__jugador[data-jugador="1"]');
    const j2 = container.querySelector<MockElement>('.indicador-turno__jugador[data-jugador="2"]');
    expect(j1?.textContent).toContain('Carlos 5');
    expect(j2?.textContent).toContain('Ana 8');
    expect(j2?.dataset.activo).toBe('true');
  });

  it('renderiza badge y data-repite cuando repiteTurno es true', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      etiqueta: 'Carlos',
      repiteTurno: true,
      motivoRepeticion: '✨ ¡Área conquistada! Vuelves a jugar',
    });

    expect(container.dataset.repite).toBe('true');
    const badge = container.querySelector<MockElement>('.indicador-turno__badge');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('✨ ¡Área conquistada! Vuelves a jugar');
  });

  it('usa texto por defecto si repiteTurno es true sin motivoRepeticion', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 2,
      etiqueta: 'Ana',
      repiteTurno: true,
    });

    expect(container.dataset.repite).toBe('true');
    const badge = container.querySelector<MockElement>('.indicador-turno__badge');
    expect(badge?.textContent).toContain('¡Vuelves a jugar!');
  });

  it('oculta y limpia el contenedor al llamar a ocultarTurnIndicator', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      etiqueta: 'Carlos',
      repiteTurno: true,
    });

    ocultarTurnIndicator(container as unknown as HTMLElement);
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe('');
    expect(container.dataset.repite).toBeUndefined();
  });
});
