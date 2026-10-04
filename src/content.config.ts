import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { DURACIONES, EDADES, TIPOS } from './lib/catalogo';

const juegos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/juegos' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icono: z.string(),
    minJugadores: z.number().int().min(1),
    maxJugadores: z.number().int().min(1),
    duracion: z.enum(DURACIONES),
    edad: z.number().refine(e => (EDADES as readonly number[]).includes(e), {
      message: `edad debe ser una de ${EDADES.join(', ')}`,
    }),
    tipo: z.enum(TIPOS),
  }),
});

export const collections = { juegos };
