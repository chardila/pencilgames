// Vocabulario compartido de los metadatos de cada juego (spec 07). Lo usan
// el esquema de contenido, la tarjeta y los filtros de la portada: una sola
// fuente para que no se desincronicen.

export const DURACIONES = ['rapido', 'medio', 'largo'] as const;
export const TIPOS = ['conectar', 'bloquear', 'capturar', 'dibujar', 'adivinar'] as const;
export const EDADES = [5, 7, 9] as const;

export type Duracion = (typeof DURACIONES)[number];
export type Tipo = (typeof TIPOS)[number];
export type Edad = (typeof EDADES)[number];

interface Etiqueta {
  icono: string;
  texto: string;
}

export const DURACION_INFO: Record<Duracion, Etiqueta> = {
  rapido: { icono: '⚡', texto: 'Rápido' },
  medio: { icono: '⏱️', texto: 'Medio' },
  largo: { icono: '⏳', texto: 'Largo' },
};

export const TIPO_INFO: Record<Tipo, Etiqueta> = {
  conectar: { icono: '🔗', texto: 'Conectar' },
  bloquear: { icono: '🚧', texto: 'Bloquear' },
  capturar: { icono: '🎯', texto: 'Capturar' },
  dibujar: { icono: '✏️', texto: 'Dibujar' },
  adivinar: { icono: '🔍', texto: 'Adivinar' },
};

export const ICONO_EDAD = '🧒';

export function textoEdad(edad: number): string {
  return `${edad}+ años`;
}
