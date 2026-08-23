# Extracción de Chrome y Wiring Remoto Compartido (M1)

**Fecha**: 2026-08-23  
**Origen**: Hallazgo 🟠 M1 del informe de revisión de arquitectura (`docs/review-arquitectura-2026-08-23.md`).

---

## 1. Contexto y Problema

Actualmente, los 4 tableros (`src/games/tres-en-raya/Board.astro`, `src/games/agujero-negro/Board.astro`, `src/games/puntos-y-cajas/Board.astro`, y `src/games/conquista/Board.astro`) duplican aproximadamente 50–60 líneas de código cada uno en:
1. **Estructura HTML y CSS ("Chrome")**: Elementos `#indicador-turno` y `#banner-ganador`, junto con sus estilos visuales y capas modales en la sección `<style>`.
2. **Lógica de orquestación remota y turnos**: Escucha del evento `canal-remoto-listo`, asignación de `miAsiento`, intercambio de nombres, callback `alRecibir` (despacho de movimientos con validación, actualización de nombres, reinicio), `alCambiarEstado` (desconexión) y lógica de reinicio (`canal.enviar({ tipo: 'reiniciar' })`).

Esta duplicación aumenta la superficie de mantenimiento, eleva el riesgo de desincronización y añade fricción para agregar nuevos juegos.

---

## 2. Objetivos

- Crear un componente Astro reutilizable `src/components/TableroJuego.astro` que contenga el contenedor, los elementos de UI `#indicador-turno` y `#banner-ganador`, y sus estilos compartidos.
- Crear un módulo de orquestación TypeScript puro `src/lib/gameSession.ts` que centralice el manejo del estado de jugadores, turnos locales y remotos, ciclo de vida del canal WebRTC y sincronización de reinicio/desconexión.
- Proveer cobertura de pruebas unitarias exhaustiva para `gameSession.ts` en `src/lib/gameSession.test.ts`.
- Migrar los 4 tableros existentes (`tres-en-raya`, `agujero-negro`, `puntos-y-cajas`, `conquista`) para consumir `TableroJuego` y `gameSession`.
- Sincronizar en vivo los nombres de los jugadores en modo local al guardar desde `ModalJugadores.astro` mediante el evento `nombres-jugadores-actualizados`.

---

## 3. Fuera de alcance

- Modificar los motores puros (`engine.ts`) de los juegos (su lógica e interfaces ya están estables).
- Modificar el protocolo de señalización en el Worker o los tipos base de WebRTC en `src/lib/remoto/types.ts`.

---

## 4. Diseño Detallado

### 4.1. Componente `<TableroJuego.astro>` (`src/components/TableroJuego.astro`)

Provee el contenedor visual común para cualquier juego:

```astro
---
interface Props {
  id?: string;
  class?: string;
}

const { id = 'tablero-juego', class: className = '' } = Astro.props;
---

<div id={id} class={`tablero-juego ${className}`.trim()}>
  <div id="indicador-turno" class="indicador-turno" data-jugador="1"></div>
  <slot />
  <div id="banner-ganador" class="banner-ganador" hidden></div>
</div>

<style>
  .tablero-juego {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: var(--spacing);
  }

  .indicador-turno {
    font-size: 1.1rem;
    font-weight: 700;
    min-height: 2rem;
    text-align: center;
  }

  .indicador-turno :global(.indicador-turno__jugador[data-jugador='1']) {
    color: var(--color-player-1);
    font-weight: 700;
  }

  .indicador-turno :global(.indicador-turno__jugador[data-jugador='2']) {
    color: var(--color-player-2);
    font-weight: 700;
  }

  .banner-ganador {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 15;
  }

  .banner-ganador[hidden] {
    display: none;
  }

  .banner-ganador :global(.banner-ganador__contenido) {
    background: var(--color-surface);
    border-radius: var(--radius);
    padding: 1.5rem;
    text-align: center;
  }
</style>
```

---

### 4.2. Módulo de Sesión `src/lib/gameSession.ts`

Centraliza la reactividad y comunicación de la partida:

