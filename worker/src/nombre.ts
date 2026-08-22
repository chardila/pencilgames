// Tope defensivo de longitud: `nombre` es un input nuevo que llega al
// Durable Object sin haber pasado por ningún maxlength de un <input> HTML
// (viene de un query param armado por el cliente), así que se acota acá
// mismo para no dejar crecer sin límite lo que se guarda en memoria por
// sala.
const LONGITUD_MAXIMA = 40;

// Normaliza para comparar, no para mostrar: el servidor nunca muestra este
// valor a ningún jugador, solo lo usa para decidir si dos nombres "son el
// mismo" (sin distinguir mayúsculas ni espacios al borde) al validar un
// `unirse`.
export function normalizarNombre(nombre: string): string {
  return nombre.trim().toLowerCase().slice(0, LONGITUD_MAXIMA);
}
