// Estado y contratos que el main expone al renderer. El renderer no importa
// @vestigio/database: todo lo que ve pasa por aqui, tipado y acotado.

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
  /** Tras "preparar para copiar" Vestigio ya no toca la carpeta. */
  preparadoParaCopiar: boolean;
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
  autor: string | null;
  fechaPublicacion: string | null;
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
  origenUrl: string | null;
  resumen: string | null;
  etiquetas: string[];
  modulos: string[];
  rutaOriginal: string | null;
  bytes: number | null;
  segmentos: SegmentoUI[];
}

export interface RelacionadoUI {
  id: string;
  titulo: string;
  formato: string;
  motivo: string;
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

// --- Espacio personal (bloque 12) -------------------------------------------

export type DestinoNotaUI = 'recurso' | 'segmento' | 'pagina' | 'ruta' | 'procedimiento';

export interface NotaUI {
  id: string;
  destinoTipo: DestinoNotaUI;
  recursoId: string;
  segmento: string | null;
  pagina: number | null;
  ancla: string | null;
  contexto: string | null;
  texto: string;
  creada: string;
  modificada: string | null;
}

export interface MarcadorUI {
  id: string;
  recursoId: string;
  localizador: string;
  etiqueta: string | null;
  creado: string;
}

export interface ColeccionUI {
  id: string;
  nombre: string;
  descripcion: string | null;
  creada: string;
  modificada: string | null;
  elementos: number;
  recursos: string[];
}

export interface ProgresoUI {
  recursoId: string;
  localizador: string | null;
  pagina: number | null;
  porcentaje: number | null;
  fallbackTexto: string | null;
  actualizado: string;
}

export interface RecienteUI {
  recursoId: string;
  localizador: string | null;
  visto: string;
}

export interface EntradaPapeleraUI {
  id: string;
  tipo: string;
  descripcion: string;
  borrado: string;
}

/** Todo el espacio personal de una vez: es poco y se pinta entero. */
export interface EspacioPersonalUI {
  disponible: boolean;
  /** Por que no hay espacio personal, si no lo hay (medio de solo lectura). */
  motivo: string | null;
  favoritos: string[];
  colecciones: ColeccionUI[];
  notas: NotaUI[];
  marcadores: MarcadorUI[];
  progreso: ProgresoUI[];
  recientes: RecienteUI[];
  papelera: EntradaPapeleraUI[];
  ajustes: Record<string, string>;
}

/** Operaciones aceptadas por el canal 'personal:mutar' (espejo acotado
 *  de OperacionMutacion; el main revalida con el contrato de @vestigio/database). */
export type OperacionPersonalUI =
  | { operacion: 'favorito-poner'; recursoId: string }
  | { operacion: 'favorito-quitar'; recursoId: string }
  | {
      operacion: 'nota-crear';
      id: string;
      destinoTipo: DestinoNotaUI;
      recursoId: string;
      segmento?: string;
      pagina?: number;
      ancla?: string;
      contexto?: string;
      texto: string;
    }
  | { operacion: 'nota-editar'; id: string; texto: string }
  | { operacion: 'nota-borrar'; id: string }
  | {
      operacion: 'marcador-poner';
      id: string;
      recursoId: string;
      localizador: string;
      etiqueta?: string;
    }
  | { operacion: 'marcador-quitar'; recursoId: string; localizador: string }
  | { operacion: 'coleccion-crear'; id: string; nombre: string; descripcion?: string }
  | { operacion: 'coleccion-renombrar'; id: string; nombre: string; descripcion?: string }
  | { operacion: 'coleccion-borrar'; id: string }
  | { operacion: 'coleccion-anadir'; coleccionId: string; recursoId: string }
  | { operacion: 'coleccion-quitar'; coleccionId: string; recursoId: string }
  | {
      operacion: 'progreso-guardar';
      recursoId: string;
      localizador: string;
      porcentaje: number;
      pagina?: number;
      fallbackTexto?: string;
    }
  | { operacion: 'reciente-registrar'; recursoId: string; localizador?: string }
  | { operacion: 'ajuste-guardar'; clave: string; valor: string }
  | { operacion: 'papelera-restaurar'; id: string }
  | { operacion: 'papelera-vaciar' };

export interface ResultadoMutacionUI {
  ok: boolean;
  estado: 'aplicada' | 'ya-aplicada' | 'desconocida' | 'rechazada';
  /** Mensaje accionable en castellano llano; null si todo fue bien. */
  mensaje: string | null;
}

// --- Respaldo, importacion y cierre -----------------------------------------

export interface ResultadoExportacionUI {
  ok: boolean;
  ruta: string | null;
  bytes: number | null;
  /** Cancelado por el usuario en el dialogo: no es un error. */
  cancelado: boolean;
  mensaje: string | null;
}

export interface InspeccionPaqueteUI {
  ok: boolean;
  cancelado: boolean;
  ruta: string | null;
  problemas: string[];
  avisos: string[];
  generado: string | null;
  app: string | null;
  corpus: string | null;
  resumen: {
    favoritos: number;
    colecciones: number;
    notas: number;
    marcadores: number;
    progreso: number;
  } | null;
}

export interface ResultadoImportacionUI {
  ok: boolean;
  modo: 'fusionar' | 'reemplazar' | null;
  filas: number;
  mensaje: string | null;
}

/** Informe de "cerrar y preparar para copiar o expulsar" (bloque 12, t.9). */
export interface InformeCierreUI {
  respaldo: 'hecho' | 'sin-cambios' | 'no-aplica' | 'fallido';
  rutaRespaldo: string | null;
  basesCerradas: boolean;
  kiwixDetenido: boolean;
  problemas: string[];
  /** Recordatorio honesto: esto no es la expulsion segura de Windows. */
  aviso: string;
}

// --- Doctor (bloque 16) ------------------------------------------------------

export interface ComprobacionUI {
  id: string;
  titulo: string;
  estado: 'bien' | 'aviso' | 'mal' | 'no-aplica';
  detalle: string;
  remedio: string | null;
  /** Presente solo si la comprobacion miro una parte, no el todo. */
  muestreo?: { revisados: number; total: number };
}

export interface InformeDoctorUI {
  generado: string;
  nivel: 'arranque' | 'rapido' | 'completo';
  comprobaciones: ComprobacionUI[];
  resumen: { bien: number; avisos: number; problemas: number };
  veredicto: 'operativo' | 'operativo-con-avisos' | 'degradado' | 'necesita-otra-copia';
  titular: string;
  /** Donde ha quedado escrito el informe, si se pudo escribir. */
  rutaInforme: string | null;
}
