import { getPlayerNames, type Player, type PlayerNames } from './players';
import type { EstadoConexion, MoveChannel, MensajeJuego } from './remoto/types';
import {
  solicitarWakeLock,
  liberarWakeLock,
  registrarReactivacionWakeLock,
} from './wakeLock';
import {
  renderTurnIndicator,
  ocultarTurnIndicator,
  type FichaJugador,
} from './turnIndicator';
import {
  showWinnerBanner,
  hideWinnerBanner,
  type WinnerBannerOptions,
} from './winnerBanner';

export interface GameSessionConfig<TMovimiento> {
  indicadorTurnoEl?: HTMLElement | null;
  bannerGanadorEl?: HTMLElement | null;
  validarMovimiento: (payload: unknown) => payload is TMovimiento;
  onMovimientoRemoto: (movimiento: TMovimiento) => void;
  onAplicarReinicio: () => void;
  onRender: () => void;
  onDesconectar?: () => void;
}

export interface MostrarTurnoOptions {
  jugador: Player;
  detalle?: string;
  repiteTurno?: boolean;
  motivoRepeticion?: string;
  puntajes?: Record<Player, number | string>;
  simbolos?: Record<Player, string>;
}

export interface GameSession<TMovimiento> {
  nombres: PlayerNames;
  miAsiento: Player | null;
  esMiTurno: (jugadorActual: Player) => boolean;
  enviarMovimiento: (movimiento: TMovimiento) => void;
  reiniciar: () => void;
  mostrarTurno: (opciones: MostrarTurnoOptions) => void;
  mostrarFinDeJuego: (
    opciones: Omit<WinnerBannerOptions, 'onReiniciar'>
  ) => void;
  destruir: () => void;
}

