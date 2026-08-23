# Extracción de Chrome y Wiring Remoto Compartido (M1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar la estructura visual común (`#indicador-turno` y `#banner-ganador` con sus estilos) y la orquestación remota/local de partidas en un componente `<TableroJuego.astro>` y un módulo `gameSession.ts`, eliminando la duplicación en los 4 tableros existentes.

**Architecture:** `<TableroJuego.astro>` encapsula el layout y los estilos CSS compartidos del indicador de turno y el banner modal de fin de juego/desconexión. `src/lib/gameSession.ts` centraliza la sincronización de nombres, turnos locales y remotos (`esMiTurno`), suscripción a WebRTC, validación segura de movimientos con guardas de tipo, reinicio coordinado y desconexión. `ModalJugadores.astro` emite un `CustomEvent('nombres-jugadores-actualizados')` al guardar en modo local para reactividad inmediata.

**Tech Stack:** TypeScript, Astro 7, Vitest 3/4.

**Spec:** `docs/superpowers/specs/2026-08-23-extraccion-chrome-y-wiring-remoto-design.md`

## Global Constraints

- Cero dependencias externas nuevas.
- La validación de movimientos remotos debe usar las guardas puras existentes de cada motor (`esJugadaValida`, `esLineId`, `esFence`).
- Los 4 juegos deben mantener exactamente la misma UX, estilos visuales y compatibilidad WebRTC P2P previa.
- `npm run check` y `npm test` deben terminar con 0 errores y 100% de tests pasando.

---

### Task 1: Crear componente `<TableroJuego.astro>`

**Files:**
- Create: `src/components/TableroJuego.astro`

**Interfaces:**
- Produces: Componente Astro `<TableroJuego>` que renderiza `#indicador-turno`, un `<slot />` para el tablero específico del juego, y `#banner-ganador` con estilos CSS encapsulados.

- [ ] **Step 1: Crear `src/components/TableroJuego.astro`**

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

- [ ] **Step 2: Verificar typecheck**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TableroJuego.astro
git commit -m "feat(ui): crear componente compartido TableroJuego con chrome e indicador de turno"
```

---

### Task 2: Implementar módulo de sesión `src/lib/gameSession.ts` con TDD

**Files:**
- Create: `src/lib/gameSession.ts`
- Create: `src/lib/gameSession.test.ts`

**Interfaces:**
- Consumes: `getPlayerNames`, `Player`, `PlayerNames` de `./players`; `MoveChannel`, `MensajeJuego` de `./remoto/types`; `renderTurnIndicator`, `ocultarTurnIndicator` de `./turnIndicator`; `showWinnerBanner`, `hideWinnerBanner` de `./winnerBanner`.
- Produces: `export function iniciarSesionJuego<TMovimiento>(config: GameSessionConfig<TMovimiento>): GameSession<TMovimiento>`

- [ ] **Step 1: Escribir tests unitarios que fallen para `gameSession.ts`**

Crear `src/lib/gameSession.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { iniciarSesionJuego } from './gameSession';
import type { MoveChannel, MensajeJuego } from './remoto/types';

