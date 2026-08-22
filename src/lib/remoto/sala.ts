import { CanalWebRTC } from './canalWebRTC';
import type { MoveChannel } from './types';

export { ErrorSala } from './types';

function urlWorkerPorDefecto(): string {
  const url = import.meta.env.PUBLIC_SIGNAL_WORKER_URL;
  if (!url) {
    throw new Error('Falta configurar PUBLIC_SIGNAL_WORKER_URL');
  }
  return url.replace(/^http/, 'ws');
}

export async function crearSala(
  nombre: string,
  workerUrl: string = urlWorkerPorDefecto()
): Promise<{ channel: MoveChannel; codigo: string }> {
  return CanalWebRTC.crear(workerUrl, nombre);
}

export async function unirseASala(
  codigo: string,
  nombre: string,
  workerUrl: string = urlWorkerPorDefecto()
): Promise<MoveChannel> {
  return CanalWebRTC.unirse(workerUrl, codigo, nombre);
}
