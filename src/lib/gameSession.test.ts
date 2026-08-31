import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { iniciarSesionJuego } from './gameSession';
import type { MoveChannel, MensajeJuego, EstadoConexion } from './remoto/types';
import {
  solicitarWakeLock,
  liberarWakeLock,
  registrarReactivacionWakeLock,
} from './wakeLock';

vi.mock('./wakeLock', () => {
  const mockLimpiar = vi.fn();
  return {
    solicitarWakeLock: vi.fn().mockResolvedValue(true),
    liberarWakeLock: vi.fn().mockResolvedValue(undefined),
    registrarReactivacionWakeLock: vi.fn(() => mockLimpiar),
  };
});

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

class MockElement extends EventTarget {
  id: string = '';
  hidden: boolean = false;
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  private _textContent: string = '';
  private _innerHTML: string = '';
  private subElements = new Map<string, MockElement>();

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

  get innerHTML(): string {
    return this._innerHTML;
  }

  set innerHTML(html: string) {
    this._innerHTML = html;
    this.subElements.clear();
    this._textContent = '';
  }

  querySelector<T = MockElement>(selector: string): T | null {
    if (!this.subElements.has(selector)) {
      const el = new MockElement();
      this.subElements.set(selector, el);
    }
    return this.subElements.get(selector) as unknown as T;
  }
}

class MockDocument extends EventTarget {
  private elements = new Map<string, MockElement>();
  body = new MockElement();

  getElementById(id: string): MockElement | null {
    if (!this.elements.has(id)) {
      const el = new MockElement();
      el.id = id;
      this.elements.set(id, el);
    }
    return this.elements.get(id)!;
  }
}

