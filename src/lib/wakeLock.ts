interface WakeLockSentinelLike {
  release(): Promise<void>;
  addEventListener?(type: string, listener: () => void): void;
}

let centinelaActivo: WakeLockSentinelLike | null = null;

export async function solicitarWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) {
    return false;
  }
  try {
    centinelaActivo = await (navigator.wakeLock as { request(type: string): Promise<WakeLockSentinelLike> }).request(
      'screen'
    );
    return true;
  } catch {
    centinelaActivo = null;
    return false;
  }
}

export async function liberarWakeLock(): Promise<void> {
  if (centinelaActivo) {
    try {
      await centinelaActivo.release();
    } catch {
      // Ignorar errores al liberar
    }
    centinelaActivo = null;
  }
}

export function registrarReactivacionWakeLock(): () => void {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
    return () => {};
  }

  const alCambiarVisibilidad = () => {
    if (document.visibilityState === 'visible') {
      solicitarWakeLock();
    }
  };

  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  return () => {
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
  };
}
