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
  estadoReconexion?: 'propia' | 'rival' | 'reconectando' | string;
}

const FORMA: Record<1 | 2, string> = { 1: '●', 2: '▲' };

/** Frase visible y completa: sin abreviaturas que un niño no pueda leer. */
function fraseTurno(
  jugador: 1 | 2,
  fichas: Record<1 | 2, FichaJugador>,
  miAsiento: 1 | 2 | null | undefined
): { prefijo: string; nombre: string } {
  if (miAsiento === jugador) return { prefijo: 'Te toca a ', nombre: 'ti' };
  return { prefijo: 'Le toca a ', nombre: fichas[jugador].nombre };
}

function textoReconexion(estadoReconexion: string): string {
  if (estadoReconexion === 'propia' || estadoReconexion === 'reconectando') {
    return '🔄 Reconectando con la partida...';
  }
  if (estadoReconexion === 'rival') {
    return '⏳ Tu rival se desconectó temporalmente. Esperando...';
  }
  return estadoReconexion;
}

function prosaAccesible(
  jugador: 1 | 2,
  fichas: Record<1 | 2, FichaJugador>,
  miAsiento: 1 | 2 | null | undefined,
  detalle: string | undefined,
  repiteTurno: boolean | undefined,
  motivoRepeticion: string | undefined,
  estadoReconexion?: string
): string {
  const partes: string[] = [];
  if (estadoReconexion) {
    partes.push(textoReconexion(estadoReconexion));
  }

  const nombre = fichas[jugador].nombre;
  let base: string;
  if (miAsiento == null) base = `Turno de ${nombre}`;
  else if (miAsiento === jugador) base = `Te toca, eres ${nombre}`;
  else base = `Turno de ${nombre}, esperando`;

  const esMio = miAsiento == null || miAsiento === jugador;
  if (repiteTurno && esMio && !estadoReconexion) partes.push(motivoRepeticion || '¡Vuelves a jugar!');
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
        </div>`
        )
        .join('')}
    </div>
    <p class="indicador-turno__frase" aria-hidden="true"><span class="indicador-turno__frase-prefijo"></span><span class="indicador-turno__frase-nombre"></span></p>
    <span class="indicador-turno__detalle" aria-hidden="true" hidden></span>
    <span class="indicador-turno__espera" aria-hidden="true"></span>
    <span class="indicador-turno__prosa" role="status" aria-live="polite"></span>
  `;
}

export function renderTurnIndicator(
  container: HTMLElement,
  {
    jugador,
    fichas,
    miAsiento,
    detalle,
    repiteTurno,
    motivoRepeticion,
    estadoReconexion,
  }: TurnIndicatorOptions
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

  if (estadoReconexion) {
    container.dataset.reconexion = estadoReconexion;
  } else {
    delete container.dataset.reconexion;
  }

  if (container.dataset.rendered !== 'true') {
    container.innerHTML = plantilla();
    container.dataset.rendered = 'true';
  }

  const esperando = miAsiento != null && miAsiento !== jugador;

  const badgeEl = container.querySelector<HTMLElement>('.indicador-turno__badge')!;
  const hayBadge = Boolean(repiteTurno || estadoReconexion);
  badgeEl.hidden = !hayBadge;
  if (estadoReconexion) {
    badgeEl.textContent = textoReconexion(estadoReconexion);
  } else if (repiteTurno) {
    badgeEl.textContent = motivoRepeticion || '¡Vuelves a jugar!';
  } else {
    badgeEl.textContent = '';
  }

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

  }

  const frase = fraseTurno(jugador, fichas, miAsiento);
  const fraseEl = container.querySelector<HTMLElement>('.indicador-turno__frase')!;
  const prefijoEl = container.querySelector<HTMLElement>('.indicador-turno__frase-prefijo')!;
  const nombreEl = container.querySelector<HTMLElement>('.indicador-turno__frase-nombre')!;
  const cambioTurno = fraseEl.dataset.jugador !== String(jugador);
  fraseEl.dataset.jugador = String(jugador);
  prefijoEl.textContent = frase.prefijo;
  nombreEl.textContent = frase.nombre;
  if (cambioTurno) {
    // Reinicia badgePopIn para que el cambio de turno se perciba.
    fraseEl.style.animation = 'none';
    void fraseEl.offsetWidth;
    fraseEl.style.animation = '';
  }

  const detalleEl = container.querySelector<HTMLElement>('.indicador-turno__detalle')!;
  detalleEl.hidden = !detalle;
  detalleEl.textContent = detalle ?? '';

  container.querySelector<HTMLElement>('.indicador-turno__espera')!.textContent = esperando
    ? 'esperando…'
    : '';

  // R6 — reescribir el mismo texto en una región viva puede reanunciarlo.
  const prosaEl = container.querySelector<HTMLElement>('.indicador-turno__prosa')!;
  const prosa = prosaAccesible(
    jugador,
    fichas,
    miAsiento,
    detalle,
    repiteTurno,
    motivoRepeticion,
    estadoReconexion
  );
  if (prosaEl.textContent !== prosa) prosaEl.textContent = prosa;
}

export function ocultarTurnIndicator(container: HTMLElement): void {
  container.hidden = true;
  delete container.dataset.repite;
  delete container.dataset.miAsiento;
  delete container.dataset.reconexion;
  delete container.dataset.rendered;
  container.innerHTML = '';
}
