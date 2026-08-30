import { describe, it, expect, beforeEach } from 'vitest';
import { renderTurnIndicator, ocultarTurnIndicator } from './turnIndicator';

class MockElement {
  hidden = true;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  private _innerHTML = '';
  private _textContent = '';
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
  set textContent(val: string) {
    this._textContent = val;
  }
  querySelector<T = MockElement>(selector: string): T | null {
    if (!this.subElements.has(selector)) {
      this.subElements.set(selector, new MockElement());
    }
    return this.subElements.get(selector) as unknown as T;
  }
}

const fichasBase = {
  1: { nombre: 'Ana' },
  2: { nombre: 'Beto' },
} as const;

describe('turnIndicator', () => {
  let container: MockElement;
  beforeEach(() => {
    container = new MockElement();
  });

  it('pasar-la-tableta: ficha activa muestra "← VA" y ninguna ficha muestra "(tú)"', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
    });

    expect(container.hidden).toBe(false);
    expect(container.dataset.jugador).toBe('1');
    expect(container.dataset.miAsiento).toBeUndefined();

    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    const f2 = container.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f1.dataset.activo).toBe('true');
    expect(f2.dataset.activo).toBe('false');
    expect(f1.querySelector<MockElement>('.ficha-turno__nombre')!.textContent).toBe('Ana');
    expect(f1.querySelector<MockElement>('.ficha-turno__forma')!.textContent).toBe('●');
    expect(f2.querySelector<MockElement>('.ficha-turno__forma')!.textContent).toBe('▲');
    expect(f1.querySelector<MockElement>('.ficha-turno__estado')!.textContent).toBe('← VA');
    expect(f1.querySelector<MockElement>('.ficha-turno__estado')!.hidden).toBe(false);
    expect(f2.querySelector<MockElement>('.ficha-turno__estado')!.hidden).toBe(true);
    expect(f1.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(true);
    expect(f2.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(true);
    expect(container.querySelector<MockElement>('.indicador-turno__prosa')!.textContent).toBe(
      'Turno de Ana'
    );
  });

  it('remoto, es mi asiento: ficha activa muestra "← TE TOCA" y "(tú)" en mi ficha', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 2,
      fichas: fichasBase,
      miAsiento: 2,
    });

    expect(container.dataset.jugador).toBe('2');
    expect(container.dataset.miAsiento).toBe('2');
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    const f2 = container.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f2.querySelector<MockElement>('.ficha-turno__estado')!.textContent).toBe('← TE TOCA');
    expect(f2.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(false);
    expect(f1.querySelector<MockElement>('.ficha-turno__tu')!.hidden).toBe(true);
    expect(container.querySelector<MockElement>('.indicador-turno__espera')).toBeTruthy();
    // sin "esperando…" cuando es mi turno
    expect(container.querySelector<MockElement>('.indicador-turno__espera')!.textContent).toBe('');
    expect(container.querySelector<MockElement>('.indicador-turno__prosa')!.textContent).toBe(
      'Te toca, eres Beto'
    );
  });

  it('remoto, turno del rival: ficha activa muestra "← su turno" + "esperando…"', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: 2,
    });

    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__estado')!.textContent).toBe('← su turno');
    expect(container.querySelector<MockElement>('.indicador-turno__espera')!.textContent).toBe(
      'esperando…'
    );
    expect(container.querySelector<MockElement>('.indicador-turno__prosa')!.textContent).toBe(
      'Turno de Ana, esperando'
    );
  });

  it('renderiza puntaje solo en las fichas que lo traen', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: { 1: { nombre: 'Ana', puntaje: '12.5' }, 2: { nombre: 'Beto', puntaje: 9 } },
      miAsiento: null,
    });
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    const f2 = container.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__puntaje')!.hidden).toBe(false);
    expect(f1.querySelector<MockElement>('.ficha-turno__puntaje')!.textContent).toBe('12.5');
    expect(f2.querySelector<MockElement>('.ficha-turno__puntaje')!.textContent).toBe('9');
  });

  it('oculta el puntaje cuando la ficha no lo trae', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
    });
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__puntaje')!.hidden).toBe(true);
  });

  it('añade el símbolo del juego al nombre cuando se pasa', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: { 1: { nombre: 'Ana', simbolo: 'X' }, 2: { nombre: 'Beto', simbolo: 'O' } },
      miAsiento: null,
    });
    const f1 = container.querySelector<MockElement>('.ficha-turno[data-jugador="1"]')!;
    expect(f1.querySelector<MockElement>('.ficha-turno__nombre')!.textContent).toBe('Ana (X)');
  });

  it('renderiza detalle cuando se pasa', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
      detalle: 'Coloca el número 3',
    });
    expect(container.querySelector<MockElement>('.indicador-turno__detalle')!.textContent).toBe(
      'Coloca el número 3'
    );
  });

  it('renderiza badge y data-repite cuando repiteTurno es true', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: null,
      repiteTurno: true,
      motivoRepeticion: '✨ ¡Área conquistada! Vuelves a jugar',
    });
    expect(container.dataset.repite).toBe('true');
    expect(container.querySelector<MockElement>('.indicador-turno__badge')!.textContent).toContain(
      '✨ ¡Área conquistada! Vuelves a jugar'
    );
  });

  it('usa texto por defecto si repiteTurno es true sin motivoRepeticion', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 2,
      fichas: fichasBase,
      miAsiento: null,
      repiteTurno: true,
    });
    expect(container.querySelector<MockElement>('.indicador-turno__badge')!.textContent).toContain(
      '¡Vuelves a jugar!'
    );
  });

  it('ocultarTurnIndicator limpia contenedor y datasets', () => {
    renderTurnIndicator(container as unknown as HTMLElement, {
      jugador: 1,
      fichas: fichasBase,
      miAsiento: 1,
      repiteTurno: true,
    });
    ocultarTurnIndicator(container as unknown as HTMLElement);
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe('');
    expect(container.dataset.repite).toBeUndefined();
    expect(container.dataset.miAsiento).toBeUndefined();
  });
});
