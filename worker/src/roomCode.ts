const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGITUD = 6;

// El alfabeto no contiene caracteres especiales de regex, así que se puede
// interpolar directamente. Se construye una sola vez a partir de las mismas
// constantes que usa generarCodigoSala(), para que formato de generación y
// formato de validación nunca puedan desincronizarse.
const PATRON_CODIGO_SALA = new RegExp(`^[${ALFABETO}]{${LONGITUD}}$`);

// Mayor múltiplo de ALFABETO.length que cabe en un byte. Los valores en
// [LIMITE_SIN_SESGO, 256) se descartan para que `byte % ALFABETO.length`
// no favorezca a los primeros símbolos del alfabeto (rejection sampling).
const LIMITE_SIN_SESGO = 256 - (256 % ALFABETO.length);

export function generarCodigoSala(): string {
  let codigo = '';
  const buffer = new Uint8Array(LONGITUD * 2);
  let cursor = buffer.length;

  while (codigo.length < LONGITUD) {
    if (cursor >= buffer.length) {
      crypto.getRandomValues(buffer);
      cursor = 0;
    }
    const byte = buffer[cursor++];
    if (byte < LIMITE_SIN_SESGO) {
      codigo += ALFABETO[byte % ALFABETO.length];
    }
  }

  return codigo;
}

export function esCodigoSalaValido(codigo: string): boolean {
  return PATRON_CODIGO_SALA.test(codigo);
}