describe('gameSession', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="indicador-turno"></div>
      <div id="banner-ganador" hidden></div>
    `;
  });

  it('inicia en modo local con nombres por defecto y ambos turnos permitidos', () => {
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p): p is number => typeof p === 'number',
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
      validarMovimiento: (p): p is number => typeof p === 'number',
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
    let receptorEstado: ((estado: string) => void) | null = null;
    const mockEnviar = vi.fn();

    const mockCanal: MoveChannel = {
      asiento: 1,
      enviar: mockEnviar,
      alRecibir: vi.fn(cb => {
        receptorMensajes = cb;
      }),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p): p is number => typeof p === 'number',
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

  it('gestiona desconexión mostrando banner y ejecutando onDesconectar', () => {
    let receptorEstado: ((estado: string) => void) | null = null;
    const mockCanal: MoveChannel = {
      asiento: 2,
      enviar: vi.fn(),
      alRecibir: vi.fn(),
      alCambiarEstado: vi.fn(cb => {
        receptorEstado = cb;
      }),
      cerrar: vi.fn(),
    };

    const onDesconectar = vi.fn();
    const sesion = iniciarSesionJuego<number>({
      validarMovimiento: (p): p is number => typeof p === 'number',
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
});
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: FAIL con error de módulo no encontrado `src/lib/gameSession`.

- [ ] **Step 3: Implementar `src/lib/gameSession.ts`**

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
  mostrarTurno: (
    opciones: Omit<TurnIndicatorOptions, 'etiqueta'> & { etiqueta?: string }
  ) => void;
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
    const ind = getIndicadorTurno();
    const ban = getBannerGanador();
    if (!ind) return;
    const etiqueta = opciones.etiqueta ?? nombres[opciones.jugador];
    renderTurnIndicator(ind, {
      ...opciones,
      etiqueta,
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

- [ ] **Step 4: Ejecutar tests para verificar que pasan**

Run: `npx vitest run src/lib/gameSession.test.ts`
Expected: PASS (todas las pruebas pasan)

- [ ] **Step 5: Commit**

```bash
git add src/lib/gameSession.ts src/lib/gameSession.test.ts
git commit -m "feat(lib): implementar helper gameSession para orquestación de partidas"
```

---

### Task 3: Emitir evento `nombres-jugadores-actualizados` en `ModalJugadores.astro`

**Files:**
- Modify: `src/components/ModalJugadores.astro`

**Interfaces:**
- Produces: `document.dispatchEvent(new CustomEvent('nombres-jugadores-actualizados', { detail: { 1: nombre1, 2: nombre2 } }))`

- [ ] **Step 1: Modificar `src/components/ModalJugadores.astro`**

En el listener de `guardar.addEventListener('click', ...)`:
```ts
    const nuevosNombres = { 1: nombre1, 2: nombre2 };
    savePlayerNames(nuevosNombres);
    document.dispatchEvent(
      new CustomEvent('nombres-jugadores-actualizados', { detail: nuevosNombres })
    );
    modal.hidden = true;
```

- [ ] **Step 2: Verificar suite de tests completa**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/ModalJugadores.astro
git commit -m "feat(modal): emitir evento nombres-jugadores-actualizados al guardar nombres"
```

---

### Task 4: Migrar `tres-en-raya/Board.astro`

**Files:**
- Modify: `src/games/tres-en-raya/Board.astro`

**Interfaces:**
- Consumes: `<TableroJuego>`, `iniciarSesionJuego`, `esJugadaValida`

- [ ] **Step 1: Refactorizar `src/games/tres-en-raya/Board.astro`**

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';
---

<TableroJuego class="tablero-tres-en-raya">
  <div id="tablero" class="tablero" role="grid" aria-label="Tablero de tres en raya">
    {Array.from({ length: 9 }).map((_, i) => (
      <button type="button" class="casilla" data-indice={i} aria-label={`Casilla ${i + 1}`} />
    ))}
  </div>
</TableroJuego>

<style>
  .tablero {
    display: grid;
    grid-template-columns: repeat(3, minmax(4rem, 6rem));
    grid-template-rows: repeat(3, minmax(4rem, 6rem));
    gap: 0.5rem;
  }

  .casilla {
    font-size: 2.5rem;
    font-weight: 700;
    background: var(--color-surface);
    border: 2px solid #ddd;
    border-radius: 12px;
  }

  .casilla[data-valor="X"] {
    color: var(--color-player-1);
  }

  .casilla[data-valor="O"] {
    color: var(--color-player-2);
  }

  .casilla.casilla--ganadora {
    background: var(--color-accent);
  }
</style>

<script>
  import { createInitialState, esJugadaValida, playMove, type TresEnRayaState } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const tablero = document.getElementById('tablero')!;
  const casillas = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.casilla'));
  const ETIQUETAS = { X: '✕', O: '●' } as const;

  let state: TresEnRayaState = createInitialState();

  const sesion = iniciarSesionJuego<number>({
    validarMovimiento: esJugadaValida,
    onMovimientoRemoto: indice => jugar(indice, false),
    onAplicarReinicio: () => {
      state = createInitialState();
      render();
    },
    onRender: render,
    onDesconectar: () => {
      casillas.forEach(casilla => (casilla.disabled = true));
    },
  });

  function render(): void {
    const jugadorDelTurno = state.currentPlayer === 'X' ? 1 : 2;
    const esMiTurno = sesion.esMiTurno(jugadorDelTurno);

    casillas.forEach((casilla, i) => {
      const valor = state.board[i];
      casilla.textContent = valor ? ETIQUETAS[valor] : '';
      if (valor) {
        casilla.dataset.valor = valor;
      } else {
        delete casilla.dataset.valor;
      }
      casilla.disabled = valor !== null || state.status !== 'playing' || !esMiTurno;
      casilla.classList.toggle('casilla--ganadora', state.winningLine?.includes(i) ?? false);
    });

    if (state.status === 'playing') {
      sesion.mostrarTurno({
        jugador: jugadorDelTurno,
        etiqueta: `${sesion.nombres[jugadorDelTurno]} (${ETIQUETAS[state.currentPlayer]})`,
      });
    } else {
      sesion.mostrarFinDeJuego({
        titulo:
          state.status === 'won'
            ? `🎉 ¡Ganó ${sesion.nombres[state.winner === 'X' ? 1 : 2]} (${ETIQUETAS[state.winner!]})!`
            : '🤝 ¡Empate!',
      });
    }
  }

  function jugar(indice: number, emitirRemoto = true): void {
    state = playMove(state, indice);
    render();
    if (emitirRemoto) {
      sesion.enviarMovimiento(indice);
    }
  }

  casillas.forEach((casilla, i) => {
    casilla.addEventListener('click', () => {
      jugar(i);
    });
  });

  render();
</script>
```

- [ ] **Step 2: Verificar typecheck y tests**

Run: `npm run check && npm test`
Expected: 0 errors, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/games/tres-en-raya/Board.astro
git commit -m "refactor(tres-en-raya): migrar tablero a TableroJuego y gameSession"
```

---

### Task 5: Migrar `agujero-negro/Board.astro`

**Files:**
- Modify: `src/games/agujero-negro/Board.astro`

**Interfaces:**
- Consumes: `<TableroJuego>`, `iniciarSesionJuego`, `esJugadaValida`

- [ ] **Step 1: Refactorizar `src/games/agujero-negro/Board.astro`**

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';

function idsDeFila(row: number): number[] {
  const start = (row * (row + 1)) / 2;
  return Array.from({ length: row + 1 }, (_, i) => start + i);
}
---

<TableroJuego class="tablero-agujero-negro">
  <div id="tablero" class="tablero-an">
    {[0, 1, 2, 3, 4, 5].map(row => (
      <div class="fila-an">
        {idsDeFila(row).map(id => (
          <button type="button" class="posicion-an" data-id={id} aria-label={`Posición ${id + 1}`} />
        ))}
      </div>
    ))}
  </div>
</TableroJuego>

<style>
  .tablero-an {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .fila-an {
    display: flex;
    justify-content: center;
    gap: 0.4rem;
    margin-top: -0.5rem;
    pointer-events: none;
  }

  .fila-an:first-child {
    margin-top: 0;
  }

  .posicion-an {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    border: 2px solid #ddd;
    background: var(--color-surface);
    font-size: 1.1rem;
    font-weight: 700;
    pointer-events: auto;
  }

  .posicion-an[data-jugador='1'] {
    color: var(--color-player-1);
    border-color: var(--color-player-1);
  }

  .posicion-an[data-jugador='2'] {
    color: var(--color-player-2);
    border-color: var(--color-player-2);
  }

  .posicion-an[data-agujero='true'] {
    background: var(--color-text);
    color: var(--color-bg);
  }

  .posicion-an[data-destruida='true'] {
    opacity: 0.35;
    text-decoration: line-through;
  }
</style>

<script>
  import { createInitialState, placeNumber, esJugadaValida, type AgujeroNegroState } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const tablero = document.getElementById('tablero')!;
  const posiciones = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.posicion-an'));

  let state: AgujeroNegroState = createInitialState();

  const sesion = iniciarSesionJuego<number>({
    validarMovimiento: esJugadaValida,
    onMovimientoRemoto: id => jugar(id, false),
    onAplicarReinicio: () => {
      state = createInitialState();
      render();
    },
    onRender: render,
    onDesconectar: () => {
      for (const boton of posiciones) boton.disabled = true;
    },
  });

  function render(): void {
    const esMiTurno = sesion.esMiTurno(state.currentPlayer);

    for (const boton of posiciones) {
      const id = Number(boton.dataset.id);
      const celda = state.cells.find(c => c.id === id)!;

      boton.textContent = celda.value !== null ? String(celda.value) : '';
      if (celda.player) {
        boton.dataset.jugador = String(celda.player);
      } else {
        delete boton.dataset.jugador;
      }
      boton.dataset.agujero = String(state.blackHole === id);
      boton.dataset.destruida = String(state.destroyedCells.includes(id));
      boton.disabled = celda.value !== null || state.status !== 'playing' || !esMiTurno;
    }

    if (state.status === 'playing') {
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        etiqueta: sesion.nombres[state.currentPlayer],
        detalle: `Coloca el número ${state.nextValue[state.currentPlayer]}`,
      });
    } else {
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      sesion.mostrarFinDeJuego({
        titulo: ganador ? `🎉 ¡Ganó ${sesion.nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${sesion.nombres[1]}: ${state.scores[1]} puntos · ${sesion.nombres[2]}: ${state.scores[2]} puntos`,
      });
    }
  }

  function jugar(id: number, emitirRemoto = true): void {
    state = placeNumber(state, id);
    render();
    if (emitirRemoto) {
      sesion.enviarMovimiento(id);
    }
  }

  for (const boton of posiciones) {
    boton.addEventListener('click', () => {
      const id = Number(boton.dataset.id);
      jugar(id);
    });
  }

  render();