export function iniciarSesionJuego<TMovimiento>(
  config: GameSessionConfig<TMovimiento>
): GameSession<TMovimiento> {
  const getIndicadorTurno = () =>
    config.indicadorTurnoEl ?? document.getElementById('indicador-turno');
  const getBannerGanador = () =>
    config.bannerGanadorEl ?? document.getElementById('banner-ganador');

  const nombres: PlayerNames = getPlayerNames();
  let canal: MoveChannel | null = null;
  let miAsiento: Player | null = null;
  let estadoConexion: EstadoConexion = 'conectado';
  let limpiarVisibilidad: (() => void) | null = null;
  let ultimoTurnoOpciones: MostrarTurnoOptions | null = null;
  let epoca = 0;
  let registro: TMovimiento[] = [];
  let estadoPrevio: EstadoConexion = 'conectado';
  let timeoutSync: ReturnType<typeof setTimeout> | null = null;
  let reintentoSyncHecho = false;

  function alActualizarNombresLocales(evento: Event): void {
    const customEvent = evento as CustomEvent<PlayerNames>;
    if (customEvent.detail && miAsiento === null) {
      nombres[1] = customEvent.detail[1];
      nombres[2] = customEvent.detail[2];
      config.onRender();
    }
  }

  function alCanalRemotoListo(evento: Event): void {
    const detalle = (
      evento as CustomEvent<{ channel: MoveChannel; miNombre: string }>
    ).detail;
    canal = detalle.channel;
    miAsiento = canal.asiento;
    nombres[miAsiento] = detalle.miNombre;

    solicitarWakeLock();
    limpiarVisibilidad?.();
    limpiarVisibilidad = registrarReactivacionWakeLock();

    canal.alRecibir(manejarMensaje);

    canal.alCambiarEstado(manejarCambioEstado);

    config.onRender();
  }

  function cancelarSync(): void {
    if (timeoutSync !== null) {
      clearTimeout(timeoutSync);
      timeoutSync = null;
    }
  }

  function iniciarSync(): void {
    if (!canal) return;
    canal.enviar({ tipo: 'sync-hola', epoca, seq: registro.length });
    cancelarSync();
    timeoutSync = setTimeout(alExpirarSync, 3000);
  }

  function manejarSyncHola(msg: { epoca: number; seq: number }): void {
    cancelarSync();
    if (!canal) return;

    if (msg.epoca === epoca) {
      if (msg.seq < registro.length) {
        canal.enviar({
          tipo: 'sync-moves',
          epoca,
          desde: msg.seq,
          movimientos: registro.slice(msg.seq),
        });
      } else if (msg.seq > registro.length) {
        // Estoy atrás: espero su sync-moves. Re-armo el timeout para que
        // un sync-moves perdido dispare igual el reintento/silencio.
        timeoutSync = setTimeout(alExpirarSync, 3000);
      }
      // msg.seq === registro.length: en sync, nada que hacer.
    } else if (msg.epoca > epoca) {
      // Me perdí uno o más reinicios; el peer me manda un sync-moves
      // completo. Re-armo el timeout por si se pierde.
      timeoutSync = setTimeout(alExpirarSync, 3000);
    } else {
      // msg.epoca < epoca: el peer está atrás en reinicios.
      canal.enviar({
        tipo: 'sync-moves',
        epoca,
        desde: 0,
        movimientos: [...registro],
      });
    }
  }

  function jsonIgual(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function mostrarDesync(): void {
    const ban = getBannerGanador();
    if (!ban) return;
    showWinnerBanner(ban, {
      titulo: '⚠️ La partida se desincronizó',
      detalle: 'Reinicien para volver a empezar con el mismo rival.',
      onReiniciar: reiniciar,
    });
  }

  function aplicarLote(movimientos: unknown[]): void {
    for (const payload of movimientos) {
      if (!config.validarMovimiento(payload)) {
        mostrarDesync();
        return;
      }
      registro.push(payload);
      config.onMovimientoRemoto(payload);
    }
  }

  function manejarSyncMoves(msg: {
    epoca: number;
    desde: number;
    movimientos: unknown[];
  }): void {
    cancelarSync();

    if (msg.epoca > epoca) {
      epoca = msg.epoca;
      registro = [];
      config.onAplicarReinicio();
      aplicarLote(msg.movimientos);
      return;
    }
    if (msg.epoca < epoca) return; // stale

    // msg.epoca === epoca
    if (msg.desde === registro.length) {
      aplicarLote(msg.movimientos);
      return;
    }
    if (msg.desde < registro.length) {
      const yaCompartidos = registro.length - msg.desde;
      const solapanEntrantes = msg.movimientos.slice(0, yaCompartidos);
      const solapanMios = registro.slice(msg.desde);
      if (jsonIgual(solapanEntrantes, solapanMios)) {
        aplicarLote(msg.movimientos.slice(yaCompartidos));
      } else {
        mostrarDesync();
      }
    }
    // msg.desde > registro.length: hueco imposible en turn-based; se ignora
    // (el otro lado del handshake lo cubre).
  }

  function alExpirarSync(): void {
    timeoutSync = null;
    if (!reintentoSyncHecho) {
      reintentoSyncHecho = true;
      iniciarSync();
    }
  }

  function manejarMensaje(mensaje: MensajeJuego): void {
    if (mensaje.tipo === 'movimiento') {
      if (config.validarMovimiento(mensaje.payload)) {
        registro.push(mensaje.payload); // NUEVO
        config.onMovimientoRemoto(mensaje.payload);
      } else {
        console.warn(
          'Mensaje de movimiento ignorado por payload inválido:',
          mensaje.payload
        );
      }
    } else if (mensaje.tipo === 'nombre') {
      // El nombre llega del otro cliente sin pasar por el maxlength de un
      // <input>; se acota y se descarta si viene vacío o de otro tipo,
      // igual que hace el Worker con normalizarNombre (tope de 40).
      const nombreRemoto =
        typeof mensaje.nombre === 'string'
          ? mensaje.nombre.trim().slice(0, 40)
          : '';
      if (nombreRemoto) {
        nombres[miAsiento === 1 ? 2 : 1] = nombreRemoto;
        config.onRender();
      }
    } else if (mensaje.tipo === 'reiniciar') {
      epoca++; // NUEVO
      registro = []; // NUEVO
      config.onAplicarReinicio();
    } else if (mensaje.tipo === 'sync-hola') {
      manejarSyncHola(mensaje);
    } else if (mensaje.tipo === 'sync-moves') {
      manejarSyncMoves(mensaje);
    }
  }

  function manejarCambioEstado(estado: EstadoConexion): void {
    const veniaDeReconexion =
      estadoPrevio === 'reconectando' || estadoPrevio === 'reconectando-rival';
    estadoConexion = estado;
    estadoPrevio = estado;
    if (estado === 'reconectando' || estado === 'reconectando-rival') {
      // Durante la reconexión `esMiTurno()` pasa a devolver false para
      // ambos jugadores. Hay que re-renderizar el tablero para que cada
      // juego deshabilite su entrada; si no, el cliente no desconectado
      // sigue viendo el tablero interactivo y puede jugar fuera de turno
      // (el movimiento se aplica local y luego se transmite -> desync).
      config.onRender();

      const modoReconexion = estado === 'reconectando' ? 'propia' : 'rival';
      if (ultimoTurnoOpciones) {
        mostrarTurno(ultimoTurnoOpciones);
      } else {
        const ind = getIndicadorTurno();
        if (ind) {
          const fichas: Record<Player, FichaJugador> = {
            1: { nombre: nombres[1] },
            2: { nombre: nombres[2] },
          };
          renderTurnIndicator(ind, {
            jugador: (miAsiento ?? 1) as Player,
            fichas,
            miAsiento,
            estadoReconexion: modoReconexion,
          });
        }
      }
    } else if (estado === 'conectado') {
      config.onRender();
      if (veniaDeReconexion) {
        // canalWebRTC hace flush de mensajesPendientesEnvio justo después de
        // disparar este callback; enviar sync-hola en el próximo tick deja
        // que cualquier flush síncrono gane la carrera por el cable.
        reintentoSyncHecho = false;
        setTimeout(iniciarSync, 0);
      }
    } else if (estado === 'desconectado') {
      liberarWakeLock();
      const ind = getIndicadorTurno();
      const ban = getBannerGanador();
      if (ind) ocultarTurnIndicator(ind);
      if (ban) {
        showWinnerBanner(ban, {
          titulo: '📡 Tu rival se desconectó',
          onReiniciar: () => location.reload(),
        });
      }
      config.onDesconectar?.();
    }
  }

  document.addEventListener(
    'nombres-jugadores-actualizados',
    alActualizarNombresLocales
  );
  document.addEventListener('canal-remoto-listo', alCanalRemotoListo);

  function esMiTurno(jugadorActual: Player): boolean {
    if (estadoConexion === 'reconectando' || estadoConexion === 'reconectando-rival') return false;
    return miAsiento === null || miAsiento === jugadorActual;
  }

  function enviarMovimiento(movimiento: TMovimiento): void {
    registro.push(movimiento);
    canal?.enviar({ tipo: 'movimiento', payload: movimiento });
  }

  function reiniciar(): void {
    epoca++;
    registro = [];
    config.onAplicarReinicio();
    canal?.enviar({ tipo: 'reiniciar' });
  }

  function mostrarTurno(opciones: MostrarTurnoOptions): void {
    ultimoTurnoOpciones = opciones;
    const ind = getIndicadorTurno();
    const ban = getBannerGanador();
    if (!ind) return;

    const fichas: Record<Player, FichaJugador> = {
      1: {
        nombre: nombres[1],
        puntaje: opciones.puntajes?.[1],
        simbolo: opciones.simbolos?.[1],
      },
      2: {
        nombre: nombres[2],
        puntaje: opciones.puntajes?.[2],
        simbolo: opciones.simbolos?.[2],
      },
    };

    let estadoReconexion: 'propia' | 'rival' | undefined = undefined;
    if (estadoConexion === 'reconectando') {
      estadoReconexion = 'propia';
    } else if (estadoConexion === 'reconectando-rival') {
      estadoReconexion = 'rival';
    }

    renderTurnIndicator(ind, {
      jugador: opciones.jugador,
      fichas,
      miAsiento,
      detalle: opciones.detalle,
      repiteTurno: opciones.repiteTurno,
      motivoRepeticion: opciones.motivoRepeticion,
      estadoReconexion,
    });

    if (ban) hideWinnerBanner(ban);
  }

  function mostrarFinDeJuego(
    opciones: Omit<WinnerBannerOptions, 'onReiniciar'>
  ): void {
    const ind = getIndicadorTurno();
    const ban = getBannerGanador();
    if (ind) ocultarTurnIndicator(ind);
    if (ban) {
      showWinnerBanner(ban, {
        ...opciones,
        onReiniciar: reiniciar,
      });
    }
  }

  function destruir(): void {
    cancelarSync();
    liberarWakeLock();
    limpiarVisibilidad?.();
    limpiarVisibilidad = null;
    document.removeEventListener(
      'nombres-jugadores-actualizados',
      alActualizarNombresLocales
    );
    document.removeEventListener('canal-remoto-listo', alCanalRemotoListo);
  }

  return {
    get nombres() {
      return nombres;
    },
    get miAsiento() {
      return miAsiento;
    },
    esMiTurno,
    enviarMovimiento,
    reiniciar,
    mostrarTurno,
    mostrarFinDeJuego,
    destruir,
  };
}
