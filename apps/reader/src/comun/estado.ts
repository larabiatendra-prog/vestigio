// Estado que el main expone al renderer por el canal 'estado:obtener'.

import type { VersionesVisibles } from './versiones';

export interface EstadoAplicacion {
  versiones: VersionesVisibles;
  modo: 'lectura-escritura' | 'solo-lectura';
  rootPortable: string;
  servicioDatos: {
    fase: string;
    epoch: number | null;
    detalle: string | null;
  };
  basePersonal: {
    abierta: boolean;
    cierreLimpioAnterior: boolean;
    favoritos: number;
    notas: number;
  } | null;
  catalogo: {
    presente: boolean;
    recursos: number;
  };
  /** Constante por diseno: la app no habla con el exterior. */
  redExterna: 'bloqueada';
}

// Contratos de la biblioteca expuestos al renderer (espejo de
// @vestigio/database; el renderer no importa el paquete de datos).

export interface RecursoResumenUI {
  id: string;
  slug: string;
  titulo: string;
  idioma: string;
  formato: string;
  estadoTexto: string;
  detalleTexto: string | null;
  numPaginas: number | null;
  numSegmentos: number;
}

export interface SegmentoUI {
  localizador: string;
  titulo: string | null;
  nivel: number | null;
  pagina: number | null;
  html: string | null;
  cuerpo: string;
}

export interface FichaUI extends RecursoResumenUI {
  derechos: string;
  origenSha256: string | null;
  origenAdquirido: string | null;
  rutaOriginal: string | null;
  bytes: number | null;
  segmentos: SegmentoUI[];
}

/** Resultado procedente de una coleccion ZIM (origen siempre visible). */
export interface ResultadoZimUI {
  titulo: string;
  libro: string;
  ruta: string;
  fragmento: string;
}

/** Coleccion ZIM tal como se muestra: la evaluacion es de la coleccion,
 *  no de cada uno de sus articulos (plan §8.4). */
export interface ColeccionZimUI {
  nombre: string;
  titulo: string | null;
  idioma: string | null;
  fecha: string | null;
  editor: string | null;
  articulos: number | null;
}

export interface EstadoZimUI {
  fase: string;
  colecciones: ColeccionZimUI[];
  detalle: string | null;
}

export type MotivoUI = 'exacta' | 'sin-tilde' | 'alias' | 'aproximada';

export interface CoincidenciaUI {
  recursoId: string;
  titulo: string;
  formato: string;
  idioma: string;
  localizador: string;
  tituloSeccion: string | null;
  pagina: number | null;
  fragmento: string;
  motivo: MotivoUI;
}

export interface FacetaUI {
  valor: string;
  etiqueta: string;
  cuenta: number;
}

export interface FiltrosUI {
  formatos?: string[];
  idiomas?: string[];
  modulos?: string[];
}

export interface ResultadoBusquedaUI {
  coincidencias: CoincidenciaUI[];
  expansiones: { original: string; anadido: string; tipo: string }[];
  expansionBloqueadaPor: string | null;
  sugerencias: { escrito: string; sugerido: string; distancia: number }[];
  error: { mensaje: string; posicion: number } | null;
  facetas: { formatos: FacetaUI[]; idiomas: FacetaUI[] };
  total: number;
}