</script>
```

- [ ] **Step 2: Verificar typecheck y tests**

Run: `npm run check && npm test`
Expected: 0 errors, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/games/agujero-negro/Board.astro
git commit -m "refactor(agujero-negro): migrar tablero a TableroJuego y gameSession"
```

---

### Task 6: Migrar `puntos-y-cajas/Board.astro`

**Files:**
- Modify: `src/games/puntos-y-cajas/Board.astro`

**Interfaces:**
- Consumes: `<TableroJuego>`, `iniciarSesionJuego`, `esLineId`, `type LineId`

- [ ] **Step 1: Refactorizar `src/games/puntos-y-cajas/Board.astro`**

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';

const SIZE = 4;
---

<TableroJuego class="tablero-puntos-y-cajas">
  <div id="tablero" class="tablero-pyc">
    {Array.from({ length: SIZE }).map((_, r) => (
      <Fragment>
        {Array.from({ length: SIZE }).map((_, c) => (
          <span class="punto" style={`grid-row: ${2 * r + 1}; grid-column: ${2 * c + 1};`} />
        ))}
        {Array.from({ length: SIZE - 1 }).map((_, c) => (
          <button
            type="button"
            class="linea linea--h"
            data-tipo="h"
            data-fila={r}
            data-columna={c}
            style={`grid-row: ${2 * r + 1}; grid-column: ${2 * c + 2};`}
            aria-label={`Línea horizontal, fila ${r + 1}, posición ${c + 1}`}
          />
        ))}
      </Fragment>
    ))}
    {Array.from({ length: SIZE - 1 }).map((_, r) => (
      <Fragment>
        {Array.from({ length: SIZE }).map((_, c) => (
          <button
            type="button"
            class="linea linea--v"
            data-tipo="v"
            data-fila={r}
            data-columna={c}
            style={`grid-row: ${2 * r + 2}; grid-column: ${2 * c + 1};`}
            aria-label={`Línea vertical, fila ${r + 1}, posición ${c + 1}`}
          />
        ))}
        {Array.from({ length: SIZE - 1 }).map((_, c) => (
          <span
            class="caja"
            data-fila={r}
            data-columna={c}
            style={`grid-row: ${2 * r + 2}; grid-column: ${2 * c + 2};`}
          />
        ))}
      </Fragment>
    ))}
  </div>
