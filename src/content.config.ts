import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const juegos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/juegos' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    icono: z.string(),
    minJugadores: z.number().int().min(1),
    maxJugadores: z.number().int().min(1),
  }),
});

export const collections = { juegos };
