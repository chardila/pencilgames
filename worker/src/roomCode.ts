const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGITUD = 6;

// El alfabeto no contiene caracteres especiales de regex, así que se puede
// interpolar directamente. Se construye una sola vez a partir de las mismas
// constantes que usa generarCodigoSala(), para que formato de generación y
// formato de validación nunca puedan desincronizarse.
const PATRON_CODIGO_SALA = new RegExp(`^[${ALFABETO}]{${LONGITUD}}$`);

export function generarCodigoSala(): string {
  let codigo = '';
  for (let i = 0; i < LONGITUD; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}

export function esCodigoSalaValido(codigo: string): boolean {
  return PATRON_CODIGO_SALA.test(codigo);
}