</TableroJuego>

<style>
  .tablero-pyc {
    display: grid;
    grid-template-columns: 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px;
    grid-template-rows: 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px minmax(2.75rem, 1fr) 14px;
    width: min(92vw, 26rem);
    aspect-ratio: 1;
    margin: 0 auto;
  }

  .punto {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--color-text);
    justify-self: center;
    align-self: center;
    pointer-events: none;
  }

  .linea {
    border: none;
    background: transparent;
    padding: 0;
    z-index: 1;
  }

  .linea--h {
    align-self: center;
    width: 100%;
    min-height: 2.75rem;
    z-index: 2;
  }

  .linea--h::before {
    content: '';
    display: block;
    height: 6px;
    background: #ddd;
    border-radius: 3px;
    margin: auto 0;
  }

  .linea--h[data-jugador='1']::before {
    background: var(--color-player-1);
  }

  .linea--h[data-jugador='2']::before {
    background: var(--color-player-2);
  }

  .linea--v {
    justify-self: center;
    height: 100%;
    min-width: 2.75rem;
  }

  .linea--v::before {
    content: '';
    display: block;
    width: 6px;
    height: 100%;
    background: #ddd;
    border-radius: 3px;
    margin: 0 auto;
  }

  .linea--v[data-jugador='1']::before {
    background: var(--color-player-1);
  }

  .linea--v[data-jugador='2']::before {
    background: var(--color-player-2);
  }

  .caja {
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    pointer-events: none;
  }

  .caja[data-jugador='1'] {
    background: color-mix(in srgb, var(--color-player-1) 25%, transparent);
  }

  .caja[data-jugador='2'] {
    background: color-mix(in srgb, var(--color-player-2) 25%, transparent);
  }
