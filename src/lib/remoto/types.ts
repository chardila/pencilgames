export type EstadoConexion = 'conectando' | 'conectado' | 'reconectando' | 'reconectando-rival' | 'desconectado';

export type MensajeJuego =
  | { tipo: 'nombre'; nombre: string }
  | { tipo: 'movimiento'; payload: unknown }
  | { tipo: 'reiniciar' };

export interface MoveChannel {
  readonly asiento: 1 | 2;
  estado: EstadoConexion;
  enviar(mensaje: MensajeJuego): void;
  alRecibir(callback: (mensaje: MensajeJuego) => void): void;
  alCambiarEstado(callback: (estado: EstadoConexion) => void): void;
  cerrar(): void;
}

export class ErrorSala extends Error {
  constructor(
    public readonly codigo: 'invalido' | 'llena' | 'conexion' | 'nombre-duplicado',
    mensaje: string
  ) {
    super(mensaje);
    this.name = 'ErrorSala';
  }
}
