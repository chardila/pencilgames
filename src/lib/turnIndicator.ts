export interface Marcador {
  1: { nombre: string; puntaje: number };
  2: { nombre: string; puntaje: number };
}

export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  etiqueta: string;
  detalle?: string;
  marcador?: Marcador;
}

export function renderTurnIndicator(
  container: HTMLElement,
  { jugador, etiqueta, detalle, marcador }: TurnIndicatorOptions
): void {
  container.hidden = false;
  container.dataset.jugador = String(jugador);
  container.innerHTML = `
    <span class="indicador-turno__etiqueta"></span>
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
    container.querySelector<HTMLElement>('.indicador-turno__jugador[data-jugador="1"]')!.textContent =
      `${marcador[1].nombre} ${marcador[1].puntaje}`;
    container.querySelector<HTMLElement>('.indicador-turno__jugador[data-jugador="2"]')!.textContent =
      `${marcador[2].nombre} ${marcador[2].puntaje}`;
  }
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