</style>

<script>
  import { createInitialState, playLine, esLineId, type PuntosYCajasState, type LineId } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const tablero = document.getElementById('tablero')!;
  const lineas = Array.from(tablero.querySelectorAll<HTMLButtonElement>('.linea'));
  const cajas = Array.from(tablero.querySelectorAll<HTMLElement>('.caja'));

  let state: PuntosYCajasState = createInitialState(4);

  const sesion = iniciarSesionJuego<LineId>({
    validarMovimiento: esLineId,
    onMovimientoRemoto: line => jugar(line, false),
    onAplicarReinicio: () => {
      state = createInitialState(4);
      render();
    },
    onRender: render,
    onDesconectar: () => {
      for (const linea of lineas) linea.disabled = true;
    },
  });

  function render(): void {
    const esMiTurno = sesion.esMiTurno(state.currentPlayer);

    for (const linea of lineas) {
      const tipo = linea.dataset.tipo as 'h' | 'v';
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      const trazada = tipo === 'h' ? state.horizontalLines[fila][columna] : state.verticalLines[fila][columna];
      const dueno = tipo === 'h' ? state.horizontalLineOwners[fila][columna] : state.verticalLineOwners[fila][columna];
      linea.dataset.trazada = String(trazada);
      if (dueno) linea.dataset.jugador = String(dueno);
      else delete linea.dataset.jugador;
      linea.disabled = trazada || state.status !== 'playing' || !esMiTurno;
    }

    for (const caja of cajas) {
      const fila = Number(caja.dataset.fila);
      const columna = Number(caja.dataset.columna);
      const dueno = state.boxOwners[fila][columna];
      if (dueno) {
        caja.dataset.jugador = String(dueno);
        caja.textContent = dueno === 1 ? '●' : '■';
      } else {
        delete caja.dataset.jugador;
        caja.textContent = '';
      }
    }

    if (state.status === 'playing') {
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        etiqueta: sesion.nombres[state.currentPlayer],
        marcador: {
          1: { nombre: sesion.nombres[1], puntaje: state.scores[1] },
          2: { nombre: sesion.nombres[2], puntaje: state.scores[2] },
        },
      });
    } else {
      const ganador = state.scores[1] === state.scores[2] ? null : state.scores[1] > state.scores[2] ? 1 : 2;
      sesion.mostrarFinDeJuego({
        titulo: ganador ? `🎉 ¡Ganó ${sesion.nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${sesion.nombres[1]} ${state.scores[1]} · ${sesion.nombres[2]} ${state.scores[2]}`,
      });
    }
  }

  function jugar(line: LineId, emitirRemoto = true): void {
    state = playLine(state, line);
    render();
    if (emitirRemoto) {
      sesion.enviarMovimiento(line);
    }
  }

  for (const linea of lineas) {
    linea.addEventListener('click', () => {
      const tipo = linea.dataset.tipo as LineId['type'];
      const fila = Number(linea.dataset.fila);
      const columna = Number(linea.dataset.columna);
      const line: LineId = { type: tipo, row: fila, col: columna };
      jugar(line);
    });
  }

  render();
