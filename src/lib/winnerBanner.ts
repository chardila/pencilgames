export interface WinnerBannerOptions {
  titulo: string;
  detalle?: string;
  onReiniciar: () => void;
  /** Texto del botón de reinicio. Por defecto "Revancha" (fin de partida normal). */
  textoReiniciar?: string;
}

export function showWinnerBanner(
  container: HTMLElement,
  { titulo, detalle, onReiniciar, textoReiniciar = 'Revancha' }: WinnerBannerOptions
): void {
  container.hidden = false;
  container.innerHTML = `
    <div class="banner-ganador__contenido">
      <p class="banner-ganador__titulo"></p>
      ${detalle ? `<p class="banner-ganador__detalle"></p>` : ''}
      <div class="banner-ganador__acciones">
        <button type="button" class="banner-ganador__reiniciar"></button>
        <a href="/" class="banner-ganador__otro-juego">Otro juego</a>
      </div>
    </div>
  `;

  container.querySelector<HTMLElement>('.banner-ganador__titulo')!.textContent = titulo;
  if (detalle) {
    container.querySelector<HTMLElement>('.banner-ganador__detalle')!.textContent = detalle;
  }

  const boton = container.querySelector<HTMLButtonElement>('.banner-ganador__reiniciar')!;
  boton.textContent = textoReiniciar;
  // R5 — revancha inmediata: misma pareja, tablero limpio, sin pasar por
  // ningún modal. `onReiniciar` es la misma función que usa el botón de
  // reiniciar de la barra de controles.
  boton.addEventListener('click', onReiniciar, { once: true });
}

export function hideWinnerBanner(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
