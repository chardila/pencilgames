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

    canal.alRecibir((mensaje: MensajeJuego) => {
      if (mensaje.tipo === 'movimiento') {
        if (config.validarMovimiento(mensaje.payload)) {
          config.onMovimientoRemoto(mensaje.payload);
        } else {
          console.warn(
            'Mensaje de movimiento ignorado por payload inválido:',
            mensaje.payload
          );
        }
      } else if (mensaje.tipo === 'nombre') {
        nombres[miAsiento === 1 ? 2 : 1] = mensaje.nombre;
        config.onRender();
      } else if (mensaje.tipo === 'reiniciar') {
        config.onAplicarReinicio();
      }
    });

    canal.alCambiarEstado(estado => {
      estadoConexion = estado;
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
    });

    config.onRender();
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
    canal?.enviar({ tipo: 'movimiento', payload: movimiento });
  }

  function reiniciar(): void {
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
