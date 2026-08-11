export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  etiqueta: string;
  detalle?: string;
}

export function renderTurnIndicator(
  container: HTMLElement,
  { jugador, etiqueta, detalle }: TurnIndicatorOptions
): void {
  container.hidden = false;
  container.dataset.jugador = String(jugador);
  container.innerHTML = `
    <span class="indicador-turno__etiqueta"></span>
    ${detalle ? `<span class="indicador-turno__detalle"></span>` : ''}
  `;

  container.querySelector<HTMLElement>('.indicador-turno__etiqueta')!.textContent =
    `Turno de ${etiqueta}`;
  if (detalle) {
    const detalleEl = container.querySelector<HTMLElement>('.indicador-turno__detalle')!;
    detalleEl.textContent = detalle;
    detalleEl.style.display = 'block';
  }
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
