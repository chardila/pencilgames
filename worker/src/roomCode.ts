const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGITUD = 6;

export function generarCodigoSala(): string {
  let codigo = '';
  for (let i = 0; i < LONGITUD; i++) {
    codigo += ALFABETO[Math.floor(Math.random() * ALFABETO.length)];
  }
  return codigo;
}
