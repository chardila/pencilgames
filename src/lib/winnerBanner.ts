export interface WinnerBannerOptions {
  titulo: string;
  detalle?: string;
  onReiniciar: () => void;
}

export function showWinnerBanner(
  container: HTMLElement,
  { titulo, detalle, onReiniciar }: WinnerBannerOptions
): void {
  container.hidden = false;
  container.innerHTML = `
    <div class="banner-ganador__contenido">
      <p class="banner-ganador__titulo"></p>
      ${detalle ? `<p class="banner-ganador__detalle"></p>` : ''}
      <button type="button" class="banner-ganador__reiniciar">Jugar de nuevo</button>
    </div>
  `;

  container.querySelector<HTMLElement>('.banner-ganador__titulo')!.textContent = titulo;
  if (detalle) {
    container.querySelector<HTMLElement>('.banner-ganador__detalle')!.textContent = detalle;
  }

  const boton = container.querySelector<HTMLButtonElement>('.banner-ganador__reiniciar')!;
  boton.addEventListener('click', onReiniciar, { once: true });
}

export function hideWinnerBanner(container: HTMLElement): void {
  container.hidden = true;
  container.innerHTML = '';
}
