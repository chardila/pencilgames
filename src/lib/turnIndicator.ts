export interface FichaJugador {
  nombre: string;
  puntaje?: number | string;
  simbolo?: string;
}

export interface TurnIndicatorOptions {
  jugador: 1 | 2;
  fichas: Record<1 | 2, FichaJugador>;
  miAsiento?: 1 | 2 | null;
  detalle?: string;
  repiteTurno?: boolean;
  motivoRepeticion?: string;
}

const FORMA: Record<1 | 2, string> = { 1: '●', 2: '▲' };

function textoEstado(jugador: 1 | 2, miAsiento: 1 | 2 | null | undefined): string {
  if (miAsiento == null) return '← VA';
  if (miAsiento === jugador) return '← TE TOCA';
  return '← su turno';
}

function prosaAccesible(
  jugador: 1 | 2,
  fichas: Record<1 | 2, FichaJugador>,
  miAsiento: 1 | 2 | null | undefined,
  detalle: string | undefined,
  repiteTurno: boolean | undefined,
  motivoRepeticion: string | undefined
): string {
  const nombre = fichas[jugador].nombre;
  let base: string;
  if (miAsiento == null) base = `Turno de ${nombre}`;
  else if (miAsiento === jugador) base = `Te toca, eres ${nombre}`;
  else base = `Turno de ${nombre}, esperando`;

  const esMio = miAsiento == null || miAsiento === jugador;
  const partes: string[] = [];
  if (repiteTurno && esMio) partes.push(motivoRepeticion || '¡Vuelves a jugar!');
  partes.push(base);
  if (detalle) partes.push(detalle);
  return partes.join('. ');
}

function plantilla(): string {
  return `
    <div class="indicador-turno__badge" hidden></div>
    <div class="fichas-turno" aria-hidden="true">
      ${[1, 2]
        .map(
          n => `
        <div class="ficha-turno" data-jugador="${n}">
          <span class="ficha-turno__forma" aria-hidden="true"></span>
          <span class="ficha-turno__nombre"></span>
          <span class="ficha-turno__tu"></span>
          <span class="ficha-turno__puntaje"></span>
          <span class="ficha-turno__estado"></span>
        </div>`
        )
        .join('')}
    </div>
    <span class="indicador-turno__detalle" aria-hidden="true" hidden></span>
    <span class="indicador-turno__espera" aria-hidden="true"></span>
    <span class="indicador-turno__prosa" role="status" aria-live="polite"></span>
  `;
}

export function renderTurnIndicator(
  container: HTMLElement,
  { jugador, fichas, miAsiento, detalle, repiteTurno, motivoRepeticion }: TurnIndicatorOptions
): void {
  container.hidden = false;
  container.dataset.jugador = String(jugador);

  if (miAsiento != null) {
    container.dataset.miAsiento = String(miAsiento);
  } else {
    delete container.dataset.miAsiento;
  }

  if (repiteTurno) {
    container.dataset.repite = 'true';
  } else {
    delete container.dataset.repite;
  }

  if (container.dataset.rendered !== 'true') {
    container.innerHTML = plantilla();
    container.dataset.rendered = 'true';
  }

  const esperando = miAsiento != null && miAsiento !== jugador;

  const badgeEl = container.querySelector<HTMLElement>('.indicador-turno__badge')!;
  badgeEl.hidden = !repiteTurno;
  badgeEl.textContent = repiteTurno ? motivoRepeticion || '¡Vuelves a jugar!' : '';

  for (const n of [1, 2] as const) {
    const ficha = fichas[n];
    const fichaEl = container.querySelector<HTMLElement>(
      `.ficha-turno[data-jugador="${n}"]`
    )!;
    fichaEl.dataset.activo = n === jugador ? 'true' : 'false';

    fichaEl.querySelector<HTMLElement>('.ficha-turno__forma')!.textContent = FORMA[n];

    fichaEl.querySelector<HTMLElement>('.ficha-turno__nombre')!.textContent = ficha.simbolo
      ? `${ficha.nombre} (${ficha.simbolo})`
      : ficha.nombre;

    const tuEl = fichaEl.querySelector<HTMLElement>('.ficha-turno__tu')!;
    const soyYo = miAsiento != null && miAsiento === n;
    tuEl.hidden = !soyYo;
    tuEl.textContent = soyYo ? '(tú)' : '';

    const puntajeEl = fichaEl.querySelector<HTMLElement>('.ficha-turno__puntaje')!;
    if (ficha.puntaje !== undefined) {
      puntajeEl.hidden = false;
      puntajeEl.textContent = String(ficha.puntaje);
    } else {
      puntajeEl.hidden = true;
      puntajeEl.textContent = '';
    }

    const estadoEl = fichaEl.querySelector<HTMLElement>('.ficha-turno__estado')!;
    if (n === jugador) {
      estadoEl.hidden = false;
      estadoEl.textContent = textoEstado(jugador, miAsiento);
    } else {
      estadoEl.hidden = true;
      estadoEl.textContent = '';
    }
  }

  const detalleEl = container.querySelector<HTMLElement>('.indicador-turno__detalle')!;
  detalleEl.hidden = !detalle;
  detalleEl.textContent = detalle ?? '';

  container.querySelector<HTMLElement>('.indicador-turno__espera')!.textContent = esperando
    ? 'esperando…'
    : '';

  container.querySelector<HTMLElement>('.indicador-turno__prosa')!.textContent = prosaAccesible(
    jugador,
    fichas,
    miAsiento,
    detalle,
    repiteTurno,
    motivoRepeticion
  );
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  delete container.dataset.repite;
  delete container.dataset.miAsiento;
  delete container.dataset.rendered;
  container.innerHTML = '';
}