describe('gameSession', () => {
  let mockDoc: MockDocument;
  let memoryStorage: MemoryStorage;

  beforeEach(() => {
    mockDoc = new MockDocument();
    memoryStorage = new MemoryStorage();
    vi.stubGlobal('document', mockDoc as unknown as Document);
    vi.stubGlobal('localStorage', memoryStorage as unknown as Storage);
    vi.stubGlobal('location', { reload: vi.fn() });

    const banner = mockDoc.getElementById('banner-ganador')!;
    banner.hidden = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('inicia en modo local con nombres por defecto y ambos turnos permitidos', () => {
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });

    expect(sesion.miAsiento).toBeNull();
    expect(sesion.nombres[1]).toBe('Jugador 1');
    expect(sesion.nombres[2]).toBe('Jugador 2');
    expect(sesion.esMiTurno(1)).toBe(true);
    expect(sesion.esMiTurno(2)).toBe(true);
    sesion.destruir();
  });

  it('actualiza nombres locales y llama a onRender al recibir nombres-jugadores-actualizados', () => {
    const onRender = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender,
    });

    document.dispatchEvent(
      new CustomEvent('nombres-jugadores-actualizados', {
        detail: { 1: 'Alicia', 2: 'Bob' },
      })
    );

    expect(sesion.nombres[1]).toBe('Alicia');
    expect(sesion.nombres[2]).toBe('Bob');
    expect(onRender).toHaveBeenCalled();
    sesion.destruir();
  });

  it('se conecta a canal remoto y restringe turnos según miAsiento', () => {
    const onRender = vi.fn();
    const onMovimientoRemoto = vi.fn();
    const onAplicarReinicio = vi.fn();

    let receptorMensajes: ((msg: MensajeJuego) => void) | null = null;
    const mockEnviar = vi.fn();

    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: mockEnviar,
      alRecibir: vi.fn(cb => {
        receptorMensajes = cb;
      }),
      alCambiarEstado: vi.fn(),
      cerrar: vi.fn(),
    };

    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto,
      onAplicarReinicio,
      onRender,
    });

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Mi Jugador' },
      })
    );

    expect(sesion.miAsiento).toBe(1);
    expect(sesion.nombres[1]).toBe('Mi Jugador');
    expect(sesion.esMiTurno(1)).toBe(true);
    expect(sesion.esMiTurno(2)).toBe(false);

    // Enviar movimiento local
    sesion.enviarMovimiento(4);
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'movimiento', payload: 4 });

    // Recibir movimiento remoto válido
    receptorMensajes!({ tipo: 'movimiento', payload: 7 });
    expect(onMovimientoRemoto).toHaveBeenCalledWith(7);

    // Recibir movimiento remoto inválido (no debe llamar onMovimientoRemoto)
    receptorMensajes!({ tipo: 'movimiento', payload: 'invalido' as any });
    expect(onMovimientoRemoto).toHaveBeenCalledTimes(1);

    // Recibir nombre remoto
    receptorMensajes!({ tipo: 'nombre', nombre: 'Rival Remoto' });
    expect(sesion.nombres[2]).toBe('Rival Remoto');

    // Recibir reinicio remoto
    receptorMensajes!({ tipo: 'reiniciar' });
    expect(onAplicarReinicio).toHaveBeenCalled();

    sesion.destruir();
  });

  it('sanea el nombre remoto: recorta, acota a 40 y descarta vacío o de otro tipo', () => {
    let receptorMensajes: ((msg: MensajeJuego) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(cb => {
        receptorMensajes = cb;
      }),
      alCambiarEstado: vi.fn(),
      cerrar: vi.fn(),
    };
    const onRender = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender,
    });
    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Yo' },
      })
    );

    receptorMensajes!({ tipo: 'nombre', nombre: '  Beto  ' });
    expect(sesion.nombres[2]).toBe('Beto');

    receptorMensajes!({ tipo: 'nombre', nombre: 'x'.repeat(80) });
    expect(sesion.nombres[2]).toHaveLength(40);

    onRender.mockClear();
    receptorMensajes!({ tipo: 'nombre', nombre: '   ' });
    receptorMensajes!({ tipo: 'nombre', nombre: 42 as unknown as string });
    expect(sesion.nombres[2]).toHaveLength(40);
    expect(onRender).not.toHaveBeenCalled();

    sesion.destruir();
  });

  it('gestiona desconexión mostrando banner y ejecutando onDesconectar', () => {
    let receptorEstado: ((estado: string) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 2,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const onDesconectar = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
      onDesconectar,
    });

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Jugador 2' },
      })
    );

    receptorEstado!('desconectado');

    expect(onDesconectar).toHaveBeenCalled();
    const banner = document.getElementById('banner-ganador')!;
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('Tu rival se desconectó');

    sesion.destruir();
  });

  it('mostrarTurno y mostrarFinDeJuego interactúan con turnIndicator y winnerBanner', () => {
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });

    sesion.mostrarTurno({ jugador: 1 });
    const ind = mockDoc.getElementById('indicador-turno')!;
    expect(ind.hidden).toBe(false);
    expect(ind.dataset.jugador).toBe('1');
    expect(
      ind.querySelector<MockElement>('.indicador-turno__prosa')!.textContent
    ).toBe('Turno de Jugador 1');

    sesion.mostrarFinDeJuego({ titulo: '¡Ganó Jugador 1!' });
    const ban = document.getElementById('banner-ganador')!;
    expect(ban.hidden).toBe(false);
    expect(ban.textContent).toContain('¡Ganó Jugador 1!');
    expect(ind.hidden).toBe(true);

    sesion.destruir();
  });

  it('reiniciar llama a onAplicarReinicio y envía mensaje de reinicio si hay canal', () => {
    const onAplicarReinicio = vi.fn();
    const mockEnviar = vi.fn();
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: mockEnviar,
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(),
      cerrar: vi.fn(),
    };

    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio,
      onRender: vi.fn(),
    });

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Jugador 1' },
      })
    );

    sesion.reiniciar();
    expect(onAplicarReinicio).toHaveBeenCalledTimes(1);
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'reiniciar' });

    sesion.destruir();
  });

  it('destruir remueve los event listeners de document', () => {
    const onRender = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender,
    });

    sesion.destruir();

    document.dispatchEvent(
      new CustomEvent('nombres-jugadores-actualizados', {
        detail: { 1: 'Nuevo 1', 2: 'Nuevo 2' },
      })
    );

    expect(sesion.nombres[1]).toBe('Jugador 1');
    expect(onRender).not.toHaveBeenCalled();
  });

  it('soporta elementos DOM explícitos pasados en la configuración', () => {
    const customIndicador = new MockElement();
    const customBanner = new MockElement();
    customBanner.hidden = true;

    const onAplicarReinicio = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      indicadorTurnoEl: customIndicador as unknown as HTMLElement,
      bannerGanadorEl: customBanner as unknown as HTMLElement,
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio,
      onRender: vi.fn(),
    });

    sesion.mostrarTurno({ jugador: 2 });
    expect(customIndicador.hidden).toBe(false);
    expect(
      customIndicador.querySelector<MockElement>('.indicador-turno__prosa')!.textContent
    ).toBe('Turno de Jugador 2');

    sesion.mostrarFinDeJuego({ titulo: 'Fin de la partida' });
    expect(customBanner.hidden).toBe(false);
    expect(customBanner.textContent).toContain('Fin de la partida');
    expect(customIndicador.hidden).toBe(true);

    const boton = customBanner.querySelector<MockElement>('.banner-ganador__reiniciar')!;
    boton.dispatchEvent(new Event('click'));
    expect(onAplicarReinicio).toHaveBeenCalled();

    sesion.destruir();
  });

  it('mostrarTurno inyecta miAsiento null en local y el asiento real tras canal-remoto-listo', () => {
    const mockCanal: MoveChannel = {
      asiento: 2,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(),
      cerrar: vi.fn(),
    };
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });
    const ind = mockDoc.getElementById('indicador-turno')!;

    sesion.mostrarTurno({ jugador: 1 });
    expect(ind.dataset.miAsiento).toBeUndefined();

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Yo' },
      })
    );

    sesion.mostrarTurno({ jugador: 1, puntajes: { 1: 3, 2: 5 } });
    expect(ind.dataset.miAsiento).toBe('2');
    const f2 = ind.querySelector<MockElement>('.ficha-turno[data-jugador="2"]')!;
    expect(f2.querySelector<MockElement>('.ficha-turno__puntaje')!.textContent).toBe('5');
    expect(
      ind.querySelector<MockElement>('.indicador-turno__prosa')!.textContent
    ).toBe('Turno de Jugador 1, esperando');

    sesion.destruir();
  });

  it('durante el estado reconectando, esMiTurno devuelve false y se muestra el aviso de reconexión en el indicador', () => {
    let receptorEstado: ((estado: string) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Jugador 1' },
      })
    );

    sesion.mostrarTurno({ jugador: 1 });
    expect(sesion.esMiTurno(1)).toBe(true);

    // Cambiar a reconectando
    receptorEstado!('reconectando');

    expect(sesion.esMiTurno(1)).toBe(false);
    expect(sesion.esMiTurno(2)).toBe(false);

    const ind = mockDoc.getElementById('indicador-turno')!;
    expect(ind.hidden).toBe(false);
    expect(ind.dataset.reconexion).toBe('propia');
    const badge = ind.querySelector<MockElement>('.indicador-turno__badge')!;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('Reconectando con la partida...');

    const banner = mockDoc.getElementById('banner-ganador')!;
    expect(banner.hidden).toBe(true);

    sesion.destruir();
  });

  it('durante el estado reconectando-rival, esMiTurno devuelve false y se muestra el aviso de espera del rival en el indicador', () => {
    let receptorEstado: ((estado: string) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Jugador 1' },
      })
    );

    sesion.mostrarTurno({ jugador: 1 });
    expect(sesion.esMiTurno(1)).toBe(true);

    // Cambiar a reconectando-rival
    receptorEstado!('reconectando-rival');

    expect(sesion.esMiTurno(1)).toBe(false);
    expect(sesion.esMiTurno(2)).toBe(false);

    const ind = mockDoc.getElementById('indicador-turno')!;
    expect(ind.hidden).toBe(false);
    expect(ind.dataset.reconexion).toBe('rival');
    const badge = ind.querySelector<MockElement>('.indicador-turno__badge')!;
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toContain('Tu rival se desconectó temporalmente. Esperando...');

    const banner = mockDoc.getElementById('banner-ganador')!;
    expect(banner.hidden).toBe(true);

    sesion.destruir();
  });

  it('al entrar en reconectando o reconectando-rival, vuelve a renderizar el tablero (onRender) para deshabilitar la entrada', () => {
    let receptorEstado: ((estado: string) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const onRender = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender,
    });

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Jugador 1' },
      })
    );
    onRender.mockClear();

    receptorEstado!('reconectando');
    expect(onRender).toHaveBeenCalledTimes(1);

    receptorEstado!('conectado');
    onRender.mockClear();

    receptorEstado!('reconectando-rival');
    expect(onRender).toHaveBeenCalledTimes(1);

    sesion.destruir();
  });

  it('al volver a conectado, esMiTurno vuelve a su comportamiento normal y se restaura el indicador de turno', () => {
    let receptorEstado: ((estado: string) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const onRender = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender,
    });

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Jugador 1' },
      })
    );

    sesion.mostrarTurno({ jugador: 1 });
    receptorEstado!('reconectando');
    expect(sesion.esMiTurno(1)).toBe(false);

    // Restaurar a conectado
    receptorEstado!('conectado');
    expect(onRender).toHaveBeenCalled();
    expect(sesion.esMiTurno(1)).toBe(true);
    expect(sesion.esMiTurno(2)).toBe(false);

    sesion.destruir();
  });

  it('activa el wakeLock al conectar y lo libera en desconectar y en destruir', () => {
    vi.mocked(solicitarWakeLock).mockClear();
    vi.mocked(liberarWakeLock).mockClear();
    vi.mocked(registrarReactivacionWakeLock).mockClear();

    let receptorEstado: ((estado: string) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto: vi.fn(),
      onAplicarReinicio: vi.fn(),
      onRender: vi.fn(),
    });

    expect(solicitarWakeLock).not.toHaveBeenCalled();

    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Jugador 1' },
      })
    );

    expect(solicitarWakeLock).toHaveBeenCalledTimes(1);
    expect(registrarReactivacionWakeLock).toHaveBeenCalledTimes(1);

    receptorEstado!('desconectado');
    expect(liberarWakeLock).toHaveBeenCalledTimes(1);

    sesion.destruir();
    // Debe liberarse en destruir también
    expect(liberarWakeLock).toHaveBeenCalledTimes(2);
  });

  it('registra los movimientos enviados y recibidos, y limpia el registro al reiniciar', () => {
    let receptorMensajes: ((msg: MensajeJuego) => void) | null = null;
    const mockEnviar = vi.fn();
    const mockCanal: MoveChannel = {
      asiento: 1,
      estado: 'conectado',
      enviar: mockEnviar,
      alRecibir: vi.fn(cb => {
        receptorMensajes = cb;
      }),
      alCambiarEstado: vi.fn(),
      cerrar: vi.fn(),
    };
    const onMovimientoRemoto = vi.fn();
    const onAplicarReinicio = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p: unknown): p is number => typeof p === 'number',
      onMovimientoRemoto,
      onAplicarReinicio,
      onRender: vi.fn(),
    });
    document.dispatchEvent(
      new CustomEvent('canal-remoto-listo', {
        detail: { channel: mockCanal, miNombre: 'Yo' },
      })
    );

    // Movimiento local + movimiento remoto: ambos deben quedar registrados.
    sesion.enviarMovimiento(3);
    receptorMensajes!({ tipo: 'movimiento', payload: 7 });
    // El registro no es observable directamente; se verifica a través del
    // handshake en la Tarea 2. Acá solo se comprueba que reiniciar remoto
    // dispara onAplicarReinicio (comportamiento que ya existía) y que un
    // payload inválido no llega a onMovimientoRemoto (ya existía) — este
    // test ancla que la refactorización a manejarMensaje no rompió nada.
    expect(mockEnviar).toHaveBeenCalledWith({ tipo: 'movimiento', payload: 3 });
    expect(onMovimientoRemoto).toHaveBeenCalledWith(7);

    receptorMensajes!({ tipo: 'movimiento', payload: 'no-numero' as unknown as number });
    expect(onMovimientoRemoto).toHaveBeenCalledTimes(1);

    receptorMensajes!({ tipo: 'reiniciar' });
    expect(onAplicarReinicio).toHaveBeenCalledTimes(1);

    sesion.destruir();
  });

  describe('resincronización tras reconexión', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    function montarSesionConectada(asiento: 1 | 2 = 1) {
      let receptorMensajes: ((msg: MensajeJuego) => void) | null = null;
      let receptorEstado: ((estado: string) => void) | null = null;
      const mockEnviar = vi.fn();
      const mockCanal: MoveChannel = {
        asiento,
        estado: 'conectado',
        enviar: mockEnviar,
        alRecibir: vi.fn(cb => {
          receptorMensajes = cb;
        }),
        alCambiarEstado: vi.fn(cb => {
          receptorEstado = cb;
        }),
        cerrar: vi.fn(),
      };
      const onMovimientoRemoto = vi.fn();
      const onAplicarReinicio = vi.fn();
      const sesion = iniciarSesionJuego<number>({
        validarMovimiento: (p: unknown): p is number => typeof p === 'number',
        onMovimientoRemoto,
        onAplicarReinicio,
        onRender: vi.fn(),
      });
      document.dispatchEvent(
        new CustomEvent('canal-remoto-listo', {
          detail: { channel: mockCanal, miNombre: 'Yo' },
        })
      );
      return {
        sesion,
        mockEnviar,
        onMovimientoRemoto,
        onAplicarReinicio,
        enviarRemoto: (msg: MensajeJuego) => receptorMensajes!(msg),
        cambiarEstado: (e: string) => receptorEstado!(e),
      };
    }

    it('no emite sync-hola en la primera conexión', () => {
      const h = montarSesionConectada();
      vi.advanceTimersByTime(1);
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-hola' })
      );
      h.sesion.destruir();
    });

    it('emite sync-hola con {epoca, seq} al volver a conectado tras una reconexión', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 });
      h.mockEnviar.mockClear();

      h.cambiarEstado('reconectando');
      h.cambiarEstado('conectado');
      vi.advanceTimersByTime(1);

      expect(h.mockEnviar).toHaveBeenCalledWith({
        tipo: 'sync-hola',
        epoca: 0,
        seq: 2,
      });
      h.sesion.destruir();
    });

    it('reintenta sync-hola una sola vez si no hay respuesta, y después se rinde', () => {
      const h = montarSesionConectada();
      h.cambiarEstado('reconectando-rival');
      h.cambiarEstado('conectado');
      vi.advanceTimersByTime(1); // primer sync-hola
      expect(
        h.mockEnviar.mock.calls.filter(c => c[0].tipo === 'sync-hola')
      ).toHaveLength(1);

      vi.advanceTimersByTime(3000); // expira -> reintento
      expect(
        h.mockEnviar.mock.calls.filter(c => c[0].tipo === 'sync-hola')
      ).toHaveLength(2);

      vi.advanceTimersByTime(3000); // expira de nuevo -> se rinde
      expect(
        h.mockEnviar.mock.calls.filter(c => c[0].tipo === 'sync-hola')
      ).toHaveLength(2);
      h.sesion.destruir();
    });

    it('cuando el peer está atrás en la misma época, le reenvía la cola de movimientos', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(10);
      h.enviarRemoto({ tipo: 'movimiento', payload: 20 });
      h.sesion.enviarMovimiento(30);
      h.mockEnviar.mockClear();

      // El peer dice que solo tiene 1 movimiento; yo tengo 3.
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 1 });

      expect(h.mockEnviar).toHaveBeenCalledWith({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 1,
        movimientos: [20, 30],
      });
      h.sesion.destruir();
    });

    it('cuando el peer está al día, no reenvía nada', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(10);
      h.mockEnviar.mockClear();

      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 1 });

      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      h.sesion.destruir();
    });

    it('cuando el peer está adelante, espera su sync-moves (re-arma el timeout)', () => {
      const h = montarSesionConectada();
      h.cambiarEstado('reconectando');
      h.cambiarEstado('conectado');
      vi.advanceTimersByTime(1); // primer sync-hola
      h.mockEnviar.mockClear();

      // El peer tiene más movimientos que yo.
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 5 });
      // No responde con sync-moves...
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      // ...pero el timeout re-armado dispara un reintento de sync-hola.
      vi.advanceTimersByTime(3000);
      expect(h.mockEnviar).toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-hola' })
      );
      h.sesion.destruir();
    });

    it('cuando el peer está atrás en época, le manda el registro completo de la época actual', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'reiniciar' }); // epoca -> 1, registro -> []
      h.sesion.enviarMovimiento(2);
      h.mockEnviar.mockClear();

      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 1 });

      expect(h.mockEnviar).toHaveBeenCalledWith({
        tipo: 'sync-moves',
        epoca: 1,
        desde: 0,
        movimientos: [2],
      });
      h.sesion.destruir();
    });

    it('aplica los movimientos de un sync-moves que continúa exactamente donde voy', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 }); // registro: [1, 2]
      h.onMovimientoRemoto.mockClear();

      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 2,
        movimientos: [3, 4],
      });

      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(1, 3);
      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(2, 4);

      // Y ahora un sync-hola del peer confirma que quedé en seq 4.
      h.mockEnviar.mockClear();
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 0, seq: 4 });
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      h.sesion.destruir();
    });

    it('ante un sync-moves de época mayor, reinicia una vez y aplica esa época', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.sesion.enviarMovimiento(2); // epoca 0, registro [1, 2]
      h.onAplicarReinicio.mockClear();
      h.onMovimientoRemoto.mockClear();

      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 2,
        desde: 0,
        movimientos: [9],
      });

      expect(h.onAplicarReinicio).toHaveBeenCalledTimes(1);
      expect(h.onMovimientoRemoto).toHaveBeenCalledWith(9);

      // Quedé en epoca 2, seq 1: un sync-hola del peer con esos valores no
      // provoca reenvío.
      h.mockEnviar.mockClear();
      h.enviarRemoto({ tipo: 'sync-hola', epoca: 2, seq: 1 });
      expect(h.mockEnviar).not.toHaveBeenCalledWith(
        expect.objectContaining({ tipo: 'sync-moves' })
      );
      h.sesion.destruir();
    });

    it('aplica solo la cola no solapada cuando el solapamiento coincide', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 }); // registro [1, 2]
      h.onMovimientoRemoto.mockClear();

      // El peer manda desde 1: [2, 3, 4]. El "2" coincide con lo que tengo.
      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 1,
        movimientos: [2, 3, 4],
      });

      expect(h.onMovimientoRemoto).toHaveBeenCalledTimes(2);
      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(1, 3);
      expect(h.onMovimientoRemoto).toHaveBeenNthCalledWith(2, 4);
      h.sesion.destruir();
    });

    it('muestra el aviso de desincronización si el solapamiento se contradice', () => {
      const h = montarSesionConectada();
      h.sesion.enviarMovimiento(1);
      h.enviarRemoto({ tipo: 'movimiento', payload: 2 }); // registro [1, 2]

      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 1,
        movimientos: [99, 3], // el "99" contradice mi "2"
      });

      const banner = document.getElementById('banner-ganador')!;
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('La partida se desincronizó');
      h.sesion.destruir();
    });

    it('muestra el aviso si un lote trae un payload inválido', () => {
      const h = montarSesionConectada();
      h.enviarRemoto({
        tipo: 'sync-moves',
        epoca: 0,
        desde: 0,
        movimientos: ['no-numero'],
      });
      const banner = document.getElementById('banner-ganador')!;
      expect(banner.hidden).toBe(false);
      expect(banner.textContent).toContain('La partida se desincronizó');
      h.sesion.destruir();
    });

    it('integración: dos sesiones recuperan un movimiento perdido durante la reconexión', () => {
      const docA = new MockDocument();
      const docB = new MockDocument();
      const indA = new MockElement();
      const banA = new MockElement();
      banA.hidden = true;
      const indB = new MockElement();
      const banB = new MockElement();
      banB.hidden = true;

      let recA: ((m: MensajeJuego) => void) | null = null;
      let recB: ((m: MensajeJuego) => void) | null = null;
      let estA: ((e: EstadoConexion) => void) | null = null;
      let estB: ((e: EstadoConexion) => void) | null = null;

      // Relay con interruptor de pérdida: cuando `perdiendo` es true, los
      // mensajes de A hacia B se descartan.
      let perdiendo = false;
      const canalA: MoveChannel = {
        asiento: 1,
        estado: 'conectado',
        enviar: (m: MensajeJuego) => {
          if (perdiendo) return;
          recB?.(m);
        },
        alRecibir: (cb: (m: MensajeJuego) => void) => {
          recA = cb;
        },
        alCambiarEstado: (cb: (e: EstadoConexion) => void) => {
          estA = cb;
        },
        cerrar: vi.fn(),
      };
      const canalB: MoveChannel = {
        asiento: 2,
        estado: 'conectado',
        enviar: (m: MensajeJuego) => {
          recA?.(m);
        },
        alRecibir: (cb: (m: MensajeJuego) => void) => {
          recB = cb;
        },
        alCambiarEstado: (cb: (e: EstadoConexion) => void) => {
          estB = cb;
        },
        cerrar: vi.fn(),
      };

      const onRemotoA = vi.fn();
      const onRemotoB = vi.fn();

      vi.stubGlobal('document', docA as unknown as Document);
      const sesionA = iniciarSesionJuego<number>({
        indicadorTurnoEl: indA as unknown as HTMLElement,
        bannerGanadorEl: banA as unknown as HTMLElement,
        validarMovimiento: (p: unknown): p is number => typeof p === 'number',
        onMovimientoRemoto: onRemotoA,
        onAplicarReinicio: vi.fn(),
        onRender: vi.fn(),
      });
      docA.dispatchEvent(
        new CustomEvent('canal-remoto-listo', {
          detail: { channel: canalA, miNombre: 'A' },
        })
      );

      vi.stubGlobal('document', docB as unknown as Document);
      const sesionB = iniciarSesionJuego<number>({
        indicadorTurnoEl: indB as unknown as HTMLElement,
        bannerGanadorEl: banB as unknown as HTMLElement,
        validarMovimiento: (p: unknown): p is number => typeof p === 'number',
        onMovimientoRemoto: onRemotoB,
        onAplicarReinicio: vi.fn(),
        onRender: vi.fn(),
      });
      docB.dispatchEvent(
        new CustomEvent('canal-remoto-listo', {
          detail: { channel: canalB, miNombre: 'B' },
        })
      );

      // Partida normal: A juega 1, B lo recibe.
      sesionA.enviarMovimiento(1);
      expect(onRemotoB).toHaveBeenCalledWith(1);

      // Se corta: A juega 2, se pierde en el cable.
      perdiendo = true;
      sesionA.enviarMovimiento(2);
      expect(onRemotoB).toHaveBeenCalledTimes(1); // B no recibió el "2"

      // Reconexión: ambos pasan por <reconexión> -> conectado. Relay vuelve.
      estA!('reconectando');
      estB!('reconectando-rival');
      perdiendo = false;
      estA!('conectado');
      estB!('conectado');
      vi.advanceTimersByTime(1); // flush de los setTimeout(iniciarSync, 0)

      // B recuperó el movimiento perdido.
      expect(onRemotoB).toHaveBeenCalledWith(2);
      // Nadie mostró el aviso de desincronización.
      expect(banA.hidden).toBe(true);
      expect(banB.hidden).toBe(true);

      sesionA.destruir();
      sesionB.destruir();
      vi.stubGlobal('document', new MockDocument() as unknown as Document);
    });
  });
});
