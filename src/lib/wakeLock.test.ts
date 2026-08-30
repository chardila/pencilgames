import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { solicitarWakeLock, liberarWakeLock, registrarReactivacionWakeLock } from './wakeLock';

describe('wakeLock', () => {
  let mockSentinel: { release: ReturnType<typeof vi.fn>; addEventListener: ReturnType<typeof vi.fn> };
  let mockRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSentinel = {
      release: vi.fn().mockResolvedValue(undefined),
      addEventListener: vi.fn(),
    };
    mockRequest = vi.fn().mockResolvedValue(mockSentinel);

    vi.stubGlobal('navigator', {
      wakeLock: {
        request: mockRequest,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('solicita wake lock de tipo screen correctamente', async () => {
    const obtenido = await solicitarWakeLock();
    expect(obtenido).toBe(true);
    expect(mockRequest).toHaveBeenCalledWith('screen');
  });

  it('maneja de forma segura si navigator.wakeLock no está soportado', async () => {
    vi.stubGlobal('navigator', {});
    const obtenido = await solicitarWakeLock();
    expect(obtenido).toBe(false);
  });

  it('maneja excepciones si request() falla (ej. permisos denegados)', async () => {
    mockRequest.mockRejectedValue(new Error('NotAllowedError'));
    const obtenido = await solicitarWakeLock();
    expect(obtenido).toBe(false);
  });

  it('libera el wake lock activo', async () => {
    await solicitarWakeLock();
    await liberarWakeLock();
    expect(mockSentinel.release).toHaveBeenCalledTimes(1);
  });

  it('re-solicita el wake lock cuando el documento vuelve a ser visible', async () => {
    let visibilityCallback: (() => void) | null = null;
    const mockDocument = {
      visibilityState: 'visible',
      addEventListener: vi.fn((event, cb) => {
        if (event === 'visibilitychange') visibilityCallback = cb;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', mockDocument);

    const limpiar = registrarReactivacionWakeLock();
    expect(mockDocument.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));

    mockRequest.mockClear();
    // Simular regreso a primer plano
    mockDocument.visibilityState = 'visible';
    visibilityCallback!();

    expect(mockRequest).toHaveBeenCalledWith('screen');

    limpiar();
    expect(mockDocument.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
