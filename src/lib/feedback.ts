// Vibración y sonido sintetizado (spec 09). Un solo interruptor
// (`pencilgames:sonido`) gobierna ambos. Mismo patrón de try/catch silencioso
// que recientes.ts: si algo no existe en el navegador, no se hace nada.

export const CLAVE_SONIDO = 'pencilgames:sonido';

export type Senal = 'toque' | 'error' | 'punto' | 'victoria';

export const PATRONES_VIBRACION: Record<Senal, number | number[]> = {
  toque: 10,
  error: [20, 40, 20],
  punto: [15, 30, 15],
  victoria: [40, 60, 40, 60, 80],
};

// [frecuencia Hz, inicio s, duración s]. Todos los sonidos duran < 200 ms.
type Nota = [number, number, number];
const TONOS: Record<Senal, { onda: OscillatorType; notas: Nota[] }> = {
  toque: { onda: 'sine', notas: [[880, 0, 0.06]] },
  error: { onda: 'square', notas: [[200, 0, 0.08], [150, 0.08, 0.1]] },
  punto: { onda: 'sine', notas: [[660, 0, 0.08], [880, 0.08, 0.1]] },
  // Arpegio rápido: la spec exige < 200 ms por sonido; la celebración la
  // pone el confeti.
  victoria: {
    onda: 'triangle',
    notas: [[523, 0, 0.07], [659, 0.04, 0.07], [784, 0.08, 0.07], [1047, 0.12, 0.07]],
  },
};

const VOLUMEN = 0.15;

export function sonidoActivo(): boolean {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== '0';
  } catch {
    return true;
  }
}

export function alternarSonido(): boolean {
  const nuevo = !sonidoActivo();
  try {
    localStorage.setItem(CLAVE_SONIDO, nuevo ? '1' : '0');
  } catch {
    // Sin localStorage no persiste, pero el botón no debe fallar.
  }
  return nuevo;
}

let contexto: AudioContext | null = null;

// Los navegadores móviles solo arrancan el AudioContext dentro de un gesto
// del usuario: se llama desde un toque real, nunca al cargar. Devuelve true
// si el contexto ya está en marcha; con false hay que reintentar en el
// siguiente gesto (un `pointerdown` táctil no cuenta como activación: esta
// llega con `pointerup`/`click`).
export function desbloquearAudio(): boolean {
  try {
    if (!contexto) {
      const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
      if (!Ctor) return false;
      contexto = new Ctor();
    }
    if (contexto.state === 'suspended') {
      void contexto.resume();
      return false;
    }
    return contexto.state === 'running';
  } catch {
    contexto = null;
    return false;
  }
}

function sonar(senal: Senal): void {
  if (!contexto) return;
  try {
    // Un contexto que sigue suspendido (el primer toque no dio activación) se
    // reanuda aquí: sonar sin esto dejaría la partida muda.
    if (contexto.state === 'suspended') void contexto.resume();
    const { onda, notas } = TONOS[senal];
    const t0 = contexto.currentTime;
    for (const [freq, inicio, dur] of notas) {
      const osc = contexto.createOscillator();
      const ganancia = contexto.createGain();
      osc.type = onda;
      osc.frequency.setValueAtTime(freq, t0 + inicio);
      ganancia.gain.setValueAtTime(VOLUMEN, t0 + inicio);
      ganancia.gain.exponentialRampToValueAtTime(0.001, t0 + inicio + dur);
      osc.connect(ganancia);
      ganancia.connect(contexto.destination);
      osc.start(t0 + inicio);
      osc.stop(t0 + inicio + dur);
    }
  } catch {
    // Un fallo de audio nunca debe interrumpir la partida.
  }
}

function vibrar(senal: Senal): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(PATRONES_VIBRACION[senal]);
    }
  } catch {
    // Algunos navegadores lanzan sin gesto previo.
  }
}

export function emitirSenal(senal: Senal): void {
  if (!sonidoActivo()) return;
  vibrar(senal);
  sonar(senal);
}
