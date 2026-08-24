export interface Marcador {
  1: { nombre: string; puntaje: number | string };
  2: { nombre: string; puntaje: number | string };
}

export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  etiqueta: string;
  detalle?: string;
  marcador?: Marcador;
  repiteTurno?: boolean;
  motivoRepeticion?: string;
}

export function renderTurnIndicator(
  container: HTMLElement,
  { jugador, etiqueta, detalle, marcador, repiteTurno, motivoRepeticion }: TurnIndicatorOptions
): void {
  container.hidden = false;
  container.dataset.jugador = String(jugador);
  if (repiteTurno) {
    container.dataset.repite = 'true';
  } else {
    delete container.dataset.repite;
  }

  container.innerHTML = `
    ${
      repiteTurno
        ? `<div class="indicador-turno__badge" role="status" aria-live="polite"></div>`
        : ''
    }
    <div class="indicador-turno__principal">
      <span class="indicador-turno__etiqueta"></span>
    </div>
    ${detalle ? `<span class="indicador-turno__detalle"></span>` : ''}
    ${
      marcador
        ? `<span class="indicador-turno__marcador">
             <span class="indicador-turno__jugador" data-jugador="1"></span>
             ·
             <span class="indicador-turno__jugador" data-jugador="2"></span>
           </span>`
        : ''
    }
  `;

  if (repiteTurno) {
    const badgeEl = container.querySelector<HTMLElement>('.indicador-turno__badge');
    if (badgeEl) {
      badgeEl.textContent = motivoRepeticion || '¡Vuelves a jugar!';
    }
  }

  container.querySelector<HTMLElement>('.indicador-turno__etiqueta')!.textContent =
    `Turno de ${etiqueta}`;

  if (detalle) {
    const detalleEl = container.querySelector<HTMLElement>('.indicador-turno__detalle')!;
    detalleEl.textContent = detalle;
    detalleEl.style.display = 'block';
  }

  if (marcador) {
    const marcadorEl = container.querySelector<HTMLElement>('.indicador-turno__marcador')!;
    marcadorEl.style.display = 'block';
    const j1El = container.querySelector<HTMLElement>('.indicador-turno__jugador[data-jugador="1"]')!;
    const j2El = container.querySelector<HTMLElement>('.indicador-turno__jugador[data-jugador="2"]')!;
    j1El.textContent = `${marcador[1].nombre} ${marcador[1].puntaje}`;
    j2El.textContent = `${marcador[2].nombre} ${marcador[2].puntaje}`;
    if (jugador === 1) {
      j1El.dataset.activo = 'true';
      delete j2El.dataset.activo;
    } else {
      j2El.dataset.activo = 'true';
      delete j1El.dataset.activo;
    }
  }
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  delete container.dataset.repite;
  container.innerHTML = '';
}