```ts
import { getPlayerNames, type Player, type PlayerNames } from './players';
import type { MoveChannel, MensajeJuego } from './remoto/types';
import {
  renderTurnIndicator,
  ocultarTurnIndicator,
  type TurnIndicatorOptions,
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

export interface GameSession<TMovimiento> {
  nombres: PlayerNames;
  miAsiento: Player | null;
  esMiTurno: (jugadorActual: Player) => boolean;
  enviarMovimiento: (movimiento: TMovimiento) => void;
  reiniciar: () => void;
  mostrarTurno: (opciones: Omit<TurnIndicatorOptions, 'etiqueta'> & { etiqueta?: string }) => void;
  mostrarFinDeJuego: (opciones: Omit<WinnerBannerOptions, 'onReiniciar'>) => void;
  destruir: () => void;
}

export function iniciarSesionJuego<TMovimiento>(
  config: GameSessionConfig<TMovimiento>
): GameSession<TMovimiento> {
  const indicadorTurno =
    config.indicadorTurnoEl ?? document.getElementById('indicador-turno');
  const bannerGanador =
    config.bannerGanadorEl ?? document.getElementById('banner-ganador');

  const nombres: PlayerNames = getPlayerNames();
  let canal: MoveChannel | null = null;
  let miAsiento: Player | null = null;

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
      if (estado === 'desconectado') {
        if (indicadorTurno) ocultarTurnIndicator(indicadorTurno);
        if (bannerGanador) {
          showWinnerBanner(bannerGanador, {
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
    return miAsiento === null || miAsiento === jugadorActual;
  }

  function enviarMovimiento(movimiento: TMovimiento): void {
    canal?.enviar({ tipo: 'movimiento', payload: movimiento });
  }

  function reiniciar(): void {
    config.onAplicarReinicio();
    canal?.enviar({ tipo: 'reiniciar' });
  }

  function mostrarTurno(
    opciones: Omit<TurnIndicatorOptions, 'etiqueta'> & { etiqueta?: string }
  ): void {
    if (!indicadorTurno) return;
    const etiqueta = opciones.etiqueta ?? nombres[opciones.jugador];
    renderTurnIndicator(indicadorTurno, {
      ...opciones,
      etiqueta,
    });
    if (bannerGanador) hideWinnerBanner(bannerGanador);
  }

  function mostrarFinDeJuego(
    opciones: Omit<WinnerBannerOptions, 'onReiniciar'>
  ): void {
    if (indicadorTurno) ocultarTurnIndicator(indicadorTurno);
    if (bannerGanador) {
      showWinnerBanner(bannerGanador, {
        ...opciones,
        onReiniciar: reiniciar,
      });
    }
  }

  function destruir(): void {
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
```

---

### 4.3. Evento en `ModalJugadores.astro`

En `src/components/ModalJugadores.astro`:
```ts
    const nuevosNombres = { 1: nombre1, 2: nombre2 };
    savePlayerNames(nuevosNombres);
    document.dispatchEvent(
      new CustomEvent('nombres-jugadores-actualizados', { detail: nuevosNombres })
    );
    modal.hidden = true;
```

---

### 4.4. Refactorización de los 4 Tableros

Los 4 archivos `src/games/<slug>/Board.astro` adoptan el nuevo patrón:
1. Reemplazan elementos de banner/indicador y sus estilos CSS repetidos por `<TableroJuego>`.
2. Eliminan listeners manuales de `canal-remoto-listo` y WebRTC, reemplazándolos por `const sesion = iniciarSesionJuego(...)`.
3. Usan `sesion.esMiTurno(state.currentPlayer)` para habilitar/deshabilitar casillas/puntos.
4. Usan `sesion.enviarMovimiento(movimiento)` al hacer click.
5. Invocan `sesion.mostrarTurno(...)` y `sesion.mostrarFinDeJuego(...)` en su función `render()`.

---

## 5. Pruebas y Criterios de Aceptación

1. **Pruebas unitarias (`src/lib/gameSession.test.ts`)**:
   - Creación de sesión local y consulta de `esMiTurno` (siempre true para ambos jugadores).
   - Recepción de `nombres-jugadores-actualizados` y actualización reactiva de `nombres`.
   - Conexión vía `canal-remoto-listo`, asignación de `miAsiento` y restricción de `esMiTurno`.
   - Recepción de movimiento remoto válido llama a `onMovimientoRemoto`.
   - Recepción de movimiento remoto inválido es ignorado de forma segura.
   - Recepción de mensaje `nombre` actualiza nombre del rival.
   - Recepción de mensaje `reiniciar` llama a `onAplicarReinicio`.
   - Cambio de estado a `'desconectado'` muestra banner de desconexión y llama `onDesconectar`.
   - Ejecución de `reiniciar()` llama a `onAplicarReinicio()` y envía `{ tipo: 'reiniciar' }`.

2. **Verificación del sistema**:
   - `npm test` pasa al 100%.
   - `npm run check` pasa con 0 errores y 0 warnings.
   - Comportamiento idéntico en navegador tanto en modo local como remoto en los 4 juegos.
