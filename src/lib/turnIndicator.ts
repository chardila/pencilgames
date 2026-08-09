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
    <span class="indicador-turno__etiqueta">Turno de ${etiqueta}</span>
    ${detalle ? `<span class="indicador-turno__detalle">${detalle}</span>` : ''}
  `;
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