</script>
```

- [ ] **Step 2: Verificar typecheck y tests**

Run: `npm run check && npm test`
Expected: 0 errors, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/games/puntos-y-cajas/Board.astro
git commit -m "refactor(puntos-y-cajas): migrar tablero a TableroJuego y gameSession"
```

---

### Task 7: Migrar `conquista/Board.astro`

**Files:**
- Modify: `src/games/conquista/Board.astro`

**Interfaces:**
- Consumes: `<TableroJuego>`, `iniciarSesionJuego`, `esFence`, `type Fence`, `type Point`

- [ ] **Step 1: Refactorizar `src/games/conquista/Board.astro`**

```astro
---
import TableroJuego from '../../components/TableroJuego.astro';
import { GRID_SIZE } from './engine';

const STEP = 80;
const MARGIN = 50;
const VIEW_SIZE = MARGIN * 2 + STEP * (GRID_SIZE - 1);
---

<TableroJuego class="tablero-conquista">
  <svg
    id="tablero-svg"
    class="tablero-svg"
    viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
    aria-label="Tablero de Conquista"
  >
    <g id="capa-regiones"></g>
    <g id="capa-fences"></g>
    <g id="capa-puntos">
      {Array.from({ length: GRID_SIZE }).map((_, row) =>
        Array.from({ length: GRID_SIZE }).map((_, col) => (
          <g
            class="punto-grupo"
            data-row={row}
            data-col={col}
            data-interactivo="true"
            tabindex="0"
            role="button"
            aria-label={`Punto fila ${row + 1}, columna ${col + 1}`}
          >
            <circle
              cx={MARGIN + col * STEP}
              cy={MARGIN + row * STEP}
              r="24"
              class="punto-hitbox"
            />
            <circle
              cx={MARGIN + col * STEP}
              cy={MARGIN + row * STEP}
              r="6"
              class="punto-visual"
            />
          </g>
        ))
      )}
    </g>
  </svg>
</TableroJuego>

<style>
  .tablero-svg {
    width: min(92vw, 32rem);
    height: auto;
    aspect-ratio: 1;
    touch-action: manipulation;
  }

  .punto-hitbox {
    fill: transparent;
    cursor: pointer;
  }

  .punto-visual {
    fill: var(--color-text);
    transition: r 0.15s ease, fill 0.15s ease;
    pointer-events: none;
  }

  .punto-grupo[data-interactivo='false'] .punto-hitbox {
    cursor: not-allowed;
  }

  .punto-grupo[data-origen='true'] .punto-visual {
    fill: var(--color-player-1);
    r: 10;
  }

  .punto-grupo[data-destino-legal='true'] .punto-visual {
    fill: var(--color-player-2);
    r: 9;
  }

  .punto-grupo:focus-visible .punto-visual {
    outline: 2px solid var(--color-text);
    outline-offset: 4px;
  }

  :global(.fence-linea) {
    stroke-width: 5;
    stroke-linecap: round;
    pointer-events: none;
  }

  :global(.fence-linea[data-jugador='1']) {
    stroke: var(--color-player-1);
  }

  :global(.fence-linea[data-jugador='2']) {
    stroke: var(--color-player-2);
  }

  :global(.region-poligono) {
    stroke: none;
    pointer-events: none;
  }

  :global(.region-poligono[data-jugador='1']) {
    fill: color-mix(in srgb, var(--color-player-1) 25%, transparent);
  }

  :global(.region-poligono[data-jugador='2']) {
    fill: color-mix(in srgb, var(--color-player-2) 25%, transparent);
  }
</style>

<script>
  import {
    GRID_SIZE,
    ALL_CANDIDATES,
    createInitialState,
    jugarFence,
    esFenceLegal,
    esFence,
    type ConquistaState,
    type Point,
    type Fence,
  } from './engine';
  import { iniciarSesionJuego } from '../../lib/gameSession';

  const STEP = 80;
  const MARGIN = 50;

  const capaFences = document.getElementById('capa-fences')!;
  const capaRegiones = document.getElementById('capa-regiones')!;
  const gruposPunto = Array.from(
    document.querySelectorAll<SVGGElement>('.punto-grupo')
  );

  function toXY(p: Point): { x: number; y: number } {
    return {
      x: MARGIN + p.col * STEP,
      y: MARGIN + p.row * STEP,
    };
  }

  function svgNS(tag: string): SVGElement {
    return document.createElementNS('http://www.w3.org/2000/svg', tag);
  }

  let state: ConquistaState = createInitialState();
  let origen: Point | null = null;

  const sesion = iniciarSesionJuego<Fence>({
    validarMovimiento: esFence,
    onMovimientoRemoto: fence => jugar(fence, false),
    onAplicarReinicio: () => {
      state = createInitialState();
      limpiarSeleccion();
      render();
    },
    onRender: render,
    onDesconectar: () => {
      for (const g of gruposPunto) g.dataset.interactivo = 'false';
    },
  });

  function puntoDe(row: number, col: number): SVGGElement {
    return gruposPunto.find(
      g => g.dataset.row === String(row) && g.dataset.col === String(col)
    )!;
  }

  function limpiarSeleccion(): void {
    origen = null;
    for (const g of gruposPunto) {
      delete g.dataset.origen;
      delete g.dataset.destinoLegal;
    }
  }

  function destinosLegalesDesde(p: Point): Fence[] {
    return ALL_CANDIDATES.filter(info => {
      const tocaAP =
        (info.fence.a.row === p.row && info.fence.a.col === p.col) ||
        (info.fence.b.row === p.row && info.fence.b.col === p.col);
      return tocaAP && esFenceLegal(state, info);
    }).map(info => info.fence);
  }

  function otroPunto(fence: Fence, p: Point): Point {
    return fence.a.row === p.row && fence.a.col === p.col ? fence.b : fence.a;
  }

  function seleccionarOrigen(p: Point): void {
    limpiarSeleccion();
    const destinos = destinosLegalesDesde(p);
    if (destinos.length === 0) return;
    origen = p;
    puntoDe(p.row, p.col).dataset.origen = 'true';
    for (const fence of destinos) {
      const destino = otroPunto(fence, p);
      puntoDe(destino.row, destino.col).dataset.destinoLegal = 'true';
    }
  }

  function alTocarPunto(p: Point): void {
    const esMiTurno = sesion.esMiTurno(state.currentPlayer);
    if (!esMiTurno || state.status !== 'playing') return;

    if (origen === null) {
      seleccionarOrigen(p);
      return;
    }
    if (origen.row === p.row && origen.col === p.col) {
      limpiarSeleccion();
      return;
    }
    if (puntoDe(p.row, p.col).dataset.destinoLegal !== 'true') {
      seleccionarOrigen(p);
      return;
    }

    const fence: Fence = { a: origen, b: p };
    limpiarSeleccion();
    jugar(fence);
  }

  function jugar(fence: Fence, emitirRemoto = true): void {
    state = jugarFence(state, fence);
    render();
    if (emitirRemoto) {
      sesion.enviarMovimiento(fence);
    }
  }

  function render(): void {
    capaFences.innerHTML = '';
    for (const [key, jugador] of state.fences) {
      const info = ALL_CANDIDATES.find(c => c.key === key);
      if (!info) continue;
      const { x: x1, y: y1 } = toXY(info.fence.a);
      const { x: x2, y: y2 } = toXY(info.fence.b);
      const linea = svgNS('line');
      linea.setAttribute('x1', String(x1));
      linea.setAttribute('y1', String(y1));
      linea.setAttribute('x2', String(x2));
      linea.setAttribute('y2', String(y2));
      linea.setAttribute('class', 'fence-linea');
      linea.setAttribute('data-jugador', String(jugador));
      capaFences.appendChild(linea);
    }

    capaRegiones.innerHTML = '';
    for (const region of state.regions) {
      const puntos = region.vertices
        .map(v => {
          const { x, y } = toXY(v);
          return `${x},${y}`;
        })
        .join(' ');
      const poligono = svgNS('polygon');
      poligono.setAttribute('points', puntos);
      poligono.setAttribute('class', 'region-poligono');
      poligono.setAttribute('data-jugador', String(region.owner));
      capaRegiones.appendChild(poligono);
    }

    const esMiTurno = sesion.esMiTurno(state.currentPlayer);
    for (const g of gruposPunto) {
      g.dataset.interactivo = String(esMiTurno && state.status === 'playing');
    }

    if (state.status === 'playing') {
      sesion.mostrarTurno({
        jugador: state.currentPlayer,
        etiqueta: sesion.nombres[state.currentPlayer],
        marcador: {
          1: { nombre: sesion.nombres[1], puntaje: state.scores[1].toFixed(1) },
          2: { nombre: sesion.nombres[2], puntaje: state.scores[2].toFixed(1) },
        },
      });
    } else {
      const ganador =
        state.scores[1] === state.scores[2]
          ? null
          : state.scores[1] > state.scores[2]
          ? 1
          : 2;
      sesion.mostrarFinDeJuego({
        titulo: ganador ? `🎉 ¡Ganó ${sesion.nombres[ganador]}!` : '🤝 ¡Empate!',
        detalle: `${sesion.nombres[1]} ${state.scores[1].toFixed(1)} · ${
          sesion.nombres[2]
        } ${state.scores[2].toFixed(1)}`,
      });
    }
  }

  for (const g of gruposPunto) {
    g.addEventListener('click', () => {
      alTocarPunto({ row: Number(g.dataset.row), col: Number(g.dataset.col) });
    });
    g.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        alTocarPunto({
          row: Number(g.dataset.row),
          col: Number(g.dataset.col),
        });
      }
    });
  }

  render();
</script>
```

- [ ] **Step 2: Verificar typecheck y tests**

Run: `npm run check && npm test`
Expected: 0 errors, all tests pass

- [ ] **Step 3: Commit**

```bash
git add src/games/conquista/Board.astro
git commit -m "refactor(conquista): migrar tablero a TableroJuego y gameSession"
```

---

### Task 8: Verificación integral de calidad y suite completa

**Files:**
- Test all: `npm test`, `npm test --prefix worker`, `npm run check`, `npm run build`

- [ ] **Step 1: Ejecutar verificación de tipos**

Run: `npm run check`
Expected: 0 errors, 0 warnings

- [ ] **Step 2: Ejecutar todos los tests unitarios (raíz y worker)**

Run: `npm run test:all`
Expected: PASS en raíz y worker

- [ ] **Step 3: Ejecutar build de producción**

Run: `npm run build`
Expected: Build completado con éxito
