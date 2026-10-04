import type { Duracion, Tipo } from './catalogo';

// Filtrado de la portada (spec 07). Funciones puras: el DOM solo las llama.
// Un conjunto vacío significa "Todos" en esa dimensión.

export interface JuegoFiltrable {
  nombre: string;
  descripcion: string;
  duracion: Duracion;
  tipo: Tipo;
}

export interface Filtros {
  duraciones: ReadonlySet<Duracion>;
  tipos: ReadonlySet<Tipo>;
  consulta: string;
}

export function coincide(juego: JuegoFiltrable, filtros: Filtros): boolean {
  if (filtros.duraciones.size > 0 && !filtros.duraciones.has(juego.duracion)) return false;
  if (filtros.tipos.size > 0 && !filtros.tipos.has(juego.tipo)) return false;
  const consulta = filtros.consulta.trim().toLowerCase();
  if (consulta === '') return true;
  return (
    juego.nombre.toLowerCase().includes(consulta) ||
    juego.descripcion.toLowerCase().includes(consulta)
  );
}

export function alternar<T>(conjunto: ReadonlySet<T>, valor: T): Set<T> {
  const nuevo = new Set(conjunto);
  if (nuevo.has(valor)) nuevo.delete(valor);
  else nuevo.add(valor);
  return nuevo;
}
